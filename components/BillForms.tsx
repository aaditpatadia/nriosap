"use client";

import { useActionState, useState, useTransition } from "react";
import { addDeadlineAction, deadlineStatusAction } from "@/app/family/workspace-actions";
import { toast } from "./Toaster";
import { DEADLINE_KINDS, RECURRENCES, REMINDER_CHOICES } from "@/lib/workspace-rules";

const reminderWord = (d: number) => (d === 0 ? "On the due date" : `${d} days before`);

export function AddBillForm({ familyId, properties, documents }: { familyId: string; properties: { id: string; name: string }[]; documents: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(addDeadlineAction, null);
  return (
    <form action={action} key={state?.ok ? "saved" : "form"} className="card grid gap-3">
      <h2 className="section-title">Add a bill or date</h2>
      <input type="hidden" name="familyId" value={familyId} />
      <label className="field">Name<input className="input" name="title" maxLength={160} required placeholder="Society maintenance, Pune flat" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Type<select className="input" name="kind" defaultValue="other">{Object.entries(DEADLINE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Due date<input className="input" type="date" name="dueOn" required /></label>
        <label className="field">Amount in Rs, if known<input className="input" name="amount" inputMode="numeric" /></label>
        <label className="field">Repeats<select className="input" name="recurrence" defaultValue="none">{Object.entries(RECURRENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {properties.length > 0 && <label className="field">Property<select className="input" name="propertyId" defaultValue=""><option value="">None</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="field">Person, if any<input className="input" name="person" maxLength={120} /></label>
      </div>
      {documents.length > 0 && <label className="field">Supporting document<select className="input" name="documentId" defaultValue=""><option value="">None</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>}
      <fieldset className="grid gap-1">
        <legend className="text-[length:var(--text-small)] font-semibold">Remind me</legend>
        <div className="grid sm:grid-cols-2">{REMINDER_CHOICES.map((d) => <label key={d} className="flex min-h-12 items-center gap-3"><input type="checkbox" name="reminder" value={d} className="size-5" defaultChecked /><span className="text-[length:var(--text-small)]">{reminderWord(d)}</span></label>)}</div>
      </fieldset>
      <label className="field">Custom reminder date (optional)<input className="input" type="date" name="reminderOn" /></label>
      <label className="field">Notes (optional)<input className="input" name="notes" maxLength={500} /></label>
      <button className="btn btn-secondary w-fit" disabled={pending}>{pending ? "Saving..." : "Add"}</button>
      <p role="status" aria-live="polite" className={`text-[length:var(--text-small)] ${state?.ok ? "text-ok" : "text-danger"}`}>{state?.message}</p>
    </form>
  );
}

export function BillActions({ id, title, status }: { id: string; title: string; status: string }) {
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const act = (s: "handled" | "cancelled" | "upcoming") => start(async () => { const r = await deadlineStatusAction(id, s); setSure(false); toast(r.ok ? (s === "handled" ? "Marked as handled." : s === "cancelled" ? "Removed." : "Moved back to upcoming.") : "That did not save.", r.ok ? "ok" : "danger"); });
  if (status === "handled") return <button type="button" className="btn btn-ghost" disabled={pending} aria-label={`Mark ${title} as not handled`} onClick={() => act("upcoming")}>Undo</button>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <button type="button" className="btn btn-secondary" disabled={pending} aria-label={`Mark ${title} as handled`} onClick={() => act("handled")}>Mark handled</button>
      {sure ? <button type="button" className="btn btn-ghost text-danger" disabled={pending} onClick={() => act("cancelled")}>Yes, remove</button> : <button type="button" className="btn btn-ghost" aria-label={`Remove ${title}`} onClick={() => setSure(true)}>Remove</button>}
    </span>
  );
}
