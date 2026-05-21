import { hashText } from "@orbit/core";
import type { ScreenCaptureFrame } from "../screen/screenCaptureTypes";
import type { LocalOcrEngine, OcrRecognitionResult } from "./ocrObservationAdapter";

export interface MockOcrEngineOptions {
  id?: string;
  languages?: string[];
  textByFrameHash?: Record<string, string>;
}

export class MockOcrEngine implements LocalOcrEngine {
  readonly id: string;
  readonly languages: string[];

  constructor(private readonly options: MockOcrEngineOptions = {}) {
    this.id = options.id ?? "mock-local-ocr";
    this.languages = options.languages ?? ["en", "zh-Hans"];
  }

  async recognize(frame: ScreenCaptureFrame): Promise<OcrRecognitionResult | undefined> {
    const text = this.options.textByFrameHash?.[frame.frameHash] ?? frame.ocrText;
    if (!text) return undefined;
    return {
      text,
      textHash: hashText(text),
      confidence: 0.96
    };
  }
}
