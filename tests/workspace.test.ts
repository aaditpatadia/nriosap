import { describe, expect, it } from "vitest";
import { answerQuestion, factsAsText, type AssistantFacts } from "@/lib/assistant";
import { simplePdf } from "@/lib/pdf";
import { DEFAULT_PLANS, planForPrice, requestLimitReason, requestsLeft, visitBlockedReason } from "@/lib/plan-rules";
import { understandRequest } from "@/lib/request-engine";
import { buildAttention, buildMonthlyReport, daysBetween, nextDue, partnerMoveProblem, reminderIsDue, ROLE_PERMISSIONS } from "@/lib/workspace-rules";

const [lite, family, plus] = DEFAULT_PLANS;

describe("plans", () => {
  it("keeps the three published prices", () => expect(DEFAULT_PLANS.map((p) => p.priceUsd)).toEqual([40, 79, 119]));
  it("Lite stops at three new requests and says why", () => {
    expect(requestLimitReason(lite, 2)).toBeNull();
    expect(requestLimitReason(lite, 3)).toMatch(/3 new requests/);
    expect(requestsLeft(lite, 2)).toBe(1);
  });
  it("Family and Plus have no monthly limit", () => {
    expect(requestLimitReason(family, 500)).toBeNull();
    expect(requestsLeft(plus, 500)).toBeNull();
  });
  it("an old price gets the closest plan at or below it", () => {
    expect(planForPrice(49).slug).toBe("lite");
    expect(planForPrice(150).slug).toBe("plus");
    expect(planForPrice(10).slug).toBe("lite");
  });
  it("copy and limits cannot contradict: no plan promises unlimited visits", () => {
    for (const p of DEFAULT_PLANS) expect(p.features.join(" ")).not.toMatch(/no visit cap|unlimited visit/i);
  });
  it("visits need the plan or an approved quotation", () => {
    expect(visitBlockedReason(family, false)).toMatch(/approved quotation/);
    expect(visitBlockedReason(family, true)).toBeNull();
    expect(visitBlockedReason(plus, false)).toMatch(/approved quotation/);
  });
});

