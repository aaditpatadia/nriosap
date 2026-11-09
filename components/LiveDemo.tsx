"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import { DEMO_REPLY, DEMO_TRY, routeParentMessage } from "@/lib/demo-script";
import { spring } from "@/lib/motion";
import { Burst } from "./Burst";

type Pane = "parent" | "desk" | "owner";
type Stage = "idle" | "received" | "reading" | "check" | "drafting" | "approve" | "undo" | "doing" | "done" | "declined" | "stopped";
interface Entry { id: number; pane: Pane; text: string; from?: "parent" | "desk"; at: string }
type Line = Omit<Entry, "id" | "at">;

/** The real undo window is 5 minutes. It is shortened so a visitor can see what happens next. */
const UNDO_SECONDS = 15;
const START_MINUTES = 142;
const BUDGET_MINUTES = 360;
const ACT_AT: Partial<Record<Stage, Pane>> = { check: "desk", approve: "owner", done: "parent" };

const parent = (text: string): Line => ({ pane: "parent", from: "parent", text });
const reply = (text: string): Line => ({ pane: "parent", from: "desk", text });
const desk = (text: string): Line => ({ pane: "desk", text });
const owner = (text: string): Line => ({ pane: "owner", text });

const BEATS: Partial<Record<Stage, { wait: number; next: Stage; lines: Line[]; minutes?: number }>> = {
  idle: { wait: 900, next: "received", lines: [parent("Bijli ka bill aaya hai. Photo bhej rahi hoon."), parent("[Photo of the bill]")] },
  received: { wait: 1400, next: "reading", lines: [reply("Mil gaya, Kusum ji. Meera dekh rahi hain."), desk("Photo arrived from Kusum Shah. The assistant is reading it.")] },
  reading: { wait: 2200, next: "check", lines: [desk("Read 4 details. One is under 90% sure, so a person must check it.")] },
  drafting: { wait: 1800, next: "approve", lines: [desk("Sent to Priya. Nothing is paid until she says yes."), owner("Meera checked the bill and asks for your approval.")], minutes: 4 },
  doing: { wait: 2200, next: "done", lines: [reply("Kusum ji, bijli ka bill bhar diya gaya hai. Aapko kuch nahi karna."), owner("Electricity bill done. Receipt is in your documents.")], minutes: 2 },
};

const NOW: Record<Stage, string> = {
  idle: "A new morning at the desk.",
  received: "Kusum sends a photo on WhatsApp. That is all she has to do.",
  reading: "The assistant reads the bill.",
  check: "Your turn. You are Meera. Check the detail the assistant was unsure of.",
  drafting: "Meera prepares the payment for approval.",
  approve: "Your turn. You are Priya. Nothing moves without your yes.",
  undo: "You can still change your mind.",
  doing: "Meera does the work and logs her time.",
  done: "Done. Kusum knows, Priya has the record, and every minute is counted.",
  declined: "Held. Nothing was paid, and Meera will ask again before the due date.",
  stopped: "Kusum said stop, so everything has stopped.",
};

const FIELDS = [
  { label: "Biller", value: "City Power Co", sure: 99 },
  { label: "Amount", value: "Rs 4,200", sure: 98 },
  { label: "Due date", value: "In 6 days", sure: 96 },
  { label: "Consumer number", value: "1042 7789 01", sure: 83 },
];

const PROGRESS: Record<Stage, number> = { idle: 0.06, received: 0.18, reading: 0.32, check: 0.42, drafting: 0.56, approve: 0.68, undo: 0.78, doing: 0.9, done: 1, declined: 0.68, stopped: 0.18 };
const MILESTONES: [string, number][] = [["Photo", 0.18], ["Read", 0.32], ["Checked", 0.56], ["Approved", 0.78], ["Done", 1]];

const clock = () => new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date());
const hm = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

function Feed({ label, entries, children }: { label: string; entries: Entry[]; children?: React.ReactNode }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [entries.length]);
  return (
    <ol ref={box} tabIndex={0} aria-label={label} className="grid max-h-[420px] min-h-40 content-start gap-2 overflow-y-auto rounded-[var(--radius-control)] bg-tint p-3">
      {entries.map((e) => (
        <m.li key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.calm}
          className={`max-w-[90%] rounded-2xl border border-line px-3 py-2 ${e.from === "parent" ? "justify-self-end" : ""} bg-surface`}>
          <span className="block [overflow-wrap:anywhere]">{e.text}</span>
          <span className="block text-[length:var(--text-micro)] text-muted">{e.at} India</span>
        </m.li>
      ))}
      {children}
    </ol>
  );
}

