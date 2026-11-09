import type { Approval, TimeEntry, Task } from "./types";

/** Actions the system can take, used by the approval policy table in specs/PRD.md section 8. */
export type ActionKind =
  | "read_document"
  | "extract_fields"
  | "draft_message"
  | "send_template_reminder"
  | "draft_claim_form"
  | "submit_claim"
  | "pay_bill"
  | "share_document_external"
  | "advice";

export interface ApprovalPolicy {
  aiAlone: boolean;
  coordinator: boolean;
  owner: boolean;
  licensedPro: boolean;
}

export const POLICY: Record<ActionKind, ApprovalPolicy> = {
  read_document: { aiAlone: true, coordinator: false, owner: false, licensedPro: false },
  extract_fields: { aiAlone: true, coordinator: false, owner: false, licensedPro: false },
  draft_message: { aiAlone: false, coordinator: true, owner: false, licensedPro: false },
  send_template_reminder: { aiAlone: true, coordinator: false, owner: false, licensedPro: false },
  draft_claim_form: { aiAlone: false, coordinator: true, owner: true, licensedPro: false },
  submit_claim: { aiAlone: false, coordinator: true, owner: true, licensedPro: false },
  pay_bill: { aiAlone: false, coordinator: true, owner: true, licensedPro: false },
  share_document_external: { aiAlone: false, coordinator: true, owner: false, licensedPro: false },
  advice: { aiAlone: false, coordinator: false, owner: false, licensedPro: true },
};

/** Money out or filing something always needs the owner. Advice never leaves a licensed professional. */
export function requiresOwnerApproval(action: ActionKind): boolean {
  return POLICY[action].owner;
}

export function canAiActAlone(action: ActionKind, extractionConfidence = 1): boolean {
  if (!POLICY[action].aiAlone) return false;
  if (action === "extract_fields" && extractionConfidence < 0.9) return false;
  return true;
}

/** Phrases that read as medical, legal or tax advice. Matching drafts are blocked and sent to a human. */
const ADVICE_PATTERNS: RegExp[] = [
  /\byou should (take|stop|start|not take|file|claim|sue|pay)\b/i,
  /\b(this|that) is (legal|illegal|safe to take|not taxable|taxable)\b/i,
  /\byou (owe|do not owe|don't owe)\b/i,
  /\b(diagnos(is|ed)|prescri(be|ption)|dosage|dose of)\b/i,
  /\b(i|we) (recommend|advise) (you )?(to )?(take|stop|sue|file|sell|buy)\b/i,
  /\bstop (taking|your) (medicine|medication|tablets)\b/i,
];

export function looksLikeAdvice(text: string): boolean {
  return ADVICE_PATTERNS.some((p) => p.test(text));
}

const EMERGENCY = [
  /\bemergency\b/i,
  /\bambulance\b/i,
  /\bchest pain\b/i,
  /\bfell down\b|\bfall\b|\bfallen\b/i,
  /\bcan'?t breathe\b/i,
  /इमरजेंसी|एम्बुलेंस|छाती में दर्द|गिर गए|गिर गई/,
  /ઇમરજન્સી|એમ્બ્યુલન્સ|છાતીમાં દુખાવો|પડી ગયા|પડી ગઈ/,
  /आणीबाणी|रुग्णवाहिका|छातीत दुखत|पडले|पडल्या/,
];

export function isEmergency(text: string): boolean {
  return EMERGENCY.some((p) => p.test(text));
}

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export function undoUntil(now: Date): string {
  return new Date(now.getTime() + UNDO_WINDOW_MS).toISOString();
}

export function canUndo(approval: Pick<Approval, "status" | "undoUntil">, now: Date): boolean {
  if (approval.status === "pending") return false;
  if (!approval.undoUntil) return false;
  return now.getTime() <= new Date(approval.undoUntil).getTime();
}

/**
 * Cost model copied from research_notes/India desk NRI research/unit_economics_model.xlsx
 * (Family_Cost and Margin sheets). Every input there is marked sourced or assumed.
 */
export const LABOUR_USD_PER_HOUR = 2.917; // blended loaded labour, launch city mix
export const OVERHEAD_PCT = 0.15; // management and QA on top of direct labour
export const FIXED_COST_PER_FAMILY_USD = 6.742; // software and telephony 2.50 + out-of-pocket ops 4.242
export const PRICE_LINKED_PCT = 0.045; // payment processing 3.5% + refunds and bad debt 1%

export function hoursFor(entries: Pick<TimeEntry, "minutes">[]): number {
  return Math.round((entries.reduce((s, e) => s + e.minutes, 0) / 60) * 100) / 100;
}

function costToServe(planUsd: number, hours: number): number {
  return hours * LABOUR_USD_PER_HOUR * (1 + OVERHEAD_PCT) + FIXED_COST_PER_FAMILY_USD + planUsd * PRICE_LINKED_PCT;
}

export function marginPct(planUsd: number, hours: number): number {
  return Math.round(((planUsd - costToServe(planUsd, hours)) / planUsd) * 100);
}

/** Hours at which gross margin hits zero. */
export function breakEvenHours(planUsd: number): number {
  const room = planUsd * (1 - PRICE_LINKED_PCT) - FIXED_COST_PER_FAMILY_USD;
  return Math.round((room / (LABOUR_USD_PER_HOUR * (1 + OVERHEAD_PCT))) * 10) / 10;
}

/** Hours budget per month by plan price. $79 is 6 hours (kill line from the research); $49 is 3.4. */
export function hourBudget(planUsd: number): number {
  if (planUsd >= 79) return 6;
  return 3.4;
}

export function overHourBudget(planUsd: number, hours: number): boolean {
  return hours > hourBudget(planUsd);
}

export function isPastSla(task: Pick<Task, "slaAt" | "status">, now: Date): boolean {
  return task.status !== "done" && new Date(task.slaAt).getTime() < now.getTime();
}
