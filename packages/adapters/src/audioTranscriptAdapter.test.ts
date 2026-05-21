import { describe, expect, it } from "vitest";
import type { Event } from "@orbit/core";
import { defaultProtectedAppRules, ingestEventsFromAdapter } from "@orbit/core";
import { mockTranscriptionProvider } from "@orbit/ai";
import { AudioObservationAdapter } from "./audio/audioObservationAdapter";
import { AudioObservationSession } from "./audio/audioObservationSession";
import { MockAudioCaptureNativeHelper } from "./audio/mockAudioCaptureNativeHelper";
import {
  audioPermission,
  type AudioCaptureScope,
  type AudioSegment
} from "./audio/audioCaptureTypes";
import { TranscriptObservationAdapter } from "./transcript/transcriptObservationAdapter";

describe("audio/transcript perception adapters", () => {
  it("requires microphone permission and respects paused state", async () => {
    const denied = await readAdapter(
      new AudioObservationAdapter({
        segments: [segment("audio_denied")],
        scope,
        permission: audioPermission("microphone", "denied")
      })
    );
    const paused = await readAdapter(
      new TranscriptObservationAdapter({
        segments: [segment("audio_paused")],
        scope,
        provider: mockTranscriptionProvider,
        policy: allowTranscriptPolicy(),
        permission: audioPermission("microphone", "granted"),
        paused: true
      })
    );

    expect(denied.events).toHaveLength(0);
    expect(denied.result.warnings[0]).toContain("microphone permission");
    expect(paused.events).toHaveLength(0);
    expect(paused.result.warnings[0]).toContain("paused");
  });

  it("produces redacted audio and transcript Events without raw audio", async () => {
    const segments = [
      segment("audio_meeting", {
        transcriptText: "Follow up with person@example.com about Goal 8D."
      })
    ];
    const audio = await readAdapter(
      new AudioObservationAdapter({
        segments,
        scope,
        permission: audioPermission("microphone", "granted")
      })
    );
    const transcript = await readAdapter(
      new TranscriptObservationAdapter({
        segments,
        scope,
        provider: mockTranscriptionProvider,
        policy: allowTranscriptPolicy(),
        permission: audioPermission("microphone", "granted")
      })
    );

    expect(audio.events[0]?.type).toBe("audio_segment");
    expect(audio.events[0]?.content.rawRef).toBeUndefined();
    expect(transcript.events[0]?.type).toBe("transcript_segment");
    expect(transcript.events[0]?.content.summary).toContain("[REDACTED]");
    expect(JSON.stringify(transcript.events[0])).not.toContain("person@example.com");
  });

  it("suppresses protected and failed-redaction transcripts", async () => {
    let calls = 0;
    const provider = {
      ...mockTranscriptionProvider,
      async transcribe(input: Parameters<typeof mockTranscriptionProvider.transcribe>[0]) {
        calls += 1;
        return mockTranscriptionProvider.transcribe(input);
      }
    };
    const result = await readAdapter(
      new TranscriptObservationAdapter({
        segments: [
          segment("audio_protected", {
            app: {
              name: "1Password",
              bundleId: "com.1password.1password",
              isProtected: true
            },
            transcriptText: "password=hunter2"
          }),
          segment("audio_failed", {
            sequence: 2,
            redactionState: "failed",
            transcriptText: "should not persist"
          })
        ],
        scope,
        provider,
        policy: allowTranscriptPolicy(),
        permission: audioPermission("microphone", "granted"),
        protectedApps: defaultProtectedAppRules()
      })
    );

    expect(result.events).toHaveLength(0);
    expect(result.result.warnings).toEqual(
      expect.arrayContaining([
        "Suppressed transcript for protected audio segment audio_protected.",
        "Skipped transcript for failed-redaction segment audio_failed."
      ])
    );
    expect(calls).toBe(0);
  });

  it("can start, pause, resume, flush, and stop explicit audio sessions", async () => {
    const session = new AudioObservationSession({
      helper: new MockAudioCaptureNativeHelper({
        segments: [segment("audio_flush")],
        permission: audioPermission("microphone", "granted")
      }),
      scope
    });

    expect((await session.start()).status).toBe("collecting");
    expect(await session.flush()).toHaveLength(1);
    expect(session.pause().status).toBe("paused");
    expect(await session.flush()).toHaveLength(0);
    expect(session.resume().status).toBe("collecting");
    expect(await session.flush()).toHaveLength(1);
    expect(session.stop().status).toBe("stopped");
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

function allowTranscriptPolicy(): ConstructorParameters<
  typeof TranscriptObservationAdapter
>[0]["policy"] {
  return {
    providerEnabled: true,
    canUseAudioForAI: true,
    canUseTranscriptForAI: true,
    allowExternal: false
  };
}

const scope: AudioCaptureScope = {
  kind: "microphone",
  label: "Goal 8D mock meeting",
  deviceId: "fixture-mic"
};

function segment(id: string, overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id,
    startedAt: "2026-05-21T00:10:00.000Z",
    endedAt: "2026-05-21T00:10:20.000Z",
    runtimeSessionId: "audio-runtime",
    sequence: 1,
    scope,
    app: {
      name: "Zoom",
      bundleId: "us.zoom.xos"
    },
    segmentHash: `${id}_hash`,
    durationMs: 20_000,
    redactedSummary: "Meeting discussion about explicit audio sessions.",
    transcriptText: "Discussed explicit meeting mode and local transcription.",
    transcriptLanguage: "en",
    transcriptConfidence: 0.9,
    ...overrides
  };
}