export function LiveDemo() {
  const [stage, setStage] = useState<Stage>("idle");
  const [feed, setFeed] = useState<Entry[]>([]);
  const [minutes, setMinutes] = useState(START_MINUTES);
  const [undoLeft, setUndoLeft] = useState(UNDO_SECONDS);
  const [tab, setTab] = useState<Pane>("parent");
  const [text, setText] = useState("");
  const nextId = useRef(1);
  const pending = useRef<ReturnType<typeof setTimeout>[]>([]);

  const add = useCallback((lines: Line[]) => {
    const at = clock();
    const made = lines.map((l) => ({ ...l, id: nextId.current++, at }));
    setFeed((f) => [...f, ...made]);
  }, []);

  const go = useCallback((next: Stage, lines: Line[] = [], mins = 0) => {
    add(lines);
    if (mins) setMinutes((x) => x + mins);
    setStage(next);
    const pane = ACT_AT[next];
    if (pane) setTab(pane);
  }, [add]);

  // Each automatic step waits, then moves on. Steps that need a person have no beat, so they wait for the click.
  useEffect(() => {
    const beat = BEATS[stage];
    if (!beat) return;
    const t = setTimeout(() => go(beat.next, beat.lines, beat.minutes), beat.wait);
    return () => clearTimeout(t);
  }, [stage, go]);

  useEffect(() => {
    if (stage !== "undo") return;
    let left = UNDO_SECONDS;
    const t = setInterval(() => {
      left -= 1;
      setUndoLeft(left);
      if (left <= 0) {
        clearInterval(t);
        go("doing", [owner("The undo window closed. Meera can go ahead."), desk("Meera completes the payment on the biller's site and saves the receipt. In this demo, no money moves.")]);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [stage, go]);

  useEffect(() => () => pending.current.forEach(clearTimeout), []);

  function restart() {
    pending.current.forEach(clearTimeout);
    pending.current = [];
    setFeed([]);
    setMinutes(START_MINUTES);
    setUndoLeft(UNDO_SECONDS);
    setTab("parent");
    setText("");
    setStage("idle");
  }

  function say(raw: string) {
    const body = raw.trim().slice(0, 200);
    if (!body || stage === "stopped") return;
    setText("");
    add([parent(body)]);
    const route = routeParentMessage(body);
    const r = DEMO_REPLY[route];
    pending.current.push(setTimeout(() => {
      const lines = [reply(r.parent), desk(`"${body}" ${r.desk}`), ...(r.owner ? [owner(r.owner)] : [])];
      if (route === "stop") go("stopped", lines);
      else add(lines);
    }, 900));
  }

  const entries = (p: Pane) => feed.filter((e) => e.pane === p);
  const fieldsShown = !["idle", "received", "reading"].includes(stage);
  const checked = !["idle", "received", "reading", "check"].includes(stage);
  const needs: Partial<Record<Pane, boolean>> = { desk: stage === "check", owner: stage === "approve" };
  const paneClass = (p: Pane) => `card ${tab === p ? "grid" : "hidden"} content-start gap-3 lg:grid`;
  const TABS: [Pane, string][] = [["parent", "Parent"], ["desk", "Desk"], ["owner", "You"]];

  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
        <p role="status" aria-live="polite" className="font-semibold">{NOW[stage]}</p>
        <button type="button" className="btn btn-secondary" onClick={restart}>Start again</button>
      </div>

      <div className="grid gap-2" aria-hidden>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <m.div className="h-full origin-left rounded-full bg-accent" initial={false} animate={{ scaleX: PROGRESS[stage] }} transition={spring.calm} />
        </div>
        <div className="flex justify-between text-[length:var(--text-micro)]">
          {MILESTONES.map(([label, at]) => <span key={label} className={PROGRESS[stage] >= at ? "font-semibold text-ink" : "text-muted"}>{label}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:hidden">
        {TABS.map(([p, label]) => (
          <button key={p} type="button" aria-pressed={tab === p} className={`btn ${tab === p ? "btn-tone" : "btn-secondary"}`} onClick={() => setTab(p)}>
            {label}{needs[p] ? " (your turn)" : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="pane-parent" className={paneClass("parent")}>
          <div>
            <h2 id="pane-parent" className="text-[length:var(--text-h3)] font-semibold">Kusum, in Rajkot</h2>
            <p className="text-muted">Only ever uses WhatsApp.</p>
          </div>
          <Feed label="Kusum's WhatsApp messages" entries={entries("parent")} />
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); say(text); }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} aria-label="Type a message as Kusum" placeholder="Type as Kusum..." disabled={stage === "stopped"} />
            <button className="btn btn-tone" disabled={stage === "stopped"}>Send</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-[length:var(--text-small)] text-muted">Or try one:</span>
            {DEMO_TRY.map((t) => <button key={t} type="button" className="btn btn-secondary" disabled={stage === "stopped"} onClick={() => say(t)}>{t}</button>)}
          </div>
        </section>

        <section aria-labelledby="pane-desk" className={paneClass("desk")}>
          <div>
            <h2 id="pane-desk" className="text-[length:var(--text-h3)] font-semibold">The desk</h2>
            <p className="text-muted">AI prepares. Meera checks and acts.</p>
          </div>
          {fieldsShown && (
            <m.dl initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.calm} className="grid gap-1">
              {FIELDS.map((f) => (
                <div key={f.label} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="flex items-center gap-2 font-semibold">{f.value}<span className="chip" data-tone={f.sure < 90 && !checked ? "warn" : "ok"}>{f.sure < 90 && checked ? "Checked by Meera" : `${f.sure}% sure`}</span></dd>
                </div>
              ))}
            </m.dl>
          )}
          {stage === "check" && <button type="button" className="btn btn-primary your-turn" onClick={() => go("drafting", [desk("Meera compared the number with the photo. It is right.")])}>Check and confirm as Meera</button>}
          <Feed label="Desk activity" entries={entries("desk")}>{["reading", "drafting", "doing"].includes(stage) && <li aria-hidden className="typing"><span /><span /><span /></li>}</Feed>
        </section>

        <section aria-labelledby="pane-owner" className={`relative ${paneClass("owner")}`}>
          {stage === "done" && <Burst />}
          <div>
            <h2 id="pane-owner" className="text-[length:var(--text-h3)] font-semibold">You, as Priya in Toronto</h2>
            <p className="text-muted">See everything. Approve everything.</p>
          </div>
          {stage === "approve" && (
            <div className="grid gap-3 rounded-[var(--radius-control)] border border-line p-3">
              <span className="chip w-fit" data-tone="warn">1 thing needs you</span>
              <p className="font-semibold">Pay electricity bill: Rs 4,200</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary your-turn" onClick={() => { setUndoLeft(UNDO_SECONDS); go("undo", [owner("You approved the Rs 4,200 payment.")]); }}>Approve payment</button>
                <button type="button" className="btn btn-secondary" onClick={() => go("declined", [owner("You said not now."), desk("Priya said not now. Task held. Nothing paid.")])}>Not now</button>
              </div>
            </div>
          )}
          {stage === "undo" && (
            <div className="grid gap-3 rounded-[var(--radius-control)] border border-line p-3">
              <p className="font-semibold">Approved. {undoLeft} seconds to undo.</p>
              <p className="text-[length:var(--text-small)] text-muted">In the real product you get 5 minutes.</p>
              <button type="button" className="btn btn-secondary" onClick={() => go("approve", [owner("You undid your approval. Nothing happened.")])}>Undo</button>
            </div>
          )}
          {stage === "done" && <p className="chip w-fit" data-tone="ok">Receipt saved. Kusum has been told.</p>}
          <Feed label="Your family timeline" entries={entries("owner")} />
          <div className="grid gap-1">
            <p className="flex justify-between gap-2 text-[length:var(--text-small)]"><span className="text-muted">Desk time this month</span><strong>{hm(minutes)}</strong></p>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <m.div className="h-full origin-left rounded-full bg-accent" initial={false} animate={{ scaleX: Math.min(1, minutes / BUDGET_MINUTES) }} transition={spring.calm} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
