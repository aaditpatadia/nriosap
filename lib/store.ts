import { decryptField, encryptField, maskTail } from "./crypto";
import { hoursFor, isEmergency, looksLikeAdvice, undoUntil } from "./rules";
import type {
  Approval,
  AuditEntry,
  Claim,
  Coordinator,
  DocumentRecord,
  Family,
  Policy,
  Task,
  TaskStatus,
  TimeEntry,
  TimelineEvent,
  WaitlistEntry,
  WhatsAppMessage,
} from "./types";

/**
 * DEMO STORE. In-memory, seeded with three fictional families. Resets on server restart.
 * The Postgres schema with row level security is in supabase/migrations/001_init.sql;
 * swap this module for a Supabase-backed one with the same exports.
 */
interface DB {
  families: Family[];
  coordinators: Coordinator[];
  policies: Policy[];
  claims: Claim[];
  documents: DocumentRecord[];
  tasks: Task[];
  time: TimeEntry[];
  approvals: Approval[];
  events: TimelineEvent[];
  messages: WhatsAppMessage[];
  audit: AuditEntry[];
  waitlist: WaitlistEntry[];
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function seed(): DB {
  const coordinators: Coordinator[] = [
    { id: "c1", name: "Meera Joshi", city: "Rajkot", role: "coordinator" },
    { id: "c2", name: "Rohan Desai", city: "Pune", role: "coordinator" },
    { id: "c3", name: "Kavita Rao", city: "Mumbai", role: "coordinator" },
    { id: "admin", name: "Aadit", city: "Mumbai", role: "admin" },
  ];

  const families: Family[] = [
    {
      id: "shah",
      name: "Shah family",
      owner: { id: "u-priya", name: "Priya Shah", city: "Toronto", country: "Canada" },
      parent: {
        id: "p-kusum",
        name: "Kusum Shah",
        city: "Rajkot",
        phone: "+919800000001",
        language: "Gujarati",
        consentStatus: "granted",
      },
      coordinatorId: "c1",
      planUsd: 79,
      startedAt: iso(-40 * DAY),
    },
    {
      id: "kulkarni",
      name: "Kulkarni family",
      owner: { id: "u-mihir", name: "Mihir Kulkarni", city: "London", country: "United Kingdom" },
      parent: {
        id: "p-sulabha",
        name: "Sulabha Kulkarni",
        city: "Pune",
        phone: "+919800000002",
        language: "Marathi",
        consentStatus: "granted",
      },
      coordinatorId: "c2",
      planUsd: 79,
      startedAt: iso(-25 * DAY),
    },
    {
      id: "mehta",
      name: "Mehta family",
      owner: { id: "u-neha", name: "Neha Mehta", city: "Singapore", country: "Singapore" },
      parent: {
        id: "p-harish",
        name: "Harish Mehta",
        city: "Mumbai",
        phone: "+919800000003",
        language: "Hindi",
        consentStatus: "granted",
      },
      coordinatorId: "c3",
      planUsd: 40,
      startedAt: iso(-12 * DAY),
    },
  ];

  const policies: Policy[] = [
    {
      id: "pol-shah",
      familyId: "shah",
      insurer: "Demo Insurer A",
      policyNoEnc: encryptField("shah", "DIA-2291-77410"),
      sumInsuredInr: 500000,
      renewalDate: iso(38 * DAY),
    },
    {
      id: "pol-kul",
      familyId: "kulkarni",
      insurer: "Demo Insurer B",
      policyNoEnc: encryptField("kulkarni", "DIB-8821-00314"),
      sumInsuredInr: 1000000,
      renewalDate: iso(120 * DAY),
    },
    {
      id: "pol-meh",
      familyId: "mehta",
      insurer: "Demo Insurer A",
      policyNoEnc: encryptField("mehta", "DIA-5531-90022"),
      sumInsuredInr: 300000,
      renewalDate: iso(9 * DAY),
    },
  ];

  const claims: Claim[] = [
    {
      id: "clm-shah-1",
      familyId: "shah",
      kind: "cashless",
      status: "query",
      hospital: "Demo City Hospital, Rajkot",
      amountClaimedInr: 86000,
      openedAt: iso(-6 * DAY),
      slaDueAt: iso(1 * DAY),
      missing: ["Signed discharge summary", "Itemised final bill"],
    },
    {
      id: "clm-kul-1",
      familyId: "kulkarni",
      kind: "reimbursement",
      status: "settled",
      hospital: "Demo Care Clinic, Pune",
      amountClaimedInr: 24500,
      amountSettledInr: 22800,
      openedAt: iso(-33 * DAY),
      slaDueAt: iso(-3 * DAY),
      missing: [],
    },
    {
      id: "clm-meh-1",
      familyId: "mehta",
      kind: "reimbursement",
      status: "preparing",
      hospital: "Demo Heart Centre, Mumbai",
      amountClaimedInr: 41200,
      openedAt: iso(-3 * DAY),
      slaDueAt: iso(4 * DAY),
      missing: ["Cancelled cheque", "Doctor's prescription copy"],
    },
  ];

  const documents: DocumentRecord[] = [
    {
      id: "doc-1",
      familyId: "shah",
      kind: "policy",
      title: "Health policy schedule.pdf",
      uploadedAt: iso(-39 * DAY),
      confidence: 0.94,
      extracted: { Insurer: "Demo Insurer A", "Sum insured": "Rs 5,00,000", Renewal: "14 Dec 2026" },
      preparedBy: "ai",
      checkedBy: "Meera Joshi",
      consentPurposes: ["read records", "store"],
    },
    {
      id: "doc-2",
      familyId: "shah",
      kind: "discharge_summary",
      title: "Discharge summary (unsigned).jpg",
      uploadedAt: iso(-5 * DAY),
      confidence: 0.82,
      extracted: { Hospital: "Demo City Hospital", Admitted: "28 Oct", Discharged: "2 Nov" },
      preparedBy: "ai",
      consentPurposes: ["read records", "store", "share with insurer for claim"],
    },
    {
      id: "doc-3",
      familyId: "shah",
      kind: "bill",
      title: "Electricity bill November.pdf",
      uploadedAt: iso(-2 * DAY),
      confidence: 0.91,
      extracted: { Payee: "Demo Power Co", Amount: "Rs 4,200", Due: "15 Nov" },
      preparedBy: "ai",
      checkedBy: "Meera Joshi",
      consentPurposes: ["read records", "store"],
    },
    {
      id: "doc-4",
      familyId: "kulkarni",
      kind: "policy",
      title: "Policy copy.pdf",
      uploadedAt: iso(-24 * DAY),
      confidence: 0.95,
      extracted: { Insurer: "Demo Insurer B", "Sum insured": "Rs 10,00,000" },
      preparedBy: "ai",
      checkedBy: "Rohan Desai",
      consentPurposes: ["read records", "store"],
    },
    {
      id: "doc-5",
      familyId: "mehta",
      kind: "report",
      title: "Cardiology report.jpg",
      uploadedAt: iso(-3 * DAY),
      confidence: 0.6,
      extracted: {},
      preparedBy: "ai",
      consentPurposes: ["read records", "store"],
    },
  ];

  const tasks: Task[] = [
    { id: "t1", familyId: "shah", title: "Chase signed discharge summary for claim", kind: "claim", status: "doing", ownerId: "c1", dueAt: iso(1 * DAY), slaAt: iso(1 * DAY), hourBudget: 2, needsApproval: false },
    { id: "t2", familyId: "shah", title: "Pay November electricity bill", kind: "bill", status: "waiting_owner", ownerId: "c1", dueAt: iso(6 * DAY), slaAt: iso(5 * DAY), hourBudget: 0.5, needsApproval: true },
    { id: "t3", familyId: "shah", title: "Renewal quotes for health policy", kind: "renewal", status: "todo", ownerId: "c1", dueAt: iso(30 * DAY), slaAt: iso(30 * DAY), hourBudget: 1, needsApproval: false },
    { id: "t4", familyId: "kulkarni", title: "Weekly check-in call (Marathi)", kind: "checkin", status: "todo", ownerId: "c2", dueAt: iso(2 * DAY), slaAt: iso(2 * DAY), hourBudget: 0.5, needsApproval: false },
    { id: "t5", familyId: "kulkarni", title: "Collect lab reports from clinic", kind: "errand", status: "done", ownerId: "c2", dueAt: iso(-8 * DAY), slaAt: iso(-8 * DAY), hourBudget: 1.5, needsApproval: false },
    { id: "t6", familyId: "mehta", title: "Assemble reimbursement claim documents", kind: "claim", status: "waiting_parent", ownerId: "c3", dueAt: iso(-1 * DAY), slaAt: iso(-1 * DAY), hourBudget: 2, needsApproval: true },
    { id: "t7", familyId: "mehta", title: "Renew health policy before expiry", kind: "renewal", status: "doing", ownerId: "c3", dueAt: iso(9 * DAY), slaAt: iso(7 * DAY), hourBudget: 1, needsApproval: true },
  ];

  const t = (id: string, taskId: string, familyId: string, userId: string, minutes: number, note: string, daysAgo: number): TimeEntry => ({
    id,
    taskId,
    familyId,
    userId,
    minutes,
    note,
    at: iso(-daysAgo * DAY),
  });
  const time: TimeEntry[] = [
    t("te1", "t1", "shah", "c1", 75, "Called hospital desk, requested signed summary", 3),
    t("te2", "t1", "shah", "c1", 40, "Checked insurer query email", 1),
    t("te3", "t2", "shah", "c1", 20, "Prepared bill payment request", 1),
    t("te4", "t5", "kulkarni", "c2", 95, "Visited clinic, collected reports", 9),
    t("te5", "t4", "kulkarni", "c2", 25, "Check-in call", 4),
    t("te6", "t6", "mehta", "c3", 150, "Gathered documents from parent over two visits", 2),
    t("te7", "t6", "mehta", "c3", 90, "Followed up on cancelled cheque", 1),
    t("te8", "t7", "mehta", "c3", 120, "Compared renewal options, called insurer", 1),
  ];

  const approvals: Approval[] = [
    {
      id: "ap1",
      familyId: "shah",
      taskId: "t2",
      summary: "Pay November electricity bill",
      amountInr: 4200,
      payee: "Demo Power Co",
      feesInr: 0,
      when: "By 15 Nov",
      evidenceIds: ["doc-3"],
      status: "pending",
    },
    {
      id: "ap2",
      familyId: "shah",
      taskId: "t1",
      summary: "Send claim documents to Demo Insurer A once the signed summary arrives",
      amountInr: 0,
      payee: "Demo Insurer A",
      feesInr: 0,
      when: "After summary is received",
      evidenceIds: ["doc-1", "doc-2"],
      status: "pending",
    },
  ];

  const events: TimelineEvent[] = [
    { id: "e1", familyId: "shah", at: iso(-6 * DAY), actor: "system", actorName: "Desk", kind: "claim", text: "Claim opened for the Rajkot hospital stay. We asked the hospital desk for the final bill." },
    { id: "e2", familyId: "shah", at: iso(-5 * DAY), actor: "ai", actorName: "Prepared by AI, checked by Meera", kind: "document", text: "Discharge summary read. Two fields need a human check: doctor signature and stamp." },
    { id: "e3", familyId: "shah", at: iso(-3 * DAY), actor: "human", actorName: "Meera Joshi", kind: "visit", text: "Phoned the hospital desk. They will send the signed summary within two days." },
    { id: "e4", familyId: "shah", at: iso(-2 * DAY), actor: "ai", actorName: "Prepared by AI, checked by Meera", kind: "bill", text: "November electricity bill (Rs 4,200) found. Payment is waiting for your approval." },
    { id: "e5", familyId: "shah", at: iso(-1 * DAY), actor: "system", actorName: "Desk", kind: "claim", text: "Insurer asked for two things: signed discharge summary and itemised final bill." },
    { id: "e6", familyId: "kulkarni", at: iso(-9 * DAY), actor: "human", actorName: "Rohan Desai", kind: "visit", text: "Collected lab reports from the clinic and added them to the vault." },
    { id: "e7", familyId: "kulkarni", at: iso(-4 * DAY), actor: "human", actorName: "Rohan Desai", kind: "message", text: "Weekly check-in done in Marathi. Sulabha-tai is well; knee pain is better." },
    { id: "e8", familyId: "mehta", at: iso(-3 * DAY), actor: "ai", actorName: "Prepared by AI, needs a check", kind: "document", text: "Cardiology report read with low confidence (0.60). Meera will check it by hand." },
    { id: "e9", familyId: "mehta", at: iso(-1 * DAY), actor: "human", actorName: "Kavita Rao", kind: "claim", text: "Reimbursement claim is waiting on a cancelled cheque and a prescription copy from Harish-ji." },
  ];

  const messages: WhatsAppMessage[] = [
    { id: "m1", familyId: "shah", direction: "out", at: iso(-3 * DAY), language: "Gujarati", body: "નમસ્તે કુસુમબેન, હું મીરા. હોસ્પિટલમાંથી સહી કરેલું ડિસ્ચાર્જ સમરી મળી જાય એટલે હું તમને જણાવીશ." },
    { id: "m2", familyId: "shah", direction: "in", at: iso(-3 * DAY + HOUR), language: "Gujarati", body: "સારું બેટા, આભાર." },
  ];

  return {
    families,
    coordinators,
    policies,
    claims,
    documents,
    tasks,
    time,
    approvals,
    events,
    messages,
    audit: [],
    waitlist: [],
  };
}

const g = globalThis as unknown as { __gharsaathDb?: DB };
function db(): DB {
  if (!g.__gharsaathDb) g.__gharsaathDb = seed();
  return g.__gharsaathDb;
}

let counter = 1000;
const nid = (p: string) => `${p}${++counter}`;

export function logAudit(actorId: string, action: string, entity: string, entityId: string) {
  db().audit.unshift({ id: nid("a"), at: new Date().toISOString(), actorId, action, entity, entityId });
}

export const listFamilies = () => db().families;
export const getFamily = (id: string) => db().families.find((f) => f.id === id);
export const getCoordinator = (id: string) => db().coordinators.find((c) => c.id === id);
export const listCoordinators = () => db().coordinators.filter((c) => c.role === "coordinator");

export function timeline(familyId: string) {
  return db()
    .events.filter((e) => e.familyId === familyId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const claimsFor = (familyId: string) => db().claims.filter((c) => c.familyId === familyId);

export function documentsFor(familyId: string, viewerId: string) {
  logAudit(viewerId, "view_document_list", "family", familyId);
  return db().documents.filter((d) => d.familyId === familyId);
}

export function policyFor(familyId: string, viewerId: string) {
  const p = db().policies.find((x) => x.familyId === familyId);
  if (!p) return undefined;
  logAudit(viewerId, "view_policy", "policy", p.id);
  return {
    id: p.id,
    insurer: p.insurer,
    sumInsuredInr: p.sumInsuredInr,
    renewalDate: p.renewalDate,
    policyNoMasked: maskTail(decryptField(familyId, p.policyNoEnc)),
  };
}

export const tasksFor = (familyId?: string) =>
  db().tasks.filter((t) => !familyId || t.familyId === familyId);

export const allTasks = () => db().tasks;
export const getTask = (id: string) => db().tasks.find((t) => t.id === id);
export const timeFor = (familyId?: string) =>
  db().time.filter((t) => !familyId || t.familyId === familyId);
export const timeForTask = (taskId: string) => db().time.filter((t) => t.taskId === taskId);

export function familyHours(familyId: string) {
  return hoursFor(timeFor(familyId));
}

export const approvalsFor = (familyId: string) =>
  db().approvals.filter((a) => a.familyId === familyId);

export function decideApproval(id: string, status: "approved" | "declined", actorId: string) {
  const a = db().approvals.find((x) => x.id === id);
  if (!a || a.status !== "pending") return undefined;
  a.status = status;
  a.decidedAt = new Date().toISOString();
  a.undoUntil = undoUntil(new Date());
  logAudit(actorId, `approval_${status}`, "approval", id);
  db().events.unshift({
    id: nid("e"),
    familyId: a.familyId,
    at: a.decidedAt,
    actor: "human",
    actorName: getFamily(a.familyId)?.owner.name ?? "Owner",
    kind: "approval",
    text: `${status === "approved" ? "Approved" : "Declined"}: ${a.summary}`,
  });
  return a;
}

export function undoApproval(id: string, actorId: string) {
  const a = db().approvals.find((x) => x.id === id);
  if (!a || a.status === "pending" || !a.undoUntil) return undefined;
  if (Date.now() > new Date(a.undoUntil).getTime()) return undefined;
  a.status = "pending";
  a.decidedAt = undefined;
  a.undoUntil = undefined;
  logAudit(actorId, "approval_undone", "approval", id);
  db().events.unshift({
    id: nid("e"),
    familyId: a.familyId,
    at: new Date().toISOString(),
    actor: "system",
    actorName: "Desk",
    kind: "approval",
    text: `Undone: ${a.summary}`,
  });
  return a;
}

export function addTime(taskId: string, minutes: number, note: string, userId: string) {
  const task = getTask(taskId);
  if (!task || minutes <= 0 || minutes > 600) return undefined;
  const entry: TimeEntry = {
    id: nid("te"),
    taskId,
    familyId: task.familyId,
    userId,
    minutes: Math.round(minutes),
    note: note.slice(0, 280),
    at: new Date().toISOString(),
  };
  db().time.push(entry);
  logAudit(userId, "log_time", "task", taskId);
  return entry;
}

export function setTaskStatus(taskId: string, status: TaskStatus, userId: string) {
  const task = getTask(taskId);
  if (!task) return undefined;
  task.status = status;
  logAudit(userId, `task_${status}`, "task", taskId);
  return task;
}

/** Handles an inbound parent message: logs it, flags emergencies, never auto-replies with advice. */
export function receiveParentMessage(phone: string, text: string) {
  const fam = db().families.find((f) => f.parent.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
  if (!fam) return { matched: false as const };
  const at = new Date().toISOString();
  db().messages.push({ id: nid("m"), familyId: fam.id, direction: "in", body: text.slice(0, 2000), at, language: fam.parent.language });
  const emergency = isEmergency(text);
  db().events.unshift({
    id: nid("e"),
    familyId: fam.id,
    at,
    actor: "human",
    actorName: fam.parent.name,
    kind: "message",
    text: emergency ? `Message from ${fam.parent.name} looks like an emergency. Coordinator alerted.` : `Message from ${fam.parent.name} received.`,
  });
  if (emergency) {
    db().tasks.unshift({
      id: nid("t"),
      familyId: fam.id,
      title: "EMERGENCY: call the parent now",
      kind: "errand",
      status: "todo",
      ownerId: fam.coordinatorId,
      dueAt: at,
      slaAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      hourBudget: 1,
      needsApproval: false,
    });
  }
  return { matched: true as const, familyId: fam.id, emergency };
}

/** Coordinator drafts go through the advice filter before they can be sent. */
export function sendCoordinatorMessage(familyId: string, body: string, userId: string) {
  const fam = getFamily(familyId);
  if (!fam) return { ok: false as const, reason: "Family not found" };
  if (looksLikeAdvice(body)) {
    logAudit(userId, "message_blocked_advice", "family", familyId);
    return { ok: false as const, reason: "This reads like medical, legal or tax advice. Route it to a licensed professional." };
  }
  const at = new Date().toISOString();
  db().messages.push({ id: nid("m"), familyId, direction: "out", body: body.slice(0, 2000), at, language: fam.parent.language });
  logAudit(userId, "message_sent", "family", familyId);
  return { ok: true as const };
}

export const messagesFor = (familyId: string) =>
  db().messages.filter((m) => m.familyId === familyId).sort((a, b) => a.at.localeCompare(b.at));

export function addWaitlist(entry: Omit<WaitlistEntry, "id" | "at">) {
  db().waitlist.push({ id: nid("w"), at: new Date().toISOString(), ...entry });
}

export const waitlistCount = () => db().waitlist.length;
export const auditLog = () => db().audit.slice(0, 50);
