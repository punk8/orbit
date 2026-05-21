import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOpenAICompatibleVisionProvider,
  mockVisionProvider,
  type VisionSummaryInput
} from "./vision";

const servers: Array<{ close(callback?: (error?: Error) => void): void }> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it("can send bounded image bytes without exposing the local image path", async () => {
    const imagePath = writeFixtureImage();
    let requestBody: unknown;
    const baseUrl = await startProviderServer(async (request, response) => {
      requestBody = JSON.parse(await readRequestBody(request));
      writeJson(response, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Image vision",
                summary: "Provider inspected a bounded image input.",
                keyInsights: ["Image payload was accepted."],
                decisions: [],
                followUps: [],
                confidence: 0.88
              })
            }
          }
        ]
      });
    });
    const provider = createOpenAICompatibleVisionProvider({
      baseUrl,
      model: "vision-test-model",
      maxImageBytes: 1024
    });

    const output = await provider.summarizeVision(
      makeVisionInput({
        image: {
          localPath: imagePath,
          mimeType: "image/png",
          filename: "frame.png",
          width: 64,
          height: 64
        },
        budget: {
          maxInputChars: 500,
          maxOutputTokens: 300,
          maxImagePixels: 10_000,
          maxImageBytes: 1024
        }
      })
    );

    const serialized = JSON.stringify(requestBody);
    expect(output.summary).toContain("bounded image");
    expect(serialized).toContain("image_url");
    expect(serialized).toContain("data:image/png;base64");
    expect(serialized).toContain("frame.png");
    expect(serialized).not.toContain(imagePath);
  });

  it("blocks image inputs that exceed image budgets", async () => {
    const imagePath = writeFixtureImage();
    const provider = createOpenAICompatibleVisionProvider({
      baseUrl: "http://localhost:1",
      model: "vision-test-model",
      maxImageBytes: 1
    });

    await expect(
      provider.summarizeVision(
        makeVisionInput({
          image: {
            localPath: imagePath,
            mimeType: "image/png",
            width: 128,
            height: 128
          },
          budget: {
            maxInputChars: 500,
            maxOutputTokens: 300,
            maxImagePixels: 100,
            maxImageBytes: 1
          }
        })
      )
    ).rejects.toThrow(/size budget|pixel budget/i);
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

function writeFixtureImage(): string {
  const dir = mkdtempSync(join(tmpdir(), "orbit-vision-test-"));
  tempDirs.push(dir);
  const imagePath = join(dir, "frame.png");
  writeFileSync(imagePath, Buffer.from("fake-png-orbit-frame"));
  return imagePath;
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
