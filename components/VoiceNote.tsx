"use client";

import { useRef, useState } from "react";
import { uploadFile } from "@/lib/upload-client";

const MAX_SECONDS = 180;

/** Records in the browser and stores the note in the vault. It is kept for a person to listen to and is not sent to AI. */
export function VoiceNote({ familyId, onSaved }: { familyId: string; onSaved: (id: string, title: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "saving">("idle");
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("saving");
        const type = r.mimeType.split(";")[0] || "audio/webm";
        const title = `Voice note.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`;
        const up = await uploadFile({ familyId, file: new File(parts, title, { type }), purposes: ["store"], voice: true });
        if (up.ok && up.documentId) onSaved(up.documentId, "Voice note");
        else setError(up.reason ?? "That did not save.");
        setState("idle");
      };
      rec.current = r;
      r.start();
      setState("recording");
      setTimeout(() => { if (r.state === "recording") r.stop(); }, MAX_SECONDS * 1000);
    } catch {
      setError("We could not use your microphone.");
    }
  }

  if (typeof MediaRecorder === "undefined") return null;
  return (
    <>
      {state === "recording"
        ? <button type="button" className="btn btn-secondary" onClick={() => rec.current?.stop()}><span aria-hidden className="orb" data-tone="warn" /> Stop recording</button>
        : <button type="button" className="btn btn-secondary" disabled={state === "saving"} onClick={start}>{state === "saving" ? "Saving..." : "Record a voice note"}</button>}
      {error && <p role="alert" className="w-full text-danger">{error}</p>}
    </>
  );
}
