import { understandRequest } from "./request-engine";
import { looksLikeAdvice } from "./rules";
import { daysBetween, whenWords } from "./workspace-rules";

/**
 * Answers from the records it is handed. The caller only passes what the signed-in person may see.
 * It reads and prepares. It has no way to pay, sign, file or approve anything.
 */
export interface AssistantFacts {
  today: string;
  base: string;
  requests: { id: string; ref: string; title: string; status: string; statusLabel: string; location: string | null; completedAt: string | null; propertyId: string | null }[];
  deadlines: { id: string; title: string; dueOn: string; status: string; propertyId: string | null }[];
  documents: { id: string; title: string; category: string; tags: string[]; expiresOn: string | null; uploadedAt: string; propertyId: string | null; extracted: Record<string, string> }[];
  properties: { id: string; name: string; city: string | null }[];
  visits: { id: string; purpose: string; status: string; scheduledAt: string; propertyId: string | null; notes: string | null; nextSteps: string | null }[];
  approvals: { id: string; summary: string }[];
}

export interface Source { label: string; detail: string; href: string }
export interface AssistantAnswer { kind: "answer" | "refused" | "none"; text: string; sources: Source[]; draft?: { label: string; href: string }; checklist?: string[] }

const OPEN = (s: string) => s !== "completed" && s !== "cancelled";
const STOP = new Set(["when", "does", "do", "my", "the", "a", "an", "of", "in", "on", "for", "to", "is", "it", "what", "which", "find", "show", "me", "all", "latest", "related", "documents", "document", "expire", "expires", "please", "with", "about", "last", "i", "have", "are", "any"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));

function docSource(d: AssistantFacts["documents"][number], f: AssistantFacts, detail?: string): Source {
  return { label: d.title, detail: detail ?? (d.expiresOn ? `Expires ${d.expiresOn}` : `Added ${d.uploadedAt.slice(0, 10)}`), href: `${f.base}/documents?q=${encodeURIComponent(d.title)}` };
}
const propertyIn = (q: string, f: AssistantFacts) => f.properties.find((p) => q.includes(p.name.toLowerCase()) || (p.city && q.includes(p.city.toLowerCase())) || words(p.name).some((w) => w.length > 3 && q.includes(w)));

