"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { DOCUMENT_CATEGORIES } from "@/lib/request-engine";
import { uploadFile } from "@/lib/upload-client";
import { PURPOSE_LABEL, PURPOSES, type Purpose } from "@/lib/upload-rules";

const DEFAULTS: Purpose[] = ["read_records", "store"];
const subscribeNothing = () => () => {};

export function UploadForm({ familyId, blocked, purposeFixed, onDone }: { familyId: string; blocked?: string; purposeFixed?: Purpose[]; onDone?: (documentId: string, name: string) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [purposes, setPurposes] = useState<Purpose[]>(purposeFixed ?? DEFAULTS);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Uploading needs the script loaded, so the button waits for it.
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);

  async function send(file: File | undefined) {
    if (!file) return setMsg({ ok: false, text: "Please choose a file." });
    setBusy(file.name);
    setProgress(0);
    setMsg(null);
    const r = await uploadFile({ familyId, file, purposes, category, onProgress: setProgress });
    if (!r.ok) setMsg({ ok: false, text: r.reason ?? "That did not upload. Please try again." });
    else {
      setMsg({ ok: true, text: r.needsCheck ? "Saved. A coordinator will check the details before anyone relies on them." : "Saved and read." });
      if (input.current) input.current.value = "";
      if (r.documentId) onDone?.(r.documentId, file.name);
      router.refresh();
    }
    setBusy(null);
  }

  if (blocked) return <p className="card text-muted">{blocked}</p>;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void send(input.current?.files?.[0]); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files[0]); }}
      className="card drop grid gap-4"
      data-over={over}
    >
      <h2 className="section-title">Add a document</h2>
      <p className="text-[length:var(--text-small)] text-muted">{over ? "Drop it here." : "Drag a file here, choose one, or take a photo."}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="field">File (PDF or photo, up to 4 MB)<input ref={input} className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
        <label className="field">Category
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Let Ally sort it</option>
            {Object.entries(DOCUMENT_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <label className="btn btn-secondary w-fit cursor-pointer md:hidden">Take a photo<input type="file" className="sr-only" accept="image/*" capture="environment" onChange={(e) => send(e.target.files?.[0])} /></label>
      {!purposeFixed && (
        <fieldset className="grid gap-2">
          <legend className="font-semibold">What may the desk do with this one?</legend>
          {PURPOSES.map((p) => (
            <label key={p} className="flex min-h-12 items-center gap-3">
              <input type="checkbox" className="size-6" checked={purposes.includes(p)} onChange={(e) => setPurposes(e.target.checked ? [...purposes, p] : purposes.filter((x) => x !== p))} />
              <span>{PURPOSE_LABEL[p]}</span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-[length:var(--text-small)] text-muted">If you allow reading, an AI service outside India reads the file to pull out key facts. A person checks anything it is unsure of.</p>
      <button className="btn btn-primary" disabled={!!busy || !ready}>{busy ? "Reading..." : "Upload"}</button>
      {busy && (
        <div className="grid gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Uploading" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${progress})` }} /></div>
          <p role="status" className="text-muted">Working on {busy}</p>
        </div>
      )}
      {msg && <p role="status" aria-live="polite" className={msg.ok ? "text-ok" : "text-danger"}>{msg.text}</p>}
    </form>
  );
}
