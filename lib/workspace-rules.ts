/** Rules for bills, reminders, what needs attention, partner checks and reports. No database and no outside service. */

// ---------- Dates, all compared as YYYY-MM-DD in India ----------
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export function whenWords(days: number): string {
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}

// ---------- Bills and renewals ----------
export const DEADLINE_KINDS = { electricity: "Electricity bill", water: "Water bill", society: "Society maintenance", property_tax: "Property tax", rent_agreement: "Rent agreement expiry", insurance: "Insurance renewal", vehicle_insurance: "Vehicle insurance", appointment: "Family appointment", other: "Something else" } as const;
export type DeadlineKind = keyof typeof DEADLINE_KINDS;
export const RECURRENCES = { none: "Does not repeat", monthly: "Every month", quarterly: "Every 3 months", half_yearly: "Every 6 months", yearly: "Every year" } as const;
export type Recurrence = keyof typeof RECURRENCES;
export const REMINDER_CHOICES = [30, 15, 7, 0] as const;

const MONTHS: Record<Recurrence, number> = { none: 0, monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

/** The next due date. A date such as the 31st moves to the last day of a shorter month. */
export function nextDue(due: string, recurrence: Recurrence): string | null {
  const add = MONTHS[recurrence];
  if (!add) return null;
  const [y, m, d] = due.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + add, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** A deadline starts showing at its earliest chosen reminder, or on a custom date if that comes first. */
export function reminderIsDue(i: { dueOn: string; reminderDays: number[]; reminderOn?: string | null }, today: string): boolean {
  const days = daysBetween(today, i.dueOn);
  if (days < 0) return true;
  if (i.reminderOn && today >= i.reminderOn) return true;
  return i.reminderDays.length > 0 && days <= Math.max(...i.reminderDays);
}

// ---------- Needs your attention ----------
export type AttentionLevel = "urgent" | "soon" | "info";
export interface AttentionItem { key: string; level: AttentionLevel; title: string; detail: string; href: string; action: string }
export interface AttentionInput {
  today: string;
  consentPending: boolean;
  quotes: { id: string; requestId: string; title: string; totalWords: string; deadline: string | null }[];
  approvals: { id: string; summary: string }[];
  awaiting: { id: string; ref: string; title: string; status: string }[];
  deadlines: { id: string; title: string; dueOn: string; reminderDays: number[]; reminderOn?: string | null }[];
  documents: { id: string; title: string; expiresOn: string }[];
  waitingTasks: { id: string; title: string }[];
}

const levelFor = (days: number): AttentionLevel => (days <= 7 ? "urgent" : days <= 15 ? "soon" : "info");
const RANK: Record<AttentionLevel, number> = { urgent: 0, soon: 1, info: 2 };

/** Every line comes from the customer's own records, most urgent first. With nothing to say, it says nothing. */
export function buildAttention(i: AttentionInput): AttentionItem[] {
  const out: (AttentionItem & { order: number })[] = [];
  if (i.consentPending) out.push({ key: "consent", level: "urgent", order: -100, title: "Your consent is needed", detail: "We need this before we can read or keep your documents.", href: "", action: "Review" });
  for (const q of i.quotes) {
    const days = q.deadline ? daysBetween(i.today, q.deadline) : 7;
    out.push({ key: `quote-${q.id}`, level: levelFor(days), order: days, title: `Quotation waiting: ${q.title}`, detail: `${q.totalWords}${q.deadline ? `. Decide by ${q.deadline}.` : ". Nothing happens until you decide."}`, href: `/requests/${q.requestId}`, action: "Review" });
  }
  for (const a of i.approvals) out.push({ key: `approval-${a.id}`, level: "urgent", order: 0, title: "Waiting for your decision", detail: a.summary, href: "/approvals", action: "Review" });
  for (const r of i.awaiting) out.push({ key: `info-${r.id}`, level: "urgent", order: 1, title: r.status === "awaiting_information" ? `Your coordinator needs a detail on ${r.ref}` : `${r.ref} is waiting on you`, detail: r.title, href: `/requests/${r.id}`, action: "Reply" });
  for (const d of i.deadlines) {
    if (!reminderIsDue(d, i.today)) continue;
    const days = daysBetween(i.today, d.dueOn);
    out.push({ key: `deadline-${d.id}`, level: levelFor(days), order: days, title: d.title, detail: whenWords(days), href: "/bills", action: "View" });
  }
  for (const d of i.documents) {
    const days = daysBetween(i.today, d.expiresOn);
    if (days > 60) continue;
    out.push({ key: `doc-${d.id}`, level: levelFor(days), order: days, title: `${d.title} ${days < 0 ? "has expired" : "expires soon"}`, detail: days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`, href: "/documents", action: "View" });
  }
  for (const t of i.waitingTasks) out.push({ key: `task-${t.id}`, level: "soon", order: 8, title: "Waiting for your confirmation", detail: t.title, href: "/activity", action: "View" });
  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || a.order - b.order).map(({ order: _o, ...rest }) => rest).slice(0, 10);
}

// ---------- Family roles ----------
export const MEMBER_ROLES = {
  family_admin: { label: "Family administrator", help: "Can see and add everything. Only you can approve costs or delete data." },
  member: { label: "Family member", help: "Can follow and start requests, and add documents." },
  viewer: { label: "Read-only viewer", help: "Can see requests and updates. Cannot change anything." },
  temporary: { label: "Temporary authorised contact", help: "Can see requests until the date you set." },
} as const;
export type MemberRole = keyof typeof MEMBER_ROLES;
export const ROLE_PERMISSIONS: Record<MemberRole, string[]> = {
  family_admin: ["view_requests", "create_requests", "view_documents", "upload_documents", "view_activity", "view_bills", "manage_bills"],
  member: ["view_requests", "create_requests", "upload_documents", "view_activity"],
  viewer: ["view_requests", "view_activity"],
  temporary: ["view_requests"],
};

// ---------- Service partners ----------
export const PARTNER_STATUSES = {
  not_reviewed: { label: "Not reviewed", tone: undefined },
  identity_checked: { label: "Identity checked", tone: "accent" },
  references_checked: { label: "References checked", tone: "accent" },
  approved: { label: "Approved for use", tone: "ok" },
  suspended: { label: "Suspended", tone: "danger" },
} as const;
export type PartnerStatus = keyof typeof PARTNER_STATUSES;

/** A label is only earned by the check before it. Suspending is always allowed. */
export function partnerMoveProblem(p: { identityChecked: boolean; referencesChecked: boolean }, to: PartnerStatus): string | null {
  if (to === "references_checked" && !p.identityChecked) return "Check their identity first.";
  if (to === "approved" && !(p.identityChecked && p.referencesChecked)) return "Check their identity and references before approving.";
  return null;
}

// ---------- Monthly report ----------
export const monthKey = (iso: string) => istDate(new Date(iso)).slice(0, 7);
export const isMonthKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface ReportInput {
  month: string;
  today: string;
  requests: { title: string; ref: string; status: string; category: string; propertyId: string | null; createdAt: string; completedAt: string | null }[];
  visits: { purpose: string; status: string; propertyId: string | null; scheduledAt: string; completedAt: string | null }[];
  documents: { title: string; uploadedAt: string; propertyId: string | null }[];
  deadlines: { title: string; dueOn: string; status: string; handledAt: string | null; propertyId: string | null }[];
  quotes: { title: string; status: string; totalInr: number; createdAt: string }[];
  updates: { text: string; at: string }[];
  category?: string;
  propertyId?: string;
}

export interface MonthlyReport {
  month: string; label: string;
  completed: { title: string; ref: string }[];
  inProgress: { title: string; ref: string; status: string }[];
  visits: { purpose: string; status: string; at: string }[];
  documents: string[];
  handledDeadlines: string[];
  approved: { title: string; totalInr: number }[];
  upcoming: { title: string; dueOn: string }[];
  updates: { text: string; at: string }[];
  pending: string[];
}

export function buildMonthlyReport(i: ReportInput): MonthlyReport {
  const inMonth = (iso: string | null) => !!iso && monthKey(iso) === i.month;
  const prop = <T extends { propertyId: string | null }>(x: T) => !i.propertyId || x.propertyId === i.propertyId;
  const reqs = i.requests.filter((r) => prop(r) && (!i.category || r.category === i.category));
  const open = reqs.filter((r) => !["completed", "cancelled"].includes(r.status) && monthKey(r.createdAt) <= i.month);
  return {
    month: i.month,
    label: monthLabel(i.month),
    completed: reqs.filter((r) => r.status === "completed" && inMonth(r.completedAt)).map((r) => ({ title: r.title, ref: r.ref })),
    inProgress: open.map((r) => ({ title: r.title, ref: r.ref, status: r.status })),
    visits: i.visits.filter((v) => prop(v) && v.status !== "cancelled" && inMonth(v.scheduledAt)).map((v) => ({ purpose: v.purpose, status: v.status, at: v.scheduledAt })),
    documents: i.documents.filter((d) => prop(d) && inMonth(d.uploadedAt)).map((d) => d.title),
    handledDeadlines: i.deadlines.filter((d) => prop(d) && d.status === "handled" && inMonth(d.handledAt)).map((d) => d.title),
    approved: i.quotes.filter((q) => q.status === "approved" && inMonth(q.createdAt)).map((q) => ({ title: q.title, totalInr: q.totalInr })),
    upcoming: i.deadlines.filter((d) => prop(d) && d.status === "upcoming" && d.dueOn >= i.today).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 8).map((d) => ({ title: d.title, dueOn: d.dueOn })),
    updates: i.updates.filter((u) => inMonth(u.at)).slice(0, 12),
    pending: open.filter((r) => ["awaiting_information", "awaiting_approval", "awaiting_customer"].includes(r.status)).map((r) => `${r.ref}: ${r.title}`),
  };
}
