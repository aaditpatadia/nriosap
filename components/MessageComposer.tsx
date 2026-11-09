"use client";

import { useState, useTransition } from "react";
import { saveDraftAction, sendDraftAction, sendTemplateAction } from "@/app/ops/actions";

export function SendDraftButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="grid gap-1">
      <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={() => start(async () => { const r = await sendDraftAction(id); setMsg(r.ok ? "" : (r.reason ?? "Could not send.")); })}>Approve and send</button>
      {msg && <p role="alert" className="text-danger">{msg}</p>}
    </div>
  );
}

export function MessageComposer({ familyId, parentFirstName, templates }: { familyId: string; parentFirstName: string; templates: { name: string; label: string; preview: string; params: string[] }[] }) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tpl, setTpl] = useState(templates[0]?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>({ name: parentFirstName });
  const [pending, start] = useTransition();
  const def = templates.find((t) => t.name === tpl);
  return (
    <>
      <div className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Write a reply</h2>
        <label className="field">Draft<textarea className="input" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <button type="button" className="btn btn-secondary" disabled={pending || !body.trim()} onClick={() => start(async () => {
          const r = await saveDraftAction(familyId, body);
          setNote({ ok: r.ok, text: r.ok ? "Draft saved. It has not been sent." : (r.reason ?? "Could not save.") });
          if (r.ok) setBody("");
        })}>Save draft</button>
        {note && <p role="status" aria-live="polite" className={note.ok ? "text-ok" : "text-danger"}>{note.text}</p>}
      </div>
      <div className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Send a template</h2>
        <label className="field">Template
          <select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)}>{templates.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}</select>
        </label>
        {def?.params.map((p) => (
          <label key={p} className="field capitalize">{p}<input className="input" value={values[p] ?? ""} maxLength={120} onChange={(e) => setValues({ ...values, [p]: e.target.value })} /></label>
        ))}
        <p className="text-[length:var(--text-small)] text-muted">{def?.params.reduce((s, p) => s.replace(`{${p}}`, values[p] || `{${p}}`), def.preview)}</p>
        <button type="button" className="btn btn-secondary" disabled={pending || !def?.params.every((p) => values[p]?.trim())} onClick={() => start(async () => {
          const r = await sendTemplateAction(familyId, tpl, def!.params.map((p) => values[p]));
          setNote({ ok: r.ok, text: r.ok ? (r.status === "sent" ? "Sent." : "Recorded. Sending is off until verification.") : (r.reason ?? "Could not send.") });
        })}>Approve and send template</button>
      </div>
    </>
  );
}
