"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Burst } from "./Burst";
import { dur, ease, spring } from "@/lib/motion";

const PANES: Record<string, { stat: string; rows: [string, string][] }> = {
  "Active requests": { stat: "3", rows: [["Inspect the Pune flat", "In progress"], ["Certified degree copy", "Awaiting information"], ["Replace the geyser", "Under review"]] },
  "Pending approvals": { stat: "1", rows: [] },
  "Upcoming deadlines": { stat: "2", rows: [["Property tax, Pune", "In 12 days"], ["Vehicle insurance", "In 26 days"]] },
  "Property updates": { stat: "1", rows: [["Inspection report ready", "2 hours ago"]] },
  "Document vault": { stat: "14", rows: [["Health insurance policy", "Expires in 4 months"], ["Sale deed", "Added last week"]] },
  "Family activity": { stat: "2", rows: [["Mum sent a voice note", "Today"], ["Rohan viewed the report", "Yesterday"]] },
  "Recent completions": { stat: "5", rows: [["Electricity bill paid", "Receipt saved"], ["AC serviced", "Photos added"]] },
  "Financial activity": { stat: "2", rows: [["Plumber visit approved", "Rs 1,354"], ["Society dues paid", "Rs 6,200"]] },
};

/** A working preview of the signed-in dashboard. Everything in it is sample data and nothing leaves the page. */
export function CommandPreview() {
  const names = Object.keys(PANES);
  const [pane, setPane] = useState(names[1]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const current = PANES[pane];
  return (
    <div className="card grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="grid content-start gap-1" role="group" aria-label="Sections of the sample dashboard">
        {names.map((n) => (
          <button key={n} type="button" aria-pressed={pane === n} onClick={() => setPane(n)} className={`relative flex min-h-12 items-center justify-between gap-2 rounded-xl px-3 text-left font-semibold ${pane === n ? "" : "text-muted"}`}>
            {pane === n && <m.span layoutId="preview-pane" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-tint" />}
            <span className="relative">{n}</span>
            <span className="relative tabular-nums">{n === "Pending approvals" && decision ? "0" : PANES[n].stat}</span>
          </button>
        ))}
      </div>
      <div className="grid min-h-72 content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[length:var(--text-h3)] font-semibold">{pane}</h3>
          <span className="chip" data-tone="warn">Sample data</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={pane} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast, ease: ease.out }} className="grid gap-2">
            {pane === "Pending approvals" ? (
              <div className="relative grid gap-3 rounded-xl bg-tint p-4">
                {decision === "approved" && <Burst />}
                <p className="font-semibold">Plumber visit for the Pune flat</p>
                <dl className="grid gap-1 text-[length:var(--text-small)]">
                  {[["Provider", "Rs 1,000"], ["Ally coordination", "Rs 300"], ["Taxes", "Rs 54"]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
                  <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Total</dt><dd className="tabular-nums">Rs 1,354</dd></div>
                </dl>
                {decision ? (
                  <div className="flex flex-wrap items-center gap-3"><span className="chip" data-tone={decision === "approved" ? "ok" : "warn"}>{decision === "approved" ? "Approved" : "Rejected"}</span><button type="button" className="btn btn-ghost" onClick={() => setDecision(null)}>Try again</button></div>
                ) : (
                  <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={() => setDecision("approved")}>Approve</button><button type="button" className="btn btn-secondary" onClick={() => setDecision("rejected")}>Reject</button></div>
                )}
              </div>
            ) : current.rows.map(([a, b]) => <div key={a} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-tint p-3"><span className="font-medium">{a}</span><span className="text-[length:var(--text-small)] text-muted">{b}</span></div>)}
          </m.div>
        </AnimatePresence>
        <p className="text-[length:var(--text-micro)] text-muted">A fictional example. Nothing here is a real customer, payment or request.</p>
      </div>
    </div>
  );
}
