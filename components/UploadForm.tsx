"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { PURPOSE_LABEL, PURPOSES, type Purpose } from "@/lib/upload-rules";

const DEFAULTS: Purpose[] = ["read_records", "store"];
const subscribeNothing = () => () => {};

export function UploadForm({ familyId, blocked }: { familyId: string; blocked?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [purposes, setPurposes] = useState<Purpose[]>(DEFAULTS);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Uploading needs the script loaded, so the button waits for it.
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: "Please choose a file." });
    setBusy(file.name);
    setMsg(null);
    const body = new FormData();
    body.set("familyId", familyId);
    body.set("file", file);
    purposes.forEach((p) => body.append("purpose", p));
    try {
      const res = await fetch("/api/documents", { method: "POST", body });
      const r = (await res.json()) as { ok: boolean; reason?: string; needsCheck?: boolean };
      if (!r.ok) setMsg({ ok: false, text: r.reason ?? "That did not upload. Please try again." });
      else {
        setMsg({ ok: true, text: r.needsCheck ? "Saved. A coordinator will check the details before anyone relies on them." : "Saved and read." });
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "That did not upload. Please try again." });
    }
    setBusy(null);
  }

  if (blocked) return <p className="card text-muted">{blocked}</p>;
  return (
    <form onSubmit={upload} className="card grid gap-4">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Add a document</h2>
      <label className="field">File (PDF or photo, up to 4 MB)<input ref={input} className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></label>
      <fieldset className="grid gap-2">
        <legend className="font-semibold">What may the desk do with this one?</legend>
        {PURPOSES.map((p) => (
          <label key={p} className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-6" checked={purposes.includes(p)} onChange={(e) => setPurposes(e.target.checked ? [...purposes, p] : purposes.filter((x) => x !== p))} />
            <span>{PURPOSE_LABEL[p]}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-[length:var(--text-small)] text-muted">An AI service reads the file to pull out key facts. A person checks anything it is unsure of.</p>
      <button className="btn btn-primary" disabled={!!busy || !ready}>{busy ? "Reading..." : "Upload"}</button>
      {busy && <p role="status" className="text-muted">Working on {busy}</p>}
      {msg && <p role="status" aria-live="polite" className={msg.ok ? "text-ok" : "text-danger"}>{msg.text}</p>}
    </form>
  );
}
