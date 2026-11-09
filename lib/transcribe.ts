import type { Language } from "./types";

export const LANGUAGE_CODE: Record<Language, string> = { Hindi: "hi-IN", Gujarati: "gu-IN", Marathi: "mr-IN", English: "en-IN" };

export type TranscriptionResult = { status: "done"; text: string } | { status: "failed" } | { status: "not_configured" };

export interface Transcriber {
  transcribe(input: { bytes: Uint8Array; mime: string; language: Language }): Promise<TranscriptionResult>;
}

/** Used until a Sarvam key is set. The note is stored and a coordinator listens to it. */
export class MockTranscriber implements Transcriber {
  async transcribe(): Promise<TranscriptionResult> {
    return { status: "not_configured" };
  }
}

export class SarvamTranscriber implements Transcriber {
  constructor(
    private readonly apiKey: string,
    private readonly url = process.env.SARVAM_URL ?? "https://api.sarvam.ai/speech-to-text",
    private readonly model = process.env.SARVAM_MODEL ?? "saaras:v4",
  ) {}

  async transcribe({ bytes, mime, language }: { bytes: Uint8Array; mime: string; language: Language }): Promise<TranscriptionResult> {
    const form = new FormData();
    form.set("file", new Blob([Buffer.from(bytes)], { type: mime }), "voice-note.ogg");
    form.set("model", this.model);
    form.set("mode", "transcribe");
    form.set("language_code", LANGUAGE_CODE[language]);
    try {
      const res = await fetch(this.url, { method: "POST", headers: { "api-subscription-key": this.apiKey }, body: form, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return { status: "failed" };
      const body = (await res.json()) as { transcript?: string };
      return typeof body.transcript === "string" ? { status: "done", text: body.transcript.slice(0, 4000) } : { status: "failed" };
    } catch {
      return { status: "failed" };
    }
  }
}

export const getTranscriber = (): Transcriber => (process.env.SARVAM_API_KEY ? new SarvamTranscriber(process.env.SARVAM_API_KEY) : new MockTranscriber());
