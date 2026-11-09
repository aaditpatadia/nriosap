"use client";

import { useState, useTransition } from "react";
import { m } from "motion/react";
import { parentSays } from "@/app/actions";
import { spring } from "@/lib/motion";

export interface ChatMsg { id: string; direction: "in" | "out"; body: string; at: string }

/** Simulated parent WhatsApp view for demos. Real traffic uses /api/whatsapp. */
export function ParentChat({ familyId, phone, initial, parentName }: { familyId: string; phone: string; initial: ChatMsg[]; parentName: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function send() {
    const body = text.trim();
    if (!body) return;
    const temp: ChatMsg = { id: "tmp" + Date.now(), direction: "in", body, at: new Date().toISOString() };
    setMsgs((x) => [...x, temp]);
    setText("");
    start(async () => {
      const r = await parentSays(familyId, phone, body);
      setNote(r.ok ? (r.emergency ? "Emergency words detected. A coordinator task was created." : "Delivered to the desk.") : "Could not deliver.");
    });
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2 rounded-[var(--radius-card)] bg-tint p-3" aria-label={`Chat with ${parentName}`}>
        {msgs.map((x) => (
          <m.li key={x.id} layout="position" transition={spring.calm} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[85%] rounded-2xl px-4 py-2 ${x.direction === "in" ? "justify-self-end bg-accent text-on-accent" : "bg-surface border border-line"}`}>
            {x.body}
          </m.li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type as the parent..." aria-label="Message as parent" />
        <button type="button" className="btn btn-primary" onClick={send} disabled={pending}>Send</button>
      </div>
      <p role="status" aria-live="polite" className="text-muted">{note}</p>
    </div>
  );
}
