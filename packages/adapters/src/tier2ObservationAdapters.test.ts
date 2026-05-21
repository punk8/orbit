import { describe, expect, it } from "vitest";
import type { Event, ObservationInput, ObservationPermissionStatus } from "@orbit/core";
import { ingestEventsFromAdapter } from "@orbit/core";
import { AccessibilityObservationAdapter } from "./accessibility/accessibilityObservationAdapter";
import { BrowserMetadataAdapter } from "./browser/browserMetadataAdapter";
import { ClipboardObservationAdapter } from "./clipboard/clipboardObservationAdapter";
import { FileActivityAdapter } from "./filesystem/fileActivityAdapter";
import { TerminalObservationAdapter } from "./terminal/terminalObservationAdapter";

describe("Tier 2 observation adapters", () => {
  it("requires Accessibility permission and drops secure-field text", async () => {
    const denied = await readAdapter(
      new AccessibilityObservationAdapter({
        inputs: [accessibilityInput()],
        permission: accessibilityPermission("denied")
      })
    );
    expect(denied.events).toHaveLength(0);
    expect(denied.result.warnings[0]).toContain("needs permission");

    const secure = await readAdapter(
      new AccessibilityObservationAdapter({
        inputs: [
          accessibilityInput({
            accessibility: {
              text: "password=hunter2",
              textHash: "hash_secret",
              containsSecureField: true
            }
          })
        ],
        permission: accessibilityPermission("granted")
      })
    );
    expect(secure.events).toHaveLength(1);
    expect(JSON.stringify(secure.events[0])).not.toContain("hunter2");
    expect(secure.result.warnings).toContain(
      "Accessibility snapshot contained a secure field; raw text was dropped."
    );

    const protectedApp = await readAdapter(
      new AccessibilityObservationAdapter({
        inputs: [
          accessibilityInput({
            app: {
              name: "1Password",
              bundleId: "com.1password.1password",
              isProtected: true
            },
            accessibility: {
              text: "API token abc123",
              textHash: "hash_token"
            }
          })
        ],
        permission: accessibilityPermission("granted")
      })
    );
    expect(protectedApp.events[0]?.type).toBe("app_focus");
    expect(JSON.stringify(protectedApp.events[0])).not.toContain("abc123");
  });

  it("requires explicit filesystem allowlist roots", async () => {
    const blocked = await readAdapter(
      new FileActivityAdapter({
        inputs: [fileInput("orbit")],
        allowedFolders: []
      })
    );
    expect(blocked.events).toHaveLength(0);
    expect(blocked.result.warnings[0]).toContain("allowed folder");

    const allowed = await readAdapter(
      new FileActivityAdapter({
        inputs: [fileInput("orbit"), fileInput("other")],
        allowedFolders: [
          {
            id: "orbit",
            rootPath: "/Users/example/orbit",
            displayName: "Orbit",
            project: "orbit",
            enabled: true,
            includeGlobs: ["**/*"],
            excludeGlobs: ["node_modules/**"],
            defaultSensitivity: "internal"
          }
        ]
      })
    );
    expect(allowed.events).toHaveLength(1);
    expect(allowed.events[0]?.source.kind).toBe("filesystem");
    expect(allowed.events[0]?.context.project).toBe("orbit");
  });

  it("keeps clipboard capture hash-only by default", async () => {
    const stored = await readAdapter(
      new ClipboardObservationAdapter({
        enabled: true,
        inputs: [
          clipboardInput({
            redactedSummary: "Copied password=hunter2"
          })
        ]
      })
    );
    expect(stored.events).toHaveLength(1);
    expect(stored.events[0]?.source.kind).toBe("clipboard");
    expect(JSON.stringify(stored.events[0])).not.toContain("hunter2");
    expect(stored.events[0]?.content.text).toBeUndefined();
    expect(stored.events[0]?.content.summary).toBe("Clipboard changed (text).");
  });

  it("allows browser and terminal metadata only through approved paths", async () => {
    const blockedBrowser = await readAdapter(
      new BrowserMetadataAdapter({
        inputs: [browserInput()]
      })
    );
    expect(blockedBrowser.events).toHaveLength(0);
    expect(blockedBrowser.result.warnings[0]).toContain("approved path");

    const browser = await readAdapter(
      new BrowserMetadataAdapter({
        approvedPath: "explicit_import",
        inputs: [browserInput()]
      })
    );
    expect(browser.events[0]?.context.url).toBe("https://example.com/work");

    const blockedTerminal = await readAdapter(
      new TerminalObservationAdapter({
        inputs: [terminalInput()]
      })
    );
    expect(blockedTerminal.events).toHaveLength(0);
    expect(blockedTerminal.result.warnings[0]).toContain("shell integration");

    const terminal = await readAdapter(
      new TerminalObservationAdapter({
        approvedPath: "shell_integration",
        inputs: [terminalInput()]
      })
    );
    expect(terminal.events[0]?.source.kind).toBe("terminal");
    expect(terminal.events[0]?.context.project).toBe("orbit");
  });
});

async function readAdapter(adapter: Parameters<typeof ingestEventsFromAdapter>[0]): Promise<{
  events: Event[];
  result: Awaited<ReturnType<typeof ingestEventsFromAdapter>>;
}> {
  const events: Event[] = [];
  const result = await ingestEventsFromAdapter(adapter, {
    upsertEvent(event) {
      events.push(event);
      return true;
    }
  });
  return { events, result };
}

function accessibilityPermission(
  status: ObservationPermissionStatus["status"]
): ObservationPermissionStatus {
  return {
    kind: "accessibility",
    requiredFor: ["accessibility", "browser"],
    status,
    canRequestFromApp: false
  };
}

function baseInput(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    type: "accessibility_snapshot",
    tier: "tier2",
    sourceKind: "accessibility",
    occurredAt: "2026-05-21T09:00:00.000Z",
    runtimeSessionId: "tier2-test",
    sequence: 1,
    app: {
      name: "Cursor",
      bundleId: "com.todesktop.230313mzl4w4u92"
    },
    ...overrides
  };
}

function accessibilityInput(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return baseInput({
    accessibility: {
      text: "Review Orbit implementation notes",
      textHash: "hash_notes"
    },
    ...overrides
  });
}

function fileInput(rootId: string): ObservationInput {
  return baseInput({
    type: "file_activity",
    sourceKind: "filesystem",
    file: {
      rootId,
      relativePath: "packages/core/src/index.ts",
      operation: "modified",
      contentHash: "hash_file"
    }
  });
}

function clipboardInput(
  clipboard: Partial<NonNullable<ObservationInput["clipboard"]>>
): ObservationInput {
  return baseInput({
    type: "clipboard_change",
    sourceKind: "clipboard",
    clipboard: {
      contentType: "text",
      contentHash: "hash_clipboard",
      ...clipboard
    },
    raw: {
      text: "password=hunter2"
    }
  });
}

function browserInput(): ObservationInput {
  return baseInput({
    type: "browser_navigation",
    sourceKind: "browser",
    browser: {
      url: "https://example.com/work?token=secret#private",
      title: "Orbit planning"
    }
  });
}

function terminalInput(): ObservationInput {
  return baseInput({
    type: "terminal_command",
    sourceKind: "terminal",
    terminal: {
      sessionId: "shell-1",
      commandIndex: 1,
      command: "pnpm test",
      cwd: "/Users/example/orbit"
    }
  });
}
