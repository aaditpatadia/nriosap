"use client";

import { useActionState } from "react";
import { setDocumentCategoryAction, shareDocumentAction } from "@/app/family/platform-actions";
import { DOCUMENT_CATEGORIES } from "@/lib/request-engine";

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
