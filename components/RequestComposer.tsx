"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { DetailsFields } from "./DetailsFields";
import { VoiceNote } from "./VoiceNote";
import { VoiceRequestCard } from "./VoiceRequestCard";
import { readDetails } from "@/lib/pricing-rules";
import { submitRequest } from "@/app/family/platform-actions";
import { SERVICE_CATEGORIES, understandRequest, type ServiceCategory } from "@/lib/request-engine";
import { uploadFile } from "@/lib/upload-client";

interface Attached { id: string; title: string }

export function RequestComposer({ familyId, vault, properties, defaultProperty, contacts = [], canUpload, initial = "", area }: { area?: { from: number; to: number }; familyId: string; vault: Attached[]; properties: { id: string; name: string }[]; defaultProperty: string; contacts?: { id: string; name: string }[]; canUpload: boolean; initial?: string }) {
  const [state, action, pending] = useActionState(submitRequest, null);
  const [text, setText] = useState(initial);
  const [picked, setPicked] = useState<ServiceCategory | "">("");
  const [location, setLocation] = useState<string | null>(null);
  const [urgent, setUrgent] = useState<boolean | null>(null);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [read, setRead] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Someone on a slow connection may start typing before the page has finished loading. Keep what they typed.
  useEffect(() => {
    const id = requestAnimationFrame(() => { const typed = box.current?.value ?? ""; if (typed) setText((t) => t || typed); });
    return () => cancelAnimationFrame(id);
  }, []);

  const seen = useMemo(() => understandRequest(text), [text]);
  const hasText = text.trim().length >= 10;
  const blocked = hasText && seen.verdict === "not_possible";
  const category = picked || seen.category;
  const place = location ?? seen.location ?? "";
  const isUrgent = urgent ?? seen.urgent;
  const outsideMumbai = hasText && !!seen.location && !/^(mumbai|bombay)$/i.test(seen.location);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadError("");
    for (const file of [...files].slice(0, 5)) {
      setProgress(0);
      const r = await uploadFile({ familyId, file, purposes: read ? ["read_records", "store"] : ["store"], onProgress: setProgress });
      if (r.ok && r.documentId) setAttached((a) => [...a, { id: r.documentId!, title: file.name }]);
      else setUploadError(r.reason ?? "That file did not upload.");
    }
    setProgress(null);
    if (input.current) input.current.value = "";
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="category" value={category} />
      {attached.map((a) => <input key={a.id} type="hidden" name="attachment" value={a.id} />)}

      <VoiceRequestCard familyId={familyId} canUpload={canUpload} pending={pending} hasVoice={attached.some((a) => a.title === "Voice note")} onSaved={(id, title) => setAttached((a) => [...a, { id, title }])} />
      <p aria-hidden className="text-center text-[length:var(--text-small)] font-semibold text-muted">or type it</p>

      <label className="field text-[length:var(--text-h3)]">What do you need handled in India?
        <textarea ref={box} className="input" name="description" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="I need someone to visit my flat in Mumbai because the tenant says there is a water leakage." required />
      </label>

      {hasText && (
        <div className="card rise grid gap-4" aria-live="polite">
          <h2 className="section-title">Please check this</h2>
          {seen.verdict === "not_possible" && <p role="alert" className="font-semibold text-danger">{seen.reason}</p>}
          {seen.verdict === "needs_professional" && <p className="chip w-fit whitespace-normal" data-tone="warn">{seen.reason}</p>}
          {!blocked && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">Kind of work
                  <select className="input" value={category} onChange={(e) => setPicked(e.target.value as ServiceCategory)}>
                    {SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">Where in India
                  <input className="input" name="location" maxLength={120} value={place} onChange={(e) => setLocation(e.target.value)} placeholder="City" />
                </label>
                {properties.length > 0 && <label className="field">Property (optional)<select className="input" name="propertyId" defaultValue={defaultProperty}><option value="">None</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                {contacts.length > 0 && <label className="field">Who is involved (optional)<select className="input" name="memberId" defaultValue=""><option value="">Just me</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
                <label className="field">Needed by (optional)<input className="input" type="date" name="dueOn" /></label>
              </div>
              {outsideMumbai && <p role="status" className="chip w-fit whitespace-normal" data-tone="warn">We only work in Mumbai for now. You can still send this, and your coordinator will tell you what is possible before anything starts.</p>}
              {seen.action && <p className="text-muted">Likely next step: <strong className="text-ink">{seen.action}</strong></p>}
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="urgent" className="size-6" checked={isUrgent} onChange={(e) => setUrgent(e.target.checked)} /><span>This is urgent</span></label>
              {seen.missing.length > 0 && (
                <label className="field">It would help to know
                  <span className="font-normal text-muted">{seen.missing.join(" ")}</span>
                  <textarea className="input" name="extra" rows={2} maxLength={1000} placeholder="Add anything you can. You can also skip this." />
                </label>
              )}
              <p className="text-[length:var(--text-micro)] text-muted">This is a quick read of your words. Your coordinator checks everything and you can change any of it. Sending this starts no work and no spending.</p>
            </>
          )}
        </div>
      )}

      {!blocked && <DetailsFields initial={readDetails(null)} area={area} defaultOpen={false} />}

      {!blocked && (
        <fieldset className="card grid gap-3">
          <legend className="px-1 font-semibold">Add a photo, paper or voice note (optional)</legend>
          {canUpload ? (
            <>
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-secondary cursor-pointer">Choose files<input ref={input} type="file" className="sr-only" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => onFiles(e.target.files)} /></label>
                <label className="btn btn-secondary cursor-pointer">Take a photo<input type="file" className="sr-only" accept="image/*" capture="environment" onChange={(e) => onFiles(e.target.files)} /></label>
                <VoiceNote familyId={familyId} onSaved={(id, title) => setAttached((a) => [...a, { id, title }])} />
              </div>
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-6" checked={read} onChange={(e) => setRead(e.target.checked)} /><span>Let an AI service read these to pull out key facts. A person checks anything it is unsure of.</span></label>
              {progress !== null && <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading"><div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${progress})` }} /></div>}
              {uploadError && <p role="alert" className="text-danger">{uploadError}</p>}
            </>
          ) : <p className="text-muted">New files can be added once consent is on file.</p>}
          {vault.length > 0 && (
            <label className="field">Or use something from your vault
              <select className="input" value="" onChange={(e) => { const d = vault.find((v) => v.id === e.target.value); if (d && !attached.some((a) => a.id === d.id)) setAttached([...attached, d]); }}>
                <option value="">Choose a document</option>
                {vault.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
          )}
          {attached.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attached.map((a) => <li key={a.id}><button type="button" className="chip min-h-12" aria-label={`Remove ${a.title}`} onClick={() => setAttached(attached.filter((x) => x.id !== a.id))}>{a.title} ✕</button></li>)}
            </ul>
          )}
          <p className="text-[length:var(--text-micro)] text-muted">Your coordinator listens to voice notes. They are not sent to an AI service.</p>
        </fieldset>
      )}

      <button className="btn btn-primary w-fit" disabled={pending || !hasText || blocked || progress !== null}>{pending ? "Sending..." : "Send to my coordinator"}</button>
      <p role="status" aria-live="polite" className="text-danger">{state?.ok === false ? state.message : ""}</p>
    </form>
  );
}