function searchDocs(q: string, f: AssistantFacts) {
  const want = words(q);
  if (want.length === 0) return [];
  return f.documents
    .map((d) => ({ d, score: want.filter((w) => [d.title, d.category, ...d.tags, ...Object.keys(d.extracted), ...Object.values(d.extracted)].join(" ").toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.uploadedAt.localeCompare(a.d.uploadedAt))
    .map((x) => x.d);
}

export function answerQuestion(question: string, f: AssistantFacts): AssistantAnswer {
  const q = question.trim().toLowerCase();
  const base = f.base;
  if (/\b(pay|transfer|send money|sign|approve|file|submit)\b.*\b(for me|on my behalf|now|this|it)\b/.test(q) || /^(pay|approve|sign|file)\b/.test(q)) {
    return { kind: "refused", text: "I cannot pay, sign, file or approve anything. Those steps stay with you and your coordinator. I can help you prepare a request instead.", sources: [], draft: { label: "Prepare a request", href: `${base}/requests/new?text=${encodeURIComponent(question.slice(0, 300))}` } };
  }
  if (looksLikeAdvice(question) || understandRequest(question).verdict === "needs_professional") {
    return { kind: "refused", text: "That needs a licensed professional, so I will not answer it myself. I can prepare the papers and your coordinator can connect you with one.", sources: [], draft: { label: "Ask for a professional", href: `${base}/requests/new?text=${encodeURIComponent(question.slice(0, 300))}` } };
  }

  if (/\b(create|make|raise|start|help me).*\brequest\b|\bneed someone\b/.test(q)) {
    const cleaned = question.replace(/^help me (create|make|raise|start) a request (for|to)\s*/i, "").slice(0, 300);
    return { kind: "answer", text: "Here is a draft. You can read and change it before anything is sent.", sources: [], draft: { label: "Review the draft request", href: `${base}/requests/new?text=${encodeURIComponent(`I need help with: ${cleaned}`)}` } };
  }

  if (/\bcheck ?list\b/.test(q)) {
    const inspection = /inspect|visit|flat|property/.test(q);
    return { kind: "answer", text: inspection ? "A starting checklist for a property visit. Your coordinator can adjust it." : "A starting checklist. Your coordinator can adjust it.", sources: [], checklist: inspection ? ["Full address and who can open the door", "What to look at, room by room", "Meter readings to note", "Photos to take", "Who to tell afterwards"] : ["What exactly needs doing", "Where it needs doing", "Who is involved and whether they agree", "Papers needed", "By when"] };
  }

  if (/\b(draft|write) .*(message|note|whatsapp)\b/.test(q)) {
    return { kind: "answer", text: "Here is a draft message. Nothing has been sent.\n\nHello, I am writing about the work at home. Could you please tell me where things stand, and whether you need anything from me? Thank you.", sources: [] };
  }

  if (/\b(attention|this week|to do|need.* me|waiting)\b/.test(q)) {
    const soon = f.deadlines.filter((d) => d.status === "upcoming" && daysBetween(f.today, d.dueOn) <= 7);
    const waiting = f.requests.filter((r) => ["awaiting_information", "awaiting_approval", "awaiting_customer"].includes(r.status));
    const sources: Source[] = [
      ...f.approvals.map((a) => ({ label: a.summary, detail: "Waiting for your decision", href: `${base}/approvals` })),
      ...waiting.map((r) => ({ label: `${r.ref}: ${r.title}`, detail: r.statusLabel, href: `${base}/requests/${r.id}` })),
      ...soon.map((d) => ({ label: d.title, detail: whenWords(daysBetween(f.today, d.dueOn)), href: `${base}/bills` })),
    ];
    return sources.length ? { kind: "answer", text: `${sources.length} thing${sources.length === 1 ? "" : "s"} need${sources.length === 1 ? "s" : ""} you this week.`, sources } : { kind: "answer", text: "Nothing needs you this week.", sources: [] };
  }

  if (/\b(bills?|due|renewals?|deadlines?)\b/.test(q) && !/expir/.test(q)) {
    const month = f.today.slice(0, 7);
    const list = f.deadlines.filter((d) => d.status === "upcoming" && (/\bmonth\b/.test(q) ? d.dueOn.slice(0, 7) === month || d.dueOn < f.today : true)).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 10);
    return list.length ? { kind: "answer", text: `I found ${list.length} open item${list.length === 1 ? "" : "s"}.`, sources: list.map((d) => ({ label: d.title, detail: `${d.dueOn}. ${whenWords(daysBetween(f.today, d.dueOn))}`, href: `${base}/bills` })) } : { kind: "answer", text: "You have no open bills or renewals in Ally.", sources: [] };
  }

  if (/\bcompleted|finished|done\b/.test(q) && /\bmonth\b/.test(q)) {
    const done = f.requests.filter((r) => r.completedAt?.slice(0, 7) === f.today.slice(0, 7));
    return done.length ? { kind: "answer", text: `${done.length} request${done.length === 1 ? " was" : "s were"} completed this month.`, sources: done.map((r) => ({ label: `${r.ref}: ${r.title}`, detail: "Completed", href: `${base}/requests/${r.id}` })) } : { kind: "answer", text: "No requests have been completed this month yet.", sources: [] };
  }

  if (/\binspection|last visit|recent visit\b/.test(q)) {
    const p = propertyIn(q, f);
    const v = f.visits.filter((x) => x.status === "completed" && (!p || x.propertyId === p.id)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
    if (!v) return { kind: "answer", text: "I could not find a completed visit report.", sources: [] };
    return { kind: "answer", text: `The last report is from ${v.scheduledAt.slice(0, 10)}: ${v.purpose}.${v.notes ? ` ${v.notes}` : ""}${v.nextSteps ? ` Next steps: ${v.nextSteps}` : ""}`, sources: [{ label: v.purpose, detail: v.scheduledAt.slice(0, 10), href: `${base}/properties${v.propertyId ? `/${v.propertyId}` : ""}` }] };
  }

  if (/\bexpir/.test(q) && !words(q.replace(/expir\w*/g, "")).length) {
    const list = f.documents.filter((d) => d.expiresOn).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!)).slice(0, 10);
    return list.length ? { kind: "answer", text: `${list.length} document${list.length === 1 ? " has an expiry date" : "s have expiry dates"}. The soonest is first.`, sources: list.map((d) => docSource(d, f)) } : { kind: "answer", text: "None of your documents have an expiry date recorded.", sources: [] };
  }

  if (/\bmissing\b/.test(q)) {
    const expected = /propert/.test(q) ? ["sale deed", "property tax", "society", "rent agreement"] : ["pan", "passport", "insurance"];
    const lacks = expected.filter((e) => !f.documents.some((d) => d.title.toLowerCase().includes(e)));
    return { kind: "answer", text: lacks.length ? `I could not find a document with these words in its name: ${lacks.join(", ")}. They may be stored under another name.` : "I found a document matching each of the common items I check for.", sources: [] };
  }

  const p = propertyIn(q, f);
  if (p && !/\bdocument|receipt|deed|agreement\b/.test(q)) {
    const reqs = f.requests.filter((r) => r.propertyId === p.id && OPEN(r.status));
    const due = f.deadlines.filter((d) => d.propertyId === p.id && d.status === "upcoming");
    const v = f.visits.filter((x) => x.propertyId === p.id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
    return { kind: "answer", text: `${p.name}: ${reqs.length} open request${reqs.length === 1 ? "" : "s"}, ${due.length} upcoming date${due.length === 1 ? "" : "s"}.${v ? ` Latest visit: ${v.purpose} (${v.status}, ${v.scheduledAt.slice(0, 10)}).` : " No visits recorded."}`, sources: [{ label: p.name, detail: "Property", href: `${base}/properties/${p.id}` }, ...reqs.map((r) => ({ label: `${r.ref}: ${r.title}`, detail: r.statusLabel, href: `${base}/requests/${r.id}` }))] };
  }

  const docs = p ? f.documents.filter((d) => d.propertyId === p.id || d.title.toLowerCase().includes(p.name.toLowerCase())).concat(searchDocs(q, f)).filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i) : searchDocs(q, f);
  if (docs.length) {
    const top = docs[0];
    const expiry = top.expiresOn ?? top.extracted["Renewal date"] ?? top.extracted["Expiry date"];
    const text = /\bexpir|renew/.test(q) && expiry ? `${top.title} ${/renew/.test(q) ? "renews" : "expires"} on ${expiry}.` : `I found ${docs.length} matching document${docs.length === 1 ? "" : "s"}. The closest match is ${top.title}.`;
    return { kind: "answer", text, sources: docs.slice(0, 6).map((d) => docSource(d, f, d === top && expiry ? `Date on record: ${expiry}` : undefined)) };
  }
  const reqs = f.requests.filter((r) => words(q).some((w) => r.title.toLowerCase().includes(w)));
  if (reqs.length) return { kind: "answer", text: `I found ${reqs.length} matching request${reqs.length === 1 ? "" : "s"}.`, sources: reqs.slice(0, 6).map((r) => ({ label: `${r.ref}: ${r.title}`, detail: r.statusLabel, href: `${base}/requests/${r.id}` })) };
  return { kind: "none", text: "I could not find that in your Ally records. I only know what is stored here, so I will not guess.", sources: [] };
}

/** Titles, dates and statuses only. Extracted document values and files are never included. */
export function factsAsText(f: AssistantFacts): string {
  return [
    `Today: ${f.today}`,
    ...f.requests.slice(0, 40).map((r) => `Request ${r.ref}: ${r.title} (${r.statusLabel})`),
    ...f.deadlines.slice(0, 40).map((d) => `Date: ${d.title}, due ${d.dueOn}, ${d.status}`),
    ...f.documents.slice(0, 40).map((d) => `Document: ${d.title}, ${d.category}${d.expiresOn ? `, expires ${d.expiresOn}` : ""}`),
    ...f.properties.map((p) => `Property: ${p.name}${p.city ? `, ${p.city}` : ""}`),
    ...f.visits.slice(0, 20).map((v) => `Visit: ${v.purpose}, ${v.status}, ${v.scheduledAt.slice(0, 10)}`),
    ...f.approvals.map((a) => `Waiting for approval: ${a.summary}`),
  ].join("\n");
}
