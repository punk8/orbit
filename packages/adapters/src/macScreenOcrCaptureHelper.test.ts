import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultMacScreenOcrHelperPath,
  parseMacScreenOcrCapturePayload
} from "./screen/macScreenOcrCaptureHelper";

describe("macOS screen/OCR capture helper parsing", () => {
  it("converts one-shot helper JSON into a screen frame and OCR result", () => {
    const parsed = parseMacScreenOcrCapturePayload(
      JSON.stringify({
        ok: true,
        capturedAt: "2026-05-22T01:02:03.000Z",
        runtimeSessionId: "manual-screen-ocr-2026",
        displayId: "1",
        width: 1440,
        height: 900,
        frameHash: "abc123",
        appName: "Cursor",
        bundleId: "com.todesktop.230313mzl4w4u92",
        pid: 123,
        windowTitle: "Orbit - Screen OCR",
        ocrText: "Orbit 支持 screen OCR",
        ocrConfidence: 0.91,
        languages: ["zh-Hans", "en-US"]
      })
    );

    expect(parsed.frame).toBeDefined();
    const frame = parsed.frame!;
    expect(frame.runtimeSessionId).toBe("manual-screen-ocr-2026");
    expect(frame.scope.kind).toBe("display");
    expect(frame.scope.displayId).toBe("1");
    expect(frame.app?.name).toBe("Cursor");
    expect(frame.window?.title).toBe("Orbit - Screen OCR");
    expect(frame.frameHash).toBe("abc123");
    expect(frame.rawLocalRef).toBeUndefined();
    expect(parsed.ocr?.text).toBe("Orbit 支持 screen OCR");
    expect(parsed.ocr?.confidence).toBe(0.91);
    expect(parsed.ocr?.languages).toEqual(["zh-Hans", "en-US"]);
  });

  it("returns a permission warning without a frame when helper reports missing permission", () => {
    const parsed = parseMacScreenOcrCapturePayload(
      JSON.stringify({
        ok: false,
        reason: "screen_recording_permission_denied",
        message: "Screen Recording permission is required."
      })
    );

    expect(parsed.frame).toBeUndefined();
    expect(parsed.permission.status).toBe("denied");
    expect(parsed.error).toMatchObject({
      kind: "permission_denied",
      reason: "screen_recording_permission_denied"
    });
    expect(parsed.warnings).toContain("Screen Recording permission is required.");
  });

  it("maps structured helper failures for unsupported macOS, timeout, OCR, and unknown errors", () => {
    expect(
      parseMacScreenOcrCapturePayload(
        JSON.stringify({
          ok: false,
          reason: "unsupported_macos",
          message: "ScreenCaptureKit requires macOS 12.3 or later."
        })
      ).error
    ).toMatchObject({ kind: "unsupported_macos" });

    expect(
      parseMacScreenOcrCapturePayload(
        JSON.stringify({
          ok: false,
          reason: "timeout",
          message: "Screen/OCR helper timed out."
        })
      ).error
    ).toMatchObject({ kind: "timeout" });

    expect(
      parseMacScreenOcrCapturePayload(
        JSON.stringify({
          ok: true,
          capturedAt: "2026-05-22T01:02:03.000Z",
          frameHash: "ocrfail123",
          errorKind: "ocr_failed",
          message: "Vision OCR failed.",
          warnings: ["Vision OCR failed."]
        })
      ).error
    ).toMatchObject({ kind: "ocr_failed" });

    expect(
      parseMacScreenOcrCapturePayload(
        JSON.stringify({
          ok: false,
          reason: "helper_exited",
          message: "Unexpected helper exit."
        })
      ).error
    ).toMatchObject({ kind: "unknown_failure" });
  });

  it("prefers the packaged app-relative screen/OCR helper path when available", () => {
    const root = mkdtempSync(join(tmpdir(), "orbit-packaged-helper-path-"));
    const helperPath = join(root, "native/screen-ocr-helper/Sources/main.swift");
    mkdirSync(join(root, "native/screen-ocr-helper/Sources"), { recursive: true });
    writeFileSync(helperPath, "print(\"helper\")");
    const original = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    (process as typeof process & { resourcesPath?: string }).resourcesPath = root;
    try {
      expect(defaultMacScreenOcrHelperPath()).toBe(helperPath);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(process, "resourcesPath");
      } else {
        (process as typeof process & { resourcesPath?: string }).resourcesPath = original;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
