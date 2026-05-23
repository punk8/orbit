import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hashText, type ObservationPermissionStatus } from "@orbit/core";
import type { LocalOcrEngine, OcrRecognitionResult } from "../ocr/ocrObservationAdapter";
import type { ScreenCaptureFrame, ScreenCaptureScope } from "./screenCaptureTypes";
import { screenPermission } from "./screenCaptureTypes";

export interface ScreenOcrCaptureResult {
  frame?: ScreenCaptureFrame;
  ocr?: ScreenOcrTextResult;
  permission: ObservationPermissionStatus;
  error?: ScreenOcrCaptureError;
  warnings: string[];
}

export interface ScreenOcrTextResult {
  text: string;
  confidence?: number;
  languages: string[];
}

export type ScreenOcrCaptureErrorKind =
  | "permission_denied"
  | "unsupported_macos"
  | "timeout"
  | "ocr_failed"
  | "unknown_failure";

export interface ScreenOcrCaptureError {
  kind: ScreenOcrCaptureErrorKind;
  reason?: string;
  message?: string;
}

export interface ScreenOcrCaptureHelper {
  captureOnce(): Promise<ScreenOcrCaptureResult>;
}

export interface MacScreenOcrCaptureHelperOptions {
  helperPath?: string;
  timeoutMs?: number;
  runtimeSessionId?: string;
  sequence?: number;
  allowRawFrameStorage?: boolean;
  sidecarRoot?: string;
}

interface HelperSuccessPayload {
  ok: true;
  capturedAt: string;
  runtimeSessionId?: string;
  displayId?: string;
  width?: number;
  height?: number;
  frameHash: string;
  rawImageBase64?: string;
  appName?: string;
  bundleId?: string;
  pid?: number;
  windowTitle?: string;
  ocrText?: string;
  ocrConfidence?: number;
  languages?: string[];
  errorKind?: ScreenOcrCaptureErrorKind;
  message?: string;
  warnings?: string[];
}

interface HelperFailurePayload {
  ok: false;
  reason?: string;
  message?: string;
  warnings?: string[];
}

type HelperPayload = HelperSuccessPayload | HelperFailurePayload;

