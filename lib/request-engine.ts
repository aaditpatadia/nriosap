/** Rules that read a request. No AI service is involved, so nothing leaves the server and the result is the same every time. */

export const SERVICE_CATEGORIES = [
  "Property and Assets",
  "Documents and Government Paperwork",
  "Family and Personal Assistance",
  "Bills and Renewals",
  "Repairs and Local Services",
  "Insurance Administration",
  "Business and Administrative Coordination",
  "Custom Requests",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const REQUEST_STATUSES = ["submitted", "under_review", "awaiting_information", "quotation_ready", "awaiting_approval", "approved", "assigned", "in_progress", "awaiting_customer", "completed", "cancelled", "disputed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_META: Record<RequestStatus, { label: string; who: string; next: string; tone?: "ok" | "warn" | "danger" | "accent"; step: number }> = {
  submitted: { label: "Submitted", who: "Your coordinator", next: "Your coordinator will read this and reply.", step: 0 },
  under_review: { label: "Under Review", who: "Your coordinator", next: "Your coordinator is working out what this needs.", step: 1 },
  awaiting_information: { label: "Awaiting Information", who: "You", next: "Your coordinator needs a detail from you.", tone: "warn", step: 1 },
  quotation_ready: { label: "Quotation Ready", who: "Your coordinator", next: "A quotation is being prepared for you.", step: 2 },
  awaiting_approval: { label: "Awaiting Approval", who: "You", next: "Review the quotation. Nothing happens until you decide.", tone: "warn", step: 2 },
  approved: { label: "Approved", who: "Your coordinator", next: "Your coordinator will arrange the work.", tone: "ok", step: 3 },
  assigned: { label: "Assigned", who: "Your coordinator", next: "Someone has been assigned and the work will start soon.", step: 4 },
  in_progress: { label: "In Progress", who: "Your coordinator", next: "The work is under way.", tone: "accent", step: 4 },
  awaiting_customer: { label: "Awaiting Customer", who: "You", next: "The work is waiting on you.", tone: "warn", step: 4 },
  completed: { label: "Completed", who: "Nobody", next: "This is finished. The report is below.", tone: "ok", step: 5 },
  cancelled: { label: "Cancelled", who: "Nobody", next: "This was cancelled.", step: 0 },
  disputed: { label: "Disputed", who: "Your coordinator", next: "Your coordinator is looking into what went wrong.", tone: "danger", step: 4 },
};
export const STAGES = ["Request", "Understand", "Coordinate", "Approve", "Execute", "Verify"] as const;
export const isOpenStatus = (s: RequestStatus) => s !== "completed" && s !== "cancelled";

const CITIES = ["Mumbai", "Delhi", "New Delhi", "Bengaluru", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Pune", "Surat", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal", "Vadodara", "Baroda", "Rajkot", "Noida", "Gurugram", "Gurgaon", "Thane", "Nashik", "Goa", "Kochi", "Chandigarh", "Coimbatore", "Mysuru", "Patna", "Ludhiana", "Amritsar", "Visakhapatnam", "Bhubaneswar", "Guwahati"];

const CATEGORY_RULES: [ServiceCategory, RegExp][] = [
  ["Insurance Administration", /\b(insurance|insurer|cashless|health card|policy|premium)\b/i],
  ["Business and Administrative Coordination", /\b(bank|nre|nro|passbook|locker|cheque|kyc|demat|supplier|vendor|factory|gst|company|invoice|business|sample|manufacturer)\b/i],
  ["Documents and Government Paperwork", /\b(pan|aadhaar|aadhar|passport|oci|certificate|attest\w*|apostille|notary|affidavit|ration card|government|degree|birth certificate|driving licen[cs]e)\b/i],
  ["Bills and Renewals", /\b(bill|electricity|water bill|gas bill|renew\w*|due date|subscription|maintenance charge)\b/i],
  ["Repairs and Local Services", /\b(leak\w*|plumber|electrician|repair|paint\w*|ac\b|air conditioner|geyser|broken|clean\w*|pest|buy|purchase|deliver\w*|courier|gift|parcel|order)\b/i],
  ["Property and Assets", /\b(flat|apartment|property|tenant|rent\w*|house|plot|land|society|vehicle|car|inspection)\b/i],
  ["Family and Personal Assistance", /\b(hospital|discharge|doctor|appointment|pharmacy|mother|father|mum|mom|dad|parents?|grandmother|grandfather|sister|brother|family|visit (my|our))\b/i],
];

/** Things Ally will never do. Each carries a plain reason, shown to the customer. */
const REFUSALS: [RegExp, string][] = [
  [/\b(bribe|bribing|grease (the|his|her)|under the table|speed money)\b/i, "We cannot pay or arrange a bribe. We only use lawful routes, even when they are slower."],
  [/\b(fake|forge\w*|false|backdate\w*|counterfeit)\b.*\b(document|certificate|signature|id|pan|aadhaar|passport|receipt|bill|invoice)\b/i, "We cannot create or alter false documents."],
  [/\b(hawala|black money|launder\w*|avoid.*\bfema\b|evade\w* tax|tax evasion)\b/i, "We cannot help move or hide money unlawfully."],
  [/\b(spy on|stalk\w*|track (his|her) (phone|location)|harass\w*|threaten\w*|intimidat\w*|evict .* by force|forcibly)\b/i, "We cannot do anything that harms, threatens or secretly watches another person."],
  [/\b(without (his|her|their) (knowledge|consent)|forge .* signature|sign on (his|her|their) behalf)\b/i, "We need the agreement of the person this involves."],
  [/\b(drugs?|narcotics|weapons?|firearms?|explosives?)\b/i, "We cannot buy, carry or deliver this."],
];

const MONEY_TRANSFER = /\b(send|transfer|remit|wire)\b.*\b(money|funds|rupees|dollars|pounds|lakhs?)\b/i;

const NEEDS_PROFESSIONAL: RegExp[] = [
  /\bshould (i|we)\b/i,
  /\b(is|are) (it|this|that) (legal|illegal|taxable|safe)\b/i,
  /\bhow much (tax|stamp duty|capital gains)\b/i,
  /\b(what|which) (tax|medicine|treatment|dose)\b/i,
  /\b(can|could) (i|we) (sue|avoid|save (on )?tax)\b/i,
  /\b(legal|tax|medical) (advice|opinion)\b/i,
  /\bwhat (are|is) my (legal )?(rights?|options?)\b/i,
];

const URGENT = /\b(urgent\w*|asap|immediately|emergency|today|tonight|right away|flood\w*|fire|gas leak)\b/i;

const ACTIONS: [RegExp, string][] = [
  [/\binspect\w*|check on\b/i, "Local visit"],
  [/\bpay\b|payment/i, "Arrange a payment, after your approval"],
  [/\bcollect\b|pick up/i, "Collect in person"],
  [/\brepair|fix\b|plumber|electrician/i, "Book and supervise a repair"],
  [/\brenew/i, "Prepare the renewal"],
  [/\bbuy|purchase|deliver/i, "Buy and deliver"],
  [/\bvisit\b/i, "Local visit"],
  [/\bfile\b|apply|application/i, "Prepare the application for your approval"],
];

export type Verdict = "ok" | "needs_professional" | "not_possible";

export interface Understanding {
  category: ServiceCategory;
  location: string | null;
  action: string | null;
  urgent: boolean;
  missing: string[];
  verdict: Verdict;
  reason: string | null;
}

export function understandRequest(raw: string): Understanding {
  const text = raw.trim();
  const refusal = REFUSALS.find(([re]) => re.test(text));
  const money = MONEY_TRANSFER.test(text);
  const professional = NEEDS_PROFESSIONAL.some((re) => re.test(text));
  const category = CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? "Custom Requests";
  const found = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  const location = found === "Bangalore" ? "Bengaluru" : found === "Baroda" ? "Vadodara" : found === "Gurgaon" ? "Gurugram" : (found ?? null);
  const action = ACTIONS.find(([re]) => re.test(text))?.[1] ?? null;

  const missing: string[] = [];
  if (!location) missing.push("Which city in India is this in?");
  if (category === "Property and Assets" && !/\b(address|society|sector|road|flat no|building)\b/i.test(text)) missing.push("What is the full address?");
  if (/\b(tenant|someone there|caretaker)\b/i.test(text) && !/\b\d{10}\b/.test(text)) missing.push("Who should we contact there, and on what number?");
  if (/\bbill|tax|premium|payment\b/i.test(text) && !/\b(rs\.?|inr|₹)\s*\d|\d{3,}/i.test(text)) missing.push("Do you know the amount, or can you add a photo of the bill?");
  if (!/\b(by|before|this week|next week|today|tomorrow|urgent\w*|asap|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(text)) missing.push("When do you need this done by?");

  if (refusal) return { category, location, action, urgent: false, missing: [], verdict: "not_possible", reason: refusal[1] };
  if (money) return { category: "Business and Administrative Coordination", location, action, urgent: false, missing: [], verdict: "not_possible", reason: "We cannot send money across borders. That needs a licensed partner, and we are not one. We can arrange a payment in India from funds you control, once you approve it." };
  return {
    category,
    location,
    action,
    urgent: URGENT.test(text),
    missing: missing.slice(0, 4),
    verdict: professional ? "needs_professional" : "ok",
    reason: professional ? "Part of this needs a licensed professional. We can prepare the papers and connect you, but we cannot give the advice ourselves." : null,
  };
}

/** A short title for lists: the first sentence, cut at a word. */
export function requestTitle(text: string): string {
  const first = text.trim().split(/(?<=[.?!])\s/)[0].replace(/\s+/g, " ");
  if (first.length <= 80) return first;
  return `${first.slice(0, 80).replace(/\s+\S*$/, "")}...`;
}

// ---------- Vault categories ----------
export const DOCUMENT_CATEGORIES = { identity: "Identity", property: "Property", banking: "Banking and Financial Records", insurance: "Insurance", family: "Family", legal: "Legal and Authorisations", business: "Business", other: "Other" } as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;
export const isDocumentCategory = (c: unknown): c is DocumentCategory => typeof c === "string" && c in DOCUMENT_CATEGORIES;

/** Sorts a document from what the reader found and the file name. The customer can change it. */
export function categoriseDocument(kind: string | undefined, title: string): DocumentCategory {
  const t = title.toLowerCase();
  if (kind === "policy" || /insur|policy|premium/.test(t)) return "insurance";
  if (kind === "id" || /\b(pan|aadhaar|aadhar|passport|oci)\b/.test(t)) return "identity";
  if (/deed|agreement|rent|society|property|tax receipt|khata|registry/.test(t)) return "property";
  if (/\b(bank|statement|nre|nro|cheque)\b/.test(t)) return "banking";
  if (/power of attorney|\bpoa\b|affidavit|attest|legal/.test(t)) return "legal";
  if (/invoice|supplier|contract|gst|company/.test(t)) return "business";
  if (kind === "discharge_summary" || kind === "report" || /medical|hospital|birth|marriage/.test(t)) return "family";
  return "other";
}

// ---------- Family permissions ----------
export const PERMISSIONS = {
  view_requests: "See requests and their progress",
  create_requests: "Ask for work to be done",
  view_documents: "See all documents in the vault",
  upload_documents: "Add documents",
  view_activity: "See the activity timeline",
  view_bills: "See bills and renewals",
  manage_bills: "Add and update bills and renewals",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const RELATIONS = { parent: "Parent", sibling: "Sibling", spouse: "Spouse", relative: "Other relative", representative: "Trusted representative" } as const;
export type Relation = keyof typeof RELATIONS;
export const DEFAULT_PERMISSIONS: Record<Relation, Permission[]> = {
  parent: ["view_requests", "create_requests", "view_activity"],
  sibling: ["view_requests", "upload_documents", "view_activity"],
  spouse: ["view_requests", "create_requests", "view_documents", "upload_documents", "view_activity"],
  relative: ["view_requests"],
  representative: ["view_requests", "create_requests"],
};

// ---------- Your Ally Briefing ----------
export interface BriefingInput {
  now: Date;
  approvals: { summary: string }[];
  awaitingInfo: { ref: string; title: string }[];
  deadlines: { label: string; at: string }[];
  expiring: { title: string; at: string }[];
  completedThisMonth: number;
  ownerConsentPending: boolean;
}
export interface BriefingLine { text: string; section: string }

const daysFrom = (iso: string, now: Date) => Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
const inDays = (n: number) => (n < 0 ? `was due ${-n} day${n === -1 ? "" : "s"} ago` : n === 0 ? "is due today" : `is due in ${n} day${n === 1 ? "" : "s"}`);

/** Every line comes from the customer's own records. With nothing to say, it says nothing. */
export function buildBriefing(i: BriefingInput): BriefingLine[] {
  const out: BriefingLine[] = [];
  if (i.ownerConsentPending) out.push({ text: "Your consent is needed before we can read or keep documents.", section: "" });
  for (const a of i.approvals) out.push({ text: `Waiting for your decision: ${a.summary}.`, section: "/approvals" });
  for (const r of i.awaitingInfo) out.push({ text: `Your coordinator needs a detail from you on ${r.ref}: ${r.title}`, section: `/requests` });
  const soon = i.deadlines.map((d) => ({ ...d, days: daysFrom(d.at, i.now) })).filter((d) => d.days <= 30).sort((a, b) => a.days - b.days);
  for (const d of soon.slice(0, 4)) out.push({ text: `${d.label} ${inDays(d.days)}.`, section: "/calendar" });
  for (const d of i.expiring.filter((x) => daysFrom(x.at, i.now) <= 60).slice(0, 3)) {
    const n = daysFrom(d.at, i.now);
    out.push({ text: n < 0 ? `${d.title} has expired.` : `${d.title} expires in ${n} day${n === 1 ? "" : "s"}.`, section: "/documents" });
  }
  return out.slice(0, 8);
}

export function greetingFor(now: Date, timezone?: string | null): "morning" | "afternoon" | "evening" {
  let hour = (now.getUTCHours() + 5) % 24;
  try {
    hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone || "Asia/Kolkata" }).format(now));
  } catch {
    // an unknown time zone falls back to the estimate above
  }
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