describe("dates and reminders", () => {
  it("rolls repeating items forward, keeping month ends valid", () => {
    expect(nextDue("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDue("2026-11-10", "quarterly")).toBe("2027-02-10");
    expect(nextDue("2026-11-10", "yearly")).toBe("2027-11-10");
    expect(nextDue("2026-11-10", "none")).toBeNull();
  });
  it("shows a reminder from the earliest window, a custom date, or once overdue", () => {
    expect(reminderIsDue({ dueOn: "2026-12-20", reminderDays: [30, 15] }, "2026-11-10")).toBe(false);
    expect(reminderIsDue({ dueOn: "2026-12-10", reminderDays: [30, 15] }, "2026-11-10")).toBe(true);
    expect(reminderIsDue({ dueOn: "2027-06-01", reminderDays: [7], reminderOn: "2026-11-01" }, "2026-11-10")).toBe(true);
    expect(reminderIsDue({ dueOn: "2026-11-01", reminderDays: [] }, "2026-11-10")).toBe(true);
    expect(reminderIsDue({ dueOn: "2026-12-10", reminderDays: [] }, "2026-11-10")).toBe(false);
  });
  it("counts whole days", () => expect(daysBetween("2026-11-10", "2026-11-12")).toBe(2));
});

describe("needs your attention", () => {
  const empty = { today: "2026-11-10", consentPending: false, quotes: [], approvals: [], awaiting: [], deadlines: [], documents: [], waitingTasks: [] };
  it("says nothing when there is nothing", () => expect(buildAttention(empty)).toEqual([]));
  it("puts the most urgent first", () => {
    const list = buildAttention({ ...empty, deadlines: [{ id: "a", title: "Later", dueOn: "2026-12-05", reminderDays: [30] }, { id: "b", title: "Overdue", dueOn: "2026-11-01", reminderDays: [30] }], documents: [{ id: "d", title: "Passport", expiresOn: "2026-11-20" }] });
    expect(list.map((x) => x.title)).toEqual(["Overdue", "Passport expires soon", "Later"]);
    expect(list[0].level).toBe("urgent");
  });
  it("leaves out dates that are not close yet", () => {
    expect(buildAttention({ ...empty, deadlines: [{ id: "a", title: "Far", dueOn: "2027-06-01", reminderDays: [30] }], documents: [{ id: "d", title: "Passport", expiresOn: "2030-01-01" }] })).toEqual([]);
  });
});

describe("service partners", () => {
  it("cannot be approved before both checks", () => {
    expect(partnerMoveProblem({ identityChecked: false, referencesChecked: false }, "references_checked")).toBeTruthy();
    expect(partnerMoveProblem({ identityChecked: true, referencesChecked: false }, "approved")).toBeTruthy();
    expect(partnerMoveProblem({ identityChecked: true, referencesChecked: true }, "approved")).toBeNull();
  });
  it("can always be suspended", () => expect(partnerMoveProblem({ identityChecked: false, referencesChecked: false }, "suspended")).toBeNull());
});

describe("family roles", () => {
  it("a read-only viewer can change nothing", () => expect(ROLE_PERMISSIONS.viewer.filter((p) => !p.startsWith("view_"))).toEqual([]));
  it("no role can decide a cost", () => expect(Object.values(ROLE_PERMISSIONS).flat().some((p) => /approve|pay/.test(p))).toBe(false));
});

describe("request categories", () => {
  it("files the brief's example under repairs, in Mumbai", () => {
    expect(understandRequest("I need someone to visit my flat in Mumbai because the tenant says there is a water leakage.")).toMatchObject({ category: "Repairs and Local Services", location: "Mumbai", verdict: "ok" });
  });
  it("files insurance, banking and paperwork where the site says they go", () => {
    expect(understandRequest("Please renew my health insurance policy").category).toBe("Insurance Administration");
    expect(understandRequest("Help with my NRO bank passbook").category).toBe("Business and Administrative Coordination");
    expect(understandRequest("I need a certified copy of my birth certificate").category).toBe("Documents and Government Paperwork");
  });
});

const facts: AssistantFacts = {
  today: "2026-11-10", base: "/family/x",
  requests: [{ id: "r1", ref: "ALY-1", title: "Fix leak", status: "awaiting_information", statusLabel: "Awaiting Information", location: "Pune", completedAt: null, propertyId: "p1" }, { id: "r2", ref: "ALY-2", title: "Collect copy", status: "completed", statusLabel: "Completed", location: null, completedAt: "2026-11-02T10:00:00Z", propertyId: null }],
  deadlines: [{ id: "d1", title: "Property tax", dueOn: "2026-11-14", status: "upcoming", propertyId: "p1" }],
  documents: [{ id: "h", title: "Health insurance policy", category: "insurance", tags: [], expiresOn: "2027-03-14", uploadedAt: "2026-10-01T00:00:00Z", propertyId: null, extracted: { Insurer: "Demo", "Policy number": "XX1234" } }],
  properties: [{ id: "p1", name: "Pune flat", city: "Pune" }],
  visits: [{ id: "v1", purpose: "Leak inspection", status: "completed", scheduledAt: "2026-11-01T10:00:00Z", propertyId: "p1", notes: "Damp near window.", nextSteps: "Call a plumber." }],
  approvals: [{ id: "a1", summary: "Plumber visit" }],
};

describe("Ally Assistant", () => {
  it("answers what needs attention, with sources", () => {
    const a = answerQuestion("What needs my attention this week?", facts);
    expect(a.kind).toBe("answer");
    expect(a.sources.map((s) => s.label)).toEqual(["Plumber visit", "ALY-1: Fix leak", "Property tax"]);
  });
  it("names the source and date for a document question", () => {
    const a = answerQuestion("When does my health insurance expire?", facts);
    expect(a.text).toContain("2027-03-14");
    expect(a.sources[0].label).toBe("Health insurance policy");
  });
  it("reports the last inspection for a property", () => expect(answerQuestion("Show me the last inspection report for the Pune flat", facts).text).toContain("Damp near window"));
  it("summarises what completed this month", () => expect(answerQuestion("Summarise everything completed this month.", facts).sources[0].label).toContain("ALY-2"));
  it("prepares a request for review and never sends it", () => {
    const a = answerQuestion("Help me create a request for a property inspection.", facts);
    expect(a.draft?.href).toContain("/requests/new?text=");
  });
  it("refuses to pay, sign, file or approve", () => {
    for (const q of ["Pay the electricity bill for me", "Approve this quotation now", "Sign it on my behalf"]) expect(answerQuestion(q, facts).kind).toBe("refused");
  });
  it("refuses advice", () => expect(answerQuestion("Should I sue my tenant?", facts).kind).toBe("refused"));
  it("does not invent an answer", () => expect(answerQuestion("xylophone quartz", facts).kind).toBe("none"));
  it("never gives extracted values to the outside AI text", () => expect(factsAsText(facts)).not.toContain("XX1234"));
});

describe("monthly report", () => {
  const base = { month: "2026-11", today: "2026-11-10", visits: [], documents: [], deadlines: [], quotes: [], updates: [] };
  const req = (status: string, category: string, propertyId: string | null, completedAt: string | null = null) => ({ title: status, ref: "A", status, category, propertyId, createdAt: "2026-11-01T00:00:00Z", completedAt });
  it("separates completed from in progress and lists what waits on the customer", () => {
    const r = buildMonthlyReport({ ...base, requests: [req("completed", "X", null, "2026-11-05T00:00:00Z"), req("awaiting_approval", "X", null), req("completed", "X", null, "2026-10-05T00:00:00Z")] });
    expect(r.completed).toHaveLength(1);
    expect(r.inProgress).toHaveLength(1);
    expect(r.pending).toHaveLength(1);
  });
  it("filters by category and property", () => {
    const requests = [req("in_progress", "A", "p1"), req("in_progress", "B", "p2")];
    expect(buildMonthlyReport({ ...base, requests, category: "A" }).inProgress).toHaveLength(1);
    expect(buildMonthlyReport({ ...base, requests, propertyId: "p2" }).inProgress[0].status).toBe("in_progress");
  });
});

describe("PDF report", () => {
  const text = (b: Uint8Array) => new TextDecoder().decode(b);
  it("writes a well formed file", () => {
    const out = text(simplePdf([{ text: "Hello", bold: true, size: 18 }, { text: "World" }]));
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("(Hello) Tj");
    expect(out.trimEnd().endsWith("%%EOF")).toBe(true);
  });
  it("escapes brackets and replaces characters the font cannot show", () => expect(text(simplePdf([{ text: "a(b) ₹" }]))).toContain("(a\\(b\\) ?) Tj"));
  it("runs onto more pages", () => expect(text(simplePdf(Array.from({ length: 200 }, (_, i) => ({ text: `Line ${i}` }))))).toMatch(/\/Count [2-9]/));
});
