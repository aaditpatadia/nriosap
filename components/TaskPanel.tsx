"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logTimeAction, setStatusAction } from "@/app/actions";
import type { TaskStatus } from "@/lib/types";

const STATUSES: { v: TaskStatus; label: string }[] = [
  { v: "todo", label: "To do" },
  { v: "doing", label: "Doing" },
  { v: "waiting_parent", label: "Waiting on parent" },
  { v: "waiting_owner", label: "Waiting on owner" },
  { v: "done", label: "Done" },
];

export function TaskPanel({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const t0 = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs(Math.floor((Date.now() - (t0.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  function stopAndLog() {
    setRunning(false);
    const minutes = Math.max(1, Math.round(secs / 60));
    start(async () => {
      const r = await logTimeAction(taskId, minutes, note || "Timer entry");
      setMsg(r.ok ? `Logged ${minutes} min.` : "Could not log time.");
      setSecs(0);
      setNote("");
    });
  }

  return (
    <div className="grid gap-4">
      <div className="card grid gap-3">
        <p className="font-semibold">Timer</p>
        <p className="text-3xl font-bold tabular-nums" aria-live="off">{mm}:{ss}</p>
        <label className="field">Note<input className="input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex gap-3">
          {!running ? (
            <button type="button" className="btn btn-primary" onClick={() => { t0.current = Date.now(); setSecs(0); setRunning(true); setMsg(""); }}>Start timer</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={stopAndLog}>Stop and log</button>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-muted">{msg}</p>
      </div>
      <div className="card grid gap-2">
        <p className="font-semibold">Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s.v} type="button" aria-pressed={s.v === status} className={`btn ${s.v === status ? "btn-primary" : "btn-secondary"}`} onClick={() => start(async () => { await setStatusAction(taskId, s.v); })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
