"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, m } from "motion/react";
import { askAllyAction, assistantConsentAction, type AskResult } from "@/app/family/workspace-actions";
import { STARTERS } from "@/lib/assistant-kb";
import { dur, ease } from "@/lib/motion";


export function AssistantChat({ familyId, initial, aiAvailable, aiOn }: { familyId: string; initial: string; aiAvailable: boolean; aiOn: boolean }) {
  const [turns, setTurns] = useState<{ q: string; a: AskResult | null }[]>([]);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(aiOn);
  const [pending, start] = useTransition();
  const asked = useRef(false);

  function ask(q: string) {
    const question = q.trim();
    if (question.length < 2 || pending) return;
    setText("");
    setTurns((t) => [...t, { q: question, a: null }]);
    start(async () => {
      const a = await askAllyAction(familyId, question);
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    });
  }
  useEffect(() => { if (initial && !asked.current) { asked.current = true; ask(initial); } });

  return (
    <div className="grid gap-4">
      {turns.length === 0 && (
        <div className="card grid gap-4" style={{ background: "var(--mint)", borderColor: "var(--mint-line)" }}>
          <div className="grid gap-1"><h2 className="text-[length:var(--text-h3)] font-semibold">Hello. How can I help?</h2><p className="text-[length:var(--text-small)]">Ask me how to get something done, where to find something in the app, or what is in your records. I will answer and take you straight there.</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            {STARTERS.map((g) => (
              <section key={g.group} aria-label={g.group} className="grid content-start gap-2">
                <h3 className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wide text-muted">{g.group}</h3>
                <ul className="grid gap-2">{g.items.map((s) => <li key={s}><button type="button" className="btn btn-secondary w-full justify-start text-left" onClick={() => ask(s)}>{s}</button></li>)}</ul>
              </section>
            ))}
          </div>
        </div>
      )}
      <ol className="grid gap-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {turns.map((t, i) => (
            <m.li key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }} className="grid gap-2">
              <p className="w-fit max-w-[85%] justify-self-end rounded-[10px] bg-sunken px-3 py-2 [overflow-wrap:anywhere]">{t.q}</p>
              <div className="card grid gap-3">
                {!t.a ? <span className="typing" role="status" aria-label="Working on it"><span /><span /><span /></span> : (
                  <>
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{t.a.text}</p>
                    {t.a.checklist && <ul className="grid list-disc gap-1 pl-5">{t.a.checklist.map((c) => <li key={c}>{c}</li>)}</ul>}
                    {t.a.sources.length > 0 && (
                      <div className="grid gap-1"><p className="text-[length:var(--text-micro)] font-semibold text-muted">From your records</p>
                        <ul className="rows">{t.a.sources.map((s, n) => <li key={n}><Link href={s.href} className="row-link text-[length:var(--text-small)]"><span className="min-w-0 font-medium [overflow-wrap:anywhere]">{s.label}</span><span className="shrink-0 text-muted">{s.detail}</span></Link></li>)}</ul>
                      </div>
                    )}
                    {t.a.draft && <Link className="btn btn-secondary w-fit" href={t.a.draft.href}>{t.a.draft.label}</Link>}
                    {t.a.actions && t.a.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2" aria-label="Where to go next">
                        {t.a.actions.map((a, n) => a.external
                          ? <a key={a.label} className={`btn ${n === 0 ? "btn-primary" : "btn-secondary"}`} href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
                          : <Link key={a.label} className={`btn ${n === 0 ? "btn-primary" : "btn-secondary"}`} href={a.href}>{a.label}</Link>)}
                      </div>
                    )}
                    {t.a.viaAi && <p className="text-[length:var(--text-micro)] text-muted">Written by an AI service from your record titles and dates. Please check anything important.</p>}
                  </>
                )}
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ol>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label className="field min-w-0 flex-1 basis-64">Ask Ally<input className="input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="When does my health insurance expire?" /></label>
        <button className="btn btn-primary" disabled={pending || text.trim().length < 2}>Ask</button>
      </form>
      <div className="grid gap-2 text-[length:var(--text-small)] text-muted">
        <p>Ally Assistant only reads what you are allowed to see. It can find, summarise and prepare. It cannot pay, sign, file, approve or give legal, medical or tax advice.</p>
        {aiAvailable ? (
          <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-5" checked={consent} onChange={(e) => { setConsent(e.target.checked); void assistantConsentAction(e.target.checked); }} /><span>When Ally cannot find an answer itself, let an AI service outside India read my record titles, dates and statuses. Files and document contents are never sent.</span></label>
        ) : <p>Today it answers from your records using fixed rules, and nothing is sent to an outside AI service.</p>}
      </div>
    </div>
  );
}
