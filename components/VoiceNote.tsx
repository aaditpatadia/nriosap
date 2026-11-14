"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/upload-client";

export const MAX_VOICE_SECONDS = 180;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Records in the browser and stores the note in the vault. It is kept for a person to listen to and is not sent to AI.
 * While recording it shows a timer and can show what to cover, so the person does not have to remember.
 */
export function VoiceNote({ familyId, onSaved, onRecorded, onStateChange, label = "Record a voice note" }: {
  familyId: string;
  onSaved: (id: string, title: string) => void;
  /** Gives back a local address to play the recording, and how long it was. */
  onRecorded?: (url: string, seconds: number) => void;
  onStateChange?: (state: "idle" | "recording" | "saving") => void;
  label?: string;
}) {
  const [state, setStateRaw] = useState<"idle" | "recording" | "saving">("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const setState = (s: "idle" | "recording" | "saving") => { setStateRaw(s); onStateChange?.(s); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      let length = 0;
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        if (timer.current) clearInterval(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        setState("saving");
        const type = r.mimeType.split(";")[0] || "audio/webm";
        const title = `Voice note.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`;
        const file = new File(parts, title, { type });
        const up = await uploadFile({ familyId, file, purposes: ["store"], voice: true });
        if (up.ok && up.documentId) { onSaved(up.documentId, "Voice note"); onRecorded?.(URL.createObjectURL(file), length); }
        else setError(up.reason ?? "That did not save.");
        setState("idle");
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => { length += 1; setSeconds(length); if (length >= MAX_VOICE_SECONDS && r.state === "recording") r.stop(); }, 1000);
    } catch {
      setError("We could not use your microphone. Please allow it in your browser, or type your request instead.");
    }
  }

  if (typeof MediaRecorder === "undefined") return null;
  return (
    <>
      {state === "recording" ? (
        <>
          <button type="button" className="btn btn-primary" onClick={() => rec.current?.stop()}><span aria-hidden className="orb" data-tone="warn" /> Stop and save</button>
          <p role="timer" aria-live="off" className="font-semibold tabular-nums">{clock(seconds)} <span className="font-normal text-muted">of {clock(MAX_VOICE_SECONDS)}</span></p>
        </>
      ) : (
        <button type="button" className="btn btn-secondary" disabled={state === "saving"} onClick={start}>{state === "saving" ? "Saving..." : label}</button>
      )}
      {error && <p role="alert" className="w-full text-danger">{error}</p>}
    </>
  );
}
