"use client";

import { useActionState } from "react";
import { newTaskAction } from "@/app/ops/actions";

export function NewTaskForm({ families, templates }: { families: { id: string; name: string }[]; templates: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(newTaskAction, null);
  return (
    <form action={action} className="card grid gap-4">
      <label className="field">Family
        <select className="input" name="familyId" required>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      </label>
      <label className="field">Template
        <select className="input" name="templateId" required>{templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </label>
      <label className="field">Title (optional)<input className="input" name="title" maxLength={160} /></label>
      <button className="btn btn-primary" disabled={pending}>Create task</button>
      <p role="status" aria-live="polite" className="text-danger">{state?.message}</p>
    </form>
  );
}
