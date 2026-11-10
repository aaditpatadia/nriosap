"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { setDocumentCategoryAction, shareDocumentAction } from "@/app/family/platform-actions";
import { documentDetailsAction, linkDocumentAction, renameDocumentAction } from "@/app/family/workspace-actions";
import { dur, ease } from "@/lib/motion";
import { DOCUMENT_CATEGORIES } from "@/lib/request-engine";
import { uploadFile } from "@/lib/upload-client";

/** Owner-only: move a document to another category, or share this one document with one person. */
export function DocumentControls({ documentId, category, members, sharedWith }: { documentId: string; category: string; members: { id: string; name: string }[]; sharedWith: string[] }) {
  const [, moveAction, moving] = useActionState(setDocumentCategoryAction, null);
  const [shareState, shareAction, sharing] = useActionState(shareDocumentAction, null);
  return (
    <details className="text-[length:var(--text-small)]">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Organise and share</summary>
      <div className="grid gap-3">
        <form action={moveAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="documentId" value={documentId} />
          <label className="field min-w-40 flex-1">Category
            <select className="input" name="category" defaultValue={category}>{Object.entries(DOCUMENT_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <button className="btn btn-secondary" disabled={moving}>Move</button>
        </form>
        {members.length === 0 ? <p className="text-muted">Add a family member to share this document with them.</p> : members.map((m) => {
          const on = sharedWith.includes(m.id);
          return (
            <form key={m.id} action={shareAction} className="flex flex-wrap items-center justify-between gap-2">
              <input type="hidden" name="documentId" value={documentId} />
              <input type="hidden" name="memberId" value={m.id} />
              <input type="hidden" name="share" value={on ? "0" : "1"} />
              <span>{m.name}: {on ? "can see this" : "cannot see this"}</span>
              <button className="btn btn-secondary" disabled={sharing}>{on ? "Stop sharing" : "Share"}</button>
            </form>
          );
        })}
        {shareState?.ok === false && <p role="alert" className="text-danger">{shareState.message}</p>}
      </div>
    </details>
  );
}

export function RenameAndLink({ documentId, title, requests }: { documentId: string; title: string; requests: { id: string; label: string }[] }) {
  const [renamed, rename, renaming] = useActionState(renameDocumentAction, null);
  const [linked, link, linking] = useActionState(linkDocumentAction, null);
  return (
    <details className="text-[length:var(--text-small)]">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Rename or link to a request</summary>
      <div className="grid gap-3">
        <form action={rename} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="documentId" value={documentId} />
          <label className="field min-w-0 flex-1 basis-56">Name<input className="input" name="title" maxLength={120} defaultValue={title} required /></label>
          <button className="btn btn-secondary" disabled={renaming}>Rename</button>
        </form>
        {renamed && <p role="status" className={renamed.ok ? "text-ok" : "text-danger"}>{renamed.message}</p>}
        {requests.length > 0 && (
          <form action={link} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="documentId" value={documentId} />
            <label className="field min-w-0 flex-1 basis-56">Open request<select className="input" name="requestId" defaultValue="">{[<option key="" value="" disabled>Choose a request</option>, ...requests.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)]}</select></label>
            <button className="btn btn-secondary" disabled={linking}>Link</button>
          </form>
        )}
        {linked && <p role="status" className={linked.ok ? "text-ok" : "text-danger"}>{linked.message}</p>}
      </div>
    </details>
  );
}

export function DocumentDetailsForm({ documentId, expiresOn, issuedOn, tags, propertyId, properties, suggested }: { documentId: string; expiresOn: string; issuedOn: string; tags: string[]; propertyId: string; properties: { id: string; name: string }[]; suggested: boolean }) {
  const [state, action, pending] = useActionState(documentDetailsAction, null);
  return (
    <details className="text-[length:var(--text-small)]">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Dates and tags</summary>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="documentId" value={documentId} />
        {suggested && <p className="text-warn">The expiry date was read automatically. Please check it against the document.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">Expires or renews<input className="input" type="date" name="expiresOn" defaultValue={expiresOn} /></label>
          <label className="field">Issued<input className="input" type="date" name="issuedOn" defaultValue={issuedOn} /></label>
        </div>
        <label className="field">Tags, separated by commas<input className="input" name="tags" maxLength={200} defaultValue={tags.join(", ")} /></label>
        {properties.length > 0 && <label className="field">Property<select className="input" name="propertyId" defaultValue={propertyId}><option value="">None</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <button className="btn btn-secondary w-fit" disabled={pending}>Save</button>
        {state && <p role="status" className={state.ok ? "text-ok" : "text-danger"}>{state.message}</p>}
      </form>
    </details>
  );
}

export function NewVersionButton({ familyId, documentId, title }: { familyId: string; documentId: string; title: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    const r = await uploadFile({ familyId, file, purposes: ["store"], supersedes: documentId });
    if (r.ok) router.refresh(); else setError(r.reason ?? "That did not upload.");
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <>
      <label className="btn btn-ghost cursor-pointer">{busy ? "Uploading..." : "New version"}<input ref={input} type="file" className="sr-only" aria-label={`Choose a new version of ${title}`} accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => send(e.target.files?.[0])} /></label>
      {error && <p role="alert" className="w-full text-danger">{error}</p>}
    </>
  );
}

/** Loaded only when asked for, so the access log records real views. */
export function DocumentPreview({ documentId, title }: { documentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost" aria-expanded={open} aria-label={`${open ? "Hide preview of" : "Preview"} ${title}`} onClick={() => setOpen(!open)}>{open ? "Hide preview" : "Preview"}</button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div className="w-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.base, ease: ease.out }}>
            {/* A private, per-request image, so the image optimiser must not cache it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/documents/${documentId}/file?preview=1`} alt={`Preview of ${title}`} className="max-h-96 rounded-[10px] border border-line object-contain" />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
