import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ObservationInput } from "@orbit/core";

export interface Tier1MacHelperEvent {
  type: "frontmost_app_changed";
  occurredAt: string;
  appName?: string;
  bundleId?: string;
  pid?: number;
  windowTitle?: string;
}

export interface Tier1MacObserverOptions {
  runtimeSessionId: string;
  helperPath?: string;
  swiftExecutable?: string;
}

export class Tier1MacObserver {
  private process: ChildProcess | undefined;
  private sequence = 0;
  private buffer = "";

  constructor(private readonly options: Tier1MacObserverOptions) {}

  start(
    onInput: (input: ObservationInput) => void,
    onWarning: (warning: string) => void,
    onExit: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void {
    if (this.process) return;
    if (process.platform !== "darwin") {
      throw new Error("Tier 1 macOS observation requires darwin.");
    }
    const helperPath = resolveMacObserverHelperPath(this.options.helperPath);
    if (!existsSync(helperPath)) {
      throw new Error(`macOS observer helper not found: ${helperPath}`);
    }
    const executable =
      this.options.swiftExecutable ?? process.env.ORBIT_SWIFT_EXECUTABLE ?? "swift";
    const child = spawn(executable, [helperPath, "--observe"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.process = child;
    child.stdout?.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as Tier1MacHelperEvent;
          for (const input of tier1MacHelperEventToObservationInputs(
            event,
            this.options.runtimeSessionId,
            () => this.nextSequence()
          )) {
            onInput(input);
          }
        } catch (error) {
          onWarning(`Ignored malformed macOS observer line: ${formatUnknownError(error)}`);
        }
      }
    });
    child.stderr?.on("data", (chunk) => {
      const warning = chunk.toString().trim();
      if (warning) onWarning(warning);
    });
    child.on("exit", (code, signal) => {
      this.process = undefined;
      onExit(code, signal);
    });
  }

  stop(): void {
    if (!this.process) return;
    this.process.kill("SIGTERM");
    this.process = undefined;
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }
}

export function tier1MacHelperEventToObservationInputs(
  event: Tier1MacHelperEvent,
  runtimeSessionId: string,
  nextSequence: () => number
): ObservationInput[] {
  const app = {
    name: event.appName ?? "Unknown app",
    ...(event.bundleId ? { bundleId: event.bundleId } : {}),
    ...(event.pid ? { pid: event.pid } : {})
  };
  const appFocus: ObservationInput = {
    type: "app_focus",
    tier: "tier1",
    sourceKind: "desktop",
    occurredAt: event.occurredAt,
    observedAt: event.occurredAt,
    runtimeSessionId,
    sequence: nextSequence(),
    app
  };
  if (!event.windowTitle) return [appFocus];
  return [
    appFocus,
    {
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: event.occurredAt,
      observedAt: event.occurredAt,
      runtimeSessionId,
      sequence: nextSequence(),
      app,
      window: {
        title: event.windowTitle
      }
    }
  ];
}

export function resolveMacObserverHelperPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (process.env.ORBIT_MAC_OBSERVER_HELPER) return process.env.ORBIT_MAC_OBSERVER_HELPER;
  const packagedRelativePath = "native/macos-observer/Sources/main.swift";
  const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedCandidate = join(resourcesPath, packagedRelativePath);
    if (existsSync(packagedCandidate)) return packagedCandidate;
  }

  const relativePath = "apps/desktop/native/macos-observer/Sources/main.swift";
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const candidates = [
    resolve(process.env.INIT_CWD ?? process.cwd(), relativePath),
    resolve(process.cwd(), "native/macos-observer/Sources/main.swift"),
    resolve(process.cwd(), relativePath)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
