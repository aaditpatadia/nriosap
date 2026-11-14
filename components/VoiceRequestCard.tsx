"use client";

import { useState } from "react";
import { VoiceNote, MAX_VOICE_SECONDS } from "./VoiceNote";

/** What to say, in the order that makes the work start fastest. */
export const VOICE_CHECKLIST: { title: string; detail: string }[] = [
  { title: "What you need done", detail: "One sentence is enough. For example: collect a file and drop it at an office." },
  { title: "Where, in Mumbai", detail: "The building, the area and the 6 digit PIN code. If there are two places, say both: pick up from, and drop at." },
  { title: "Who we meet", detail: "A name and a phone number of the person at each place." },
  { title: "When", detail: "The day, and the earliest and latest time that suits you." },
  { title: "How soon", detail: "Today, in the next few hours, or within two days." },
  { title: "How long it will take", detail: "Your own guess of the time once we are there. Minutes are fine." },
  { title: "What we carry", detail: "What it is, how heavy, what it is worth, and if it can break." },
  { title: "Anything special", detail: "The gate or security desk, the floor, a name to ask for, or something to avoid." },
];

const EXAMPLE = "Hello, this is Asha. Please collect a passport file from 12 Hill Road, Bandra West, PIN 400050. Ask for Mrs Mehta, phone 98200 00000. Drop it at Hiranandani, Powai, PIN 400076, with Mr Shah, phone 98200 11111. Tomorrow, any time between 10 and 1. It is urgent, I need it today if possible. It is a thin file, about 1 kilo, worth very little, and it will not take more than 15 minutes at each place. Thank you.";

/**
 * Say it instead of filling in the form. The note is stored for a person to listen to, and the person fills in the rest.
 * It sits inside the request form, so its own button sends the request.
 */
export function VoiceRequestCard({ familyId, canUpload, hasVoice, pending, onSaved }: { familyId: string; canUpload: boolean; hasVoice: boolean; pending: boolean; onSaved: (id: string, title: string) => void }) {
  const [recording, setRecording] = useState<"idle" | "recording" | "saving">("idle");
  const [preview, setPreview] = useState<{ url: string; seconds: number } | null>(null);
  return (
    <section id="voice" className="card grid gap-4 scroll-mt-4" aria-labelledby="voice-title" style={{ background: "var(--mint)", borderColor: "var(--mint-line)" }}>
      <div className="grid gap-1">
        <h2 id="voice-title" className="text-[length:var(--text-h2)] font-bold">Rather talk than type? Send a voice note</h2>
        <p className="text-[length:var(--text-small)]">Say it in your own words, in English, Hindi, Gujarati or Marathi. Your coordinator listens and sets everything up. Nothing starts and nothing is charged until you approve the price. Mumbai only for now.</p>
      </div>

      <div className="grid gap-2 rounded-2xl bg-surface p-4" aria-live="polite">
        <p className="font-semibold">{recording === "recording" ? "Keep going. Cover these:" : "To get this done fastest, tell us:"}</p>
        <ol className="grid gap-2 text-[length:var(--text-small)] sm:grid-cols-2">
          {VOICE_CHECKLIST.map((c, i) => (
            <li key={c.title} className="flex gap-3">
              <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full bg-[var(--mint-strong)] text-[length:var(--text-micro)] font-bold text-white">{i + 1}</span>
              <span><span className="font-semibold">{c.title}.</span> <span className="text-muted">{c.detail}</span></span>
            </li>
          ))}
        </ol>
        <details className="mt-1">
          <summary className="min-h-12 cursor-pointer py-3 text-[length:var(--text-small)] font-semibold text-accent">Hear how it sounds: an example</summary>
          <p className="rounded-xl bg-sunken p-3 text-[length:var(--text-small)] italic">&ldquo;{EXAMPLE}&rdquo;</p>
        </details>
        <p className="text-[length:var(--text-micro)] text-muted">Up to {MAX_VOICE_SECONDS / 60} minutes. Your coordinator listens to it. It is not sent to an AI service.</p>
      </div>

      {canUpload ? (
        <div className="flex flex-wrap items-center gap-3">
          <VoiceNote familyId={familyId} label={hasVoice ? "Record again" : "Record my voice note"} onSaved={onSaved} onStateChange={setRecording} onRecorded={(url, seconds) => setPreview({ url, seconds })} />
          {hasVoice && recording === "idle" && (
            <>
              <p role="status" className="chip" data-tone="ok">Voice note saved{preview ? ` (${Math.floor(preview.seconds / 60)}:${String(preview.seconds % 60).padStart(2, "0")})` : ""}</p>
              <button className="btn btn-primary" name="voiceOnly" value="1" formNoValidate disabled={pending}>{pending ? "Sending..." : "Send my voice note to my coordinator"}</button>
            </>
          )}
        </div>
      ) : <p className="text-muted">Voice notes can be sent once consent is on file.</p>}
      {preview && recording === "idle" && (
        <label className="grid gap-1 text-[length:var(--text-small)] font-semibold">Listen back before you send
          <audio controls src={preview.url} className="w-full" />
        </label>
      )}
    </section>
  );
}