export class MacScreenOcrCaptureHelper implements ScreenOcrCaptureHelper {
  private readonly helperPath: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: MacScreenOcrCaptureHelperOptions = {}) {
    this.helperPath = options.helperPath ?? defaultMacScreenOcrHelperPath();
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async captureOnce(): Promise<ScreenOcrCaptureResult> {
    const parseOptions: Pick<
      MacScreenOcrCaptureHelperOptions,
      "runtimeSessionId" | "sequence" | "allowRawFrameStorage" | "sidecarRoot"
    > = {};
    if (this.options.runtimeSessionId) parseOptions.runtimeSessionId = this.options.runtimeSessionId;
    if (this.options.sequence !== undefined) parseOptions.sequence = this.options.sequence;
    if (this.options.allowRawFrameStorage !== undefined) {
      parseOptions.allowRawFrameStorage = this.options.allowRawFrameStorage;
    }
    if (this.options.sidecarRoot) parseOptions.sidecarRoot = this.options.sidecarRoot;
    try {
      const output = await runSwiftHelper(this.helperPath, this.timeoutMs);
      return parseMacScreenOcrCapturePayload(output, parseOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = message.toLowerCase().includes("timed out") ? "timeout" : "helper_exited";
      return parseMacScreenOcrCapturePayload(
        JSON.stringify({ ok: false, reason, message }),
        parseOptions
      );
    }
  }
}

export class CapturedTextOcrEngine implements LocalOcrEngine {
  readonly id = "apple-vision-ocr";
  readonly languages: string[];

  constructor(private readonly ocrByFrameHash: Map<string, ScreenOcrTextResult>) {
    const first = [...ocrByFrameHash.values()][0];
    this.languages = first?.languages.length ? first.languages : ["en-US", "zh-Hans"];
  }

  async recognize(frame: ScreenCaptureFrame): Promise<OcrRecognitionResult | undefined> {
    const ocr = this.ocrByFrameHash.get(frame.frameHash);
    if (!ocr?.text.trim()) return undefined;
    return {
      text: ocr.text,
      textHash: hashText(ocr.text),
      ...(ocr.confidence !== undefined ? { confidence: ocr.confidence } : {})
    };
  }
}

export function parseMacScreenOcrCapturePayload(
  raw: string,
  options: Pick<
    MacScreenOcrCaptureHelperOptions,
    "runtimeSessionId" | "sequence" | "allowRawFrameStorage" | "sidecarRoot"
  > = {}
): ScreenOcrCaptureResult {
  const payload = JSON.parse(raw) as HelperPayload;
  if (!payload.ok) {
    return {
      permission: permissionFromFailure(payload),
      error: errorFromHelperPayload(payload),
      warnings: [...(payload.warnings ?? []), payload.message ?? payload.reason ?? "Capture failed."]
    };
  }

  const runtimeSessionId =
    options.runtimeSessionId ?? payload.runtimeSessionId ?? `manual-screen-ocr-${payload.frameHash}`;
  const sequence = options.sequence ?? 1;
  const scope: ScreenCaptureScope = {
    kind: "display",
    label: payload.displayId ? `Display ${payload.displayId}` : "Main Display"
  };
  if (payload.displayId) scope.displayId = payload.displayId;

  const frame: ScreenCaptureFrame = {
    id: `manual_screen_${payload.frameHash.slice(0, 16)}`,
    capturedAt: payload.capturedAt,
    runtimeSessionId,
    sequence,
    scope,
    frameHash: payload.frameHash,
    redactedSummary: "Manual screen/OCR capture recorded without storing raw screenshot bytes."
  };
  if (payload.appName) {
    frame.app = {
      name: payload.appName,
      ...(payload.bundleId ? { bundleId: payload.bundleId } : {}),
      ...(payload.pid ? { pid: payload.pid } : {})
    };
  }
  if (payload.windowTitle) {
    frame.window = {
      title: payload.windowTitle
    };
  }
  if (payload.width) frame.width = payload.width;
  if (payload.height) frame.height = payload.height;
  const rawSidecar = writeRawFrameSidecar(payload, options);
  if (rawSidecar) {
    frame.rawLocalRef = rawSidecar.localRef;
    frame.sizeBytes = rawSidecar.sizeBytes;
  }

  const result: ScreenOcrCaptureResult = {
    frame,
    permission: screenPermission("granted"),
    warnings: payload.warnings ?? []
  };
  if (payload.errorKind) {
    result.error = {
      kind: payload.errorKind,
      ...(payload.message ? { message: payload.message } : {})
    };
  }
  if (payload.ocrText?.trim()) {
    result.ocr = {
      text: payload.ocrText,
      ...(payload.ocrConfidence !== undefined ? { confidence: payload.ocrConfidence } : {}),
      languages: payload.languages?.length ? payload.languages : ["en-US", "zh-Hans"]
    };
  }
  return result;
}

function writeRawFrameSidecar(
  payload: HelperSuccessPayload,
  options: Pick<MacScreenOcrCaptureHelperOptions, "allowRawFrameStorage" | "sidecarRoot">
): { localRef: string; sizeBytes: number } | undefined {
  if (!options.allowRawFrameStorage || !options.sidecarRoot || !payload.rawImageBase64) {
    return undefined;
  }

  const bytes = Buffer.from(payload.rawImageBase64, "base64");
  if (bytes.byteLength === 0) return undefined;
  mkdirSync(options.sidecarRoot, { recursive: true });
  const filename = `${payload.frameHash.replaceAll(/[^0-9A-Za-z_-]/g, "_")}.png`;
  const localRef = join(options.sidecarRoot, filename);
  writeFileSync(localRef, bytes);
  return {
    localRef,
    sizeBytes: bytes.byteLength
  };
}

export function defaultMacScreenOcrHelperPath(): string {
  const packagedRelativePath = "native/screen-ocr-helper/Sources/main.swift";
  const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedCandidate = join(resourcesPath, packagedRelativePath);
    if (existsSync(packagedCandidate)) return packagedCandidate;
  }

  const relativePath = "apps/desktop/native/screen-ocr-helper/Sources/main.swift";
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(process.cwd(), relativePath);
}

function permissionFromFailure(payload: HelperFailurePayload): ObservationPermissionStatus {
  if (payload.reason === "screen_recording_permission_denied") return screenPermission("denied");
  if (payload.reason === "screen_recording_permission_not_determined") {
    return screenPermission("not_determined");
  }
  return screenPermission("unknown");
}

function errorFromHelperPayload(
  payload: Pick<HelperFailurePayload, "reason" | "message">
): ScreenOcrCaptureError {
  const reason = payload.reason;
  const kind: ScreenOcrCaptureErrorKind =
    reason === "screen_recording_permission_denied" ||
    reason === "screen_recording_permission_not_determined"
      ? "permission_denied"
      : reason === "unsupported_macos"
        ? "unsupported_macos"
        : reason === "timeout"
          ? "timeout"
          : reason === "ocr_failed"
            ? "ocr_failed"
            : "unknown_failure";
  return {
    kind,
    ...(reason ? { reason } : {}),
    ...(payload.message ? { message: payload.message } : {})
  };
}

async function runSwiftHelper(helperPath: string, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("swift", [helperPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Screen/OCR helper timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const line = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .at(-1);
      if (!line) {
        reject(new Error(stderr.trim() || `Screen/OCR helper exited with code ${code}.`));
        return;
      }
      resolvePromise(line);
    });
  });
}
