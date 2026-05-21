import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOpenAICompatibleVisionProvider,
  mockVisionProvider,
  type VisionSummaryInput
} from "./vision";

const servers: Array<{ close(callback?: (error?: Error) => void): void }> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("vision providers", () => {
  it("produces deterministic mock vision summaries from bounded screen context", async () => {
    const output = await mockVisionProvider.summarizeVision(makeVisionInput());

    expect(output.provider.kind).toBe("mock");
    expect(output.title).toBe("Vision summary: Cursor");
    expect(output.summary).toContain("Settings scrolling issue");
    expect(output.keyInsights[0]).toContain("Settings scrolling issue");
    expect(output.metadata.frameHash).toBe("frame_hash_1");
  });

  it("blocks provider calls when source policy disallows AI or redaction failed", async () => {
    await expect(
      mockVisionProvider.summarizeVision(
        makeVisionInput({
          policy: {
            canUseForAI: false,
            allowExternal: false,
            exportEligible: false,
            redactionState: "none"
          }
        })
      )
    ).rejects.toThrow(/does not allow AI/);

    await expect(
      mockVisionProvider.summarizeVision(
        makeVisionInput({
          policy: {
            canUseForAI: true,
            allowExternal: false,
            exportEligible: false,
            redactionState: "failed"
          }
        })
      )
    ).rejects.toThrow(/redaction failed/i);
  });

  it("calls OpenAI-compatible vision with local summaries instead of raw image refs", async () => {
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Provider vision",
                summary: "Provider summarized visible work state.",
                keyInsights: ["Visible issue is the settings scroll split."],
                decisions: [],
                followUps: ["Verify Activity evidence."],
                confidence: 0.9
              })
            }
          }
        ]
      });
    });
    const provider = createOpenAICompatibleVisionProvider({
      baseUrl,
      model: "vision-test-model",
      apiKey: "test-key"
    });
    const output = await provider.summarizeVision(
      makeVisionInput({
        imageLocalRef: "sidecar://raw/frame.png"
      })
    );

    expect(output.provider.kind).toBe("openai-compatible");
    expect(output.summary).toContain("Provider summarized");
    expect(JSON.stringify(requestBody)).toContain("Settings scrolling issue");
    expect(JSON.stringify(requestBody)).not.toContain("sidecar://raw/frame.png");
  });
});

function makeVisionInput(
  overrides: Partial<VisionSummaryInput> & { imageLocalRef?: string } = {}
): VisionSummaryInput {
  void overrides.imageLocalRef;
  return {
    language: "en",
    source: {
      eventId: "event_screen_1",
      sourcePointer: "screen://capture/runtime/window/frame_hash_1#1",
      timestamp: "2026-05-21T00:00:00.000Z",
      app: "Cursor",
      windowTitle: "Orbit Settings"
    },
    screen: {
      summary: "Settings scrolling issue is visible in the app.",
      frameHash: "frame_hash_1",
      width: 1280,
      height: 720
    },
    ocr: {
      text: "AI provider and privacy panes should scroll independently.",
      textHash: "ocr_hash_1",
      languages: ["en"]
    },
    policy: {
      canUseForAI: true,
      allowExternal: true,
      exportEligible: false,
      redactionState: "none"
    },
    budget: {
      maxInputChars: 500,
      maxOutputTokens: 300,
      maxImagePixels: 320_000
    },
    ...overrides
  };
}

async function startProviderServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void
): Promise<string> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, body: unknown): void {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}
