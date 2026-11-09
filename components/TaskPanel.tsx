"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { setStatusAction } from "@/app/actions";
import { addNoteAction, escalateAction, manualTimeAction, startTimerAction, stopTimerAction } from "@/app/ops/actions";
import type { TaskStatus } from "@/lib/types";

const STATUSES: { v: TaskStatus; label: string }[] = [
  { v: "todo", label: "To do" },
  { v: "doing", label: "Doing" },
  { v: "waiting_parent", label: "Waiting on parent" },
  { v: "waiting_owner", label: "Waiting on owner" },
  { v: "done", label: "Done" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export interface EscalationOption { id: string; label: string; href: string | null }

export function TaskPanel({ taskId, status, timerStartedAt, otherTimer, today, escalations }: { taskId: string; status: TaskStatus; timerStartedAt?: string; otherTimer?: boolean; today: string; escalations: EscalationOption[] }) {
  // The server holds started_at, so the clock is only ever a display of now minus that instant.
  const [startedAt, setStartedAt] = useState(timerStartedAt);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [optimistic, setOptimistic] = useState(status);
  const [pending, start] = useTransition();
  const [manual, manualAction, manualPending] = useActionState(manualTimeAction, null);
  const [noteState, noteAction, notePending] = useActionState(addNoteAction, null);
  const [sent, setSent] = useState<{ brief: string; href: string | null } | null>(null);

  useEffect(() => setOptimistic(status), [status]);
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const secs = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const h = Math.floor(secs / 3600);
  const clock = `${h > 0 ? `${h}:` : ""}${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;

  function begin() {
    setMsg("");
    const optimisticStart = new Date().toISOString();
    setStartedAt(optimisticStart);
    start(async () => {
      const r = await startTimerAction(taskId);
      if (r.ok) setStartedAt(r.startedAt);
      else {
        setStartedAt(undefined);
        setMsg(r.reason ?? "Could not start the timer.");
      }
    });
  }

  function stop() {
    const was = startedAt;
    setStartedAt(undefined);
    start(async () => {
      const r = await stopTimerAction(taskId, note);
      if (r.ok) {
        setMsg(`Logged ${r.minutes} min.`);
        setNote("");
      } else {
        setStartedAt(was);
        setMsg("Could not log the time. The timer is still running.");
      }
    });
  }

  return (
    <div className="grid content-start gap-4">
      <div className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Timer</h2>
        <p className="text-3xl font-bold tabular-nums" data-testid="timer-clock">{clock}</p>
        <label className="field">What are you doing?<input className="input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} /></label>
        {!startedAt ? (
          <button type="button" className="btn btn-primary" disabled={pending || otherTimer} onClick={begin}>Start timer</button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={stop}>Stop and log</button>
        )}
        {otherTimer && !startedAt && <p className="text-[length:var(--text-small)] text-muted">You have a timer running on another task.</p>}
        <p role="status" aria-live="polite" className="text-muted">{msg}</p>
      </div>

      <form action={manualAction} className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Add time by hand</h2>
        <input type="hidden" name="taskId" value={taskId} />
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Hours<input className="input" name="hours" type="number" min={0} max={10} defaultValue={0} inputMode="numeric" /></label>
          <label className="field">Minutes<input className="input" name="minutes" type="number" min={0} max={59} defaultValue={15} inputMode="numeric" /></label>
        </div>
        <label className="field">Date<input className="input" name="date" type="date" defaultValue={today} max={today} required /></label>
        <label className="field">Note<input className="input" name="note" maxLength={280} /></label>
        <button className="btn btn-secondary" disabled={manualPending}>Add time</button>
        <p role="status" aria-live="polite" className={manual?.ok ? "text-ok" : "text-danger"}>{manual?.message}</p>
      </form>

      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s.v} type="button" aria-pressed={s.v === optimistic} className={`btn ${s.v === optimistic ? "btn-tone" : "btn-secondary"}`} onClick={() => { setOptimistic(s.v); start(async () => { await setStatusAction(taskId, s.v); }); }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <form action={noteAction} key={noteState?.ok ? noteState.message + Date.now() : "note"} className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Add a note</h2>
        <input type="hidden" name="taskId" value={taskId} />
        <label className="field">Note for the desk<textarea className="input" name="body" rows={3} maxLength={2000} required /></label>
        <button className="btn btn-secondary" disabled={notePending}>Save note</button>
        <p role="status" aria-live="polite" className={noteState?.ok ? "text-ok" : "text-danger"}>{noteState?.message}</p>
      </form>

      <div className="card grid gap-3">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Send to a licensed professional</h2>
        <p className="text-[length:var(--text-small)] text-muted">Anything medical, legal or tax goes to them. We prepare the brief. They give the view.</p>
        {escalations.length === 0 && <p className="text-[length:var(--text-small)] text-muted">No contacts yet. An admin adds them.</p>}
        <div className="grid gap-2">
          {escalations.map((c) => (
            <button key={c.id} type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => {
              const r = await escalateAction(taskId, c.id);
              if (r.ok) setSent({ brief: r.brief!, href: c.href ? `${c.href}${c.href.includes("?") ? "&" : "?"}text=${encodeURIComponent(r.brief!)}` : null });
            })}>
              {c.label}
            </button>
          ))}
        </div>
        {sent && (
          <div role="status" className="grid gap-2 rounded-[var(--radius-control)] bg-tint p-3 text-[length:var(--text-small)]">
            <p className="font-semibold">Recorded. Now send this brief.</p>
            <p>{sent.brief}</p>
            {sent.href && <a className="btn btn-secondary" href={sent.href} target="_blank" rel="noreferrer">Open in WhatsApp</a>}
          </div>
        )}
      </div>
    </div>
  );
}
