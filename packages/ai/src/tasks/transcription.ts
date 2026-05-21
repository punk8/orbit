export type TranscriptionProviderKind = "disabled" | "mock" | "local" | "openai-compatible";

export interface TranscriptionInput {
  segmentId: string;
  segmentHash: string;
  startedAt: string;
  durationMs: number;
  app?: string;
  scopeLabel?: string;
  redactedAudioSummary?: string;
  fixtureTranscript?: string;
  policy: {
    canUseForAI: boolean;
    allowExternal: boolean;
    redactionState: "none" | "redacted" | "failed";
  };
}

export interface TranscriptionOutput {
  text: string;
  language?: string;
  confidence: number;
  provider: {
    id: string;
    kind: TranscriptionProviderKind;
    model?: string;
  };
  redactionState: "none" | "redacted" | "failed";
}

export interface TranscriptionProvider {
  id: string;
  kind: TranscriptionProviderKind;
  enabled: boolean;
  name: string;
  model?: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}

export class TranscriptionProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionProviderError";
  }
}

export const disabledTranscriptionProvider: TranscriptionProvider = {
  id: "disabled_transcription",
  kind: "disabled",
  enabled: false,
  name: "disabled",
  async transcribe(): Promise<TranscriptionOutput> {
    throw new TranscriptionProviderError("Transcription provider is disabled.");
  }
};

export const mockTranscriptionProvider: TranscriptionProvider = {
  id: "mock_transcription",
  kind: "mock",
  enabled: true,
  name: "mock_transcription",
  model: "mock-transcription-v1",
  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    assertTranscriptionPolicyAllowsUse(input, false);
    return {
      text:
        input.fixtureTranscript ??
        input.redactedAudioSummary ??
        `Mock transcript for ${input.scopeLabel ?? input.segmentId}.`,
      language: "en",
      confidence: 0.84,
      provider: {
        id: "mock_transcription",
        kind: "mock",
        model: "mock-transcription-v1"
      },
      redactionState: input.policy.redactionState
    };
  }
};

export function assertTranscriptionPolicyAllowsUse(
  input: TranscriptionInput,
  external: boolean
): void {
  if (!input.policy.canUseForAI) {
    throw new TranscriptionProviderError("Transcription source policy does not allow AI use.");
  }
  if (input.policy.redactionState === "failed") {
    throw new TranscriptionProviderError(
      "Transcription redaction failed; provider call is blocked."
    );
  }
  if (external && !input.policy.allowExternal) {
    throw new TranscriptionProviderError(
      "Transcription source policy does not allow external provider use."
    );
  }
}
