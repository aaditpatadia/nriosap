"use client";

import { useState, useTransition } from "react";
import { changeCategoryAction, confirmCategoryAction, copiedAction, createRequestAction, mergeAction, replyAction, spamAction } from "@/app/ops/whatsapp/actions";

type R = { ok: boolean; reason?: string; note?: string };

function useAct() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<R>, okText: string) => start(async () => {
    const r = await fn();
    setMsg({ ok: r.ok, text: r.ok ? (r.note ?? okText) : (r.reason ?? "That did not work.") });
  });
  return { pending, msg, run };
}

const Status = ({ msg }: { msg: { ok: boolean; text: string } | null }) => (msg ? <p role="status" aria-live="polite" className={msg.ok ? "text-ok" : "text-danger"}>{msg.text}</p> : null);

/** The desk's buttons for one incoming message. Each is a person's decision, recorded with their name. */
export function MessageActions({ id, category, categories, services, requests, hasRequest, knownFamily }: { id: string; category: string | null; categories: string[]; services: string[]; requests: { id: string; ref: string; title: string }[]; hasRequest: boolean; knownFamily: boolean }) {
  const { pending, msg, run } = useAct();
  const [cat, setCat] = useState(category ?? "unclear");
  const [req, setReq] = useState(requests[0]?.id ?? "");
  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-end gap-2">
        {category && <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => confirmCategoryAction(id), "Category confirmed.")}>Confirm category</button>}
        <label className="field">Category
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => changeCategoryAction(id, cat), "Category changed.")}>Change category</button>
      </div>
      {knownFamily && !hasRequest && (
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className="btn btn-primary" disabled={pending || !services.includes(cat)} onClick={() => run(() => createRequestAction(id, cat), "Request created.")}>Create request</button>
          {requests.length > 0 && (
            <>
              <label className="field">Request
                <select className="input" value={req} onChange={(e) => setReq(e.target.value)} aria-label="Merge into request">{requests.map((r) => <option key={r.id} value={r.id}>{r.ref}: {r.title}</option>)}</select>
              </label>
              <button type="button" className="btn btn-secondary" disabled={pending || !req} onClick={() => run(() => mergeAction(id, req), "Added to the request.")}>Merge into request</button>
            </>
          )}
        </div>
      )}
      <button type="button" className="btn btn-ghost w-fit" disabled={pending} onClick={() => run(() => spamAction(id), "Marked as spam.")}>Mark spam</button>
      <Status msg={msg} />
    </div>
  );
}

export function ReplyBox({ conversationKey, disabled, inWindow }: { conversationKey: string; disabled: boolean; inWindow: boolean }) {
  const [body, setBody] = useState("");
  const { pending, msg, run } = useAct();
  return (
    <div className="card grid gap-2">
      <h2 className="text-[length:var(--text-h3)] font-semibold">Reply</h2>
      <p className="text-[length:var(--text-small)] text-muted">{inWindow ? "Inside the 24 hour window." : "Outside the 24 hour window. The approved template goes first and your text waits for their answer."} No advice: anything that reads like medical, legal or tax advice is blocked.</p>
      <label className="field">Message<textarea className="input" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} disabled={disabled} /></label>
      <button type="button" className="btn btn-primary w-fit" disabled={pending || disabled || !body.trim()} onClick={() => run(async () => {
        const r = await replyAction(conversationKey, body);
        if (r.ok) setBody("");
        return r;
      }, "Reply queued.")}>Reply</button>
      <Status msg={msg} />
    </div>
  );
}

/** Copies a would-send reply so a person can send it by hand from the business phone. */
export function CopyButton({ id, text }: { id: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-secondary w-fit" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard can be blocked. The text is on the page to select by hand.
      }
      await copiedAction(id);
      setDone(true);
    }}>{done ? "Copied" : "Copy text"}</button>
  );
}
