"use client";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { dur, ease } from "@/lib/motion";
import { Metric, Panel } from "./ui";

const Row = ({ a, b, level }: { a: string; b: string; level?: "urgent" | "soon" | "info" }) => (
  <li className="flex items-center justify-between gap-3 py-2 text-[length:var(--text-small)]"><span className="flex min-w-0 items-center gap-2">{level && <span aria-hidden className="level" data-level={level} />}<span className="font-medium">{a}</span></span><span className="shrink-0 text-muted">{b}</span></li>
);

/** The Command Centre's own building blocks, filled with a fictional example. Nothing here leaves the page. */
export function CommandPreview() {
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  return (
    <div className="rounded-[18px] border border-line bg-bg p-3 sm:p-5" style={{ boxShadow: "var(--shadow-lg)" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[length:var(--text-h2)] font-bold">Good morning, Anjali.</p><p className="text-[length:var(--text-small)] text-muted">Here&apos;s what is happening back home.</p></div>
        <span className="chip" data-tone="warn">Sample data</span>
      </div>
      <div className="metric-strip mb-4">
        <Metric label="Active requests" value={3} />
        <Metric label="Pending approvals" value={decision ? 0 : 1} alert />
        <Metric label="Upcoming deadlines" value={2} alert />
        <Metric label="Properties" value={1} />
        <Metric label="Documents stored" value={14} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel title="Needs your attention">
            <div className="grid gap-3 rounded-[10px] bg-sunken p-4">
              <p className="font-semibold">Plumber visit for the Mumbai flat</p>
              <dl className="grid gap-1 text-[length:var(--text-small)]">
                {[["Provider", "Rs 1,000"], ["Ally coordination", "Rs 300"], ["Taxes", "Rs 54"]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
                <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Total</dt><dd className="tabular-nums">Rs 1,354</dd></div>
              </dl>
              <AnimatePresence mode="wait" initial={false}>
                {decision ? (
                  <m.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.out }} className="flex flex-wrap items-center gap-3"><span className="chip" data-tone={decision === "approved" ? "ok" : "warn"}>{decision === "approved" ? "Approved in this example" : "Rejected in this example"}</span><button type="button" className="btn btn-ghost" onClick={() => setDecision(null)}>Try again</button></m.div>
                ) : (
                  <m.div key="ask" exit={{ opacity: 0 }} transition={{ duration: dur.fast }} className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" onClick={() => setDecision("approved")}>Approve</button><button type="button" className="btn btn-ghost" onClick={() => setDecision("rejected")}>Reject</button></m.div>
                )}
              </AnimatePresence>
            </div>
            <ul className="rows"><Row level="soon" a="Property tax, Mumbai flat" b="In 12 days" /><Row level="info" a="Health insurance renewal" b="In 26 days" /></ul>
          </Panel>
          <Panel title="Active requests"><ul className="rows"><Row a="Water leakage visit" b="In progress" /><Row a="Certified degree copy" b="Awaiting information" /><Row a="Replace the geyser" b="Under review" /></ul></Panel>
        </div>
        <div className="grid content-start gap-4">
          <Panel title="Mumbai flat"><ul className="rows"><Row a="Tenant" b="In place" /><Row a="Last visit" b="12 Oct" /><Row a="Open requests" b="1" /></ul></Panel>
          <Panel title="Family updates"><ul className="rows"><Row a="Appointment booked for Mum" b="Today" /><Row a="Your brother viewed the report" b="Yesterday" /></ul></Panel>
          <Panel title="Recent activity"><ul className="rows"><Row a="Inspection report added" b="2 hours ago" /><Row a="Sale deed uploaded" b="Monday" /></ul></Panel>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--text-micro)] text-muted">A fictional example. Nothing here is a real customer, payment or request.</p>
    </div>
  );
}
