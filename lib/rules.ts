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
  /\byou (need to|must|have to) (take|stop) .*(medicine|medication|tablet|dose|injection)/i,
  /\b(increase|reduce|skip|double) (the|your) (dose|medicine|medication|tablets?)\b/i,
  /\b(you can|you may|you should) (safely )?(ignore|skip) (the|this|your) (tax|notice|summons|symptom)/i,
  /\byou (will|would) (win|lose) (the|this|your) case\b/i,
  /\b(no|not) (need to|required to) (pay|file) (any )?tax\b/i,
  /\byou should\b.*\b(sue|surgery|operation|treatment|medicine|tax return|court|lawyer's|deduct)/i,
  // Hindi and Hinglish
  /दवा (ले|लेनी|बंद|मत)|इलाज (करवा|कराना)|केस (जीत|हार)|टैक्स (नहीं|मत) (देना|भरना)/,
  /\b(dawa|dawai|goli) (le lo|lena|band|mat)\b/i,
  // Gujarati
  /દવા (લો|લેવી|બંધ|ન લેશો)|સારવાર કરાવો|ટેક્સ (ન|નહીં) ભરવો/,
  // Marathi
  /औषध (घ्या|घ्यावे|बंद)|उपचार (करा|घ्या)|कर (भरू नका|भरायचा नाही)/,
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
  /\b(admitted|rushed|taken) (to|in)( the)? hospital\b/i,
  /\bunconscious\b|\bheart attack\b|\bstroke\b/i,
  /\bhospital (le ja|jana pad)|\bgir (gaye|gayi|gai)\b|\bchhati me dard\b/i,
  /अस्पताल ले|बेहोश|દવાખાને લઈ|હોસ્પિટલ લઈ|બેભાન|रुग्णालयात ने|बेशुद्ध/,
  /इमरजेंसी|एम्बुलेंस|छाती में दर्द|गिर गए|गिर गई/,
  /ઇમરજન્સી|એમ્બ્યુલન્સ|છાતીમાં દુખાવો|પડી ગયા|પડી ગઈ/,
  /आणीबाणी|रुग्णवाहिका|छातीत दुखत|पडले|पडल्या/,
];

export function isEmergency(text: string): boolean {
  return EMERGENCY.some((p) => p.test(text));
}

/** A parent ends consent with one message. Deliberately narrow, so a stray "stop" in a sentence does not. */
const WITHDRAW = [
  /^\s*stop\s*[.!]?\s*$/i,
  /\b(withdraw|cancel|take back) (my )?consent\b/i,
  /\bdelete my data\b/i,
  /सहमति (वापस|रद्द)/,
  /સંમતિ (પાછી|રદ)/,
  /संमती (मागे|रद्द)/,
];

export function isConsentWithdrawal(text: string): boolean {
  return WITHDRAW.some((p) => p.test(text));
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

const IST_OFFSET_MS = 5.5 * 3600_000;

/** First instant of the current calendar month in India, as a UTC date. Hours are counted per India month. */
export function monthStartIst(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

export function entriesThisMonth<T extends Pick<TimeEntry, "at">>(entries: T[], now: Date): T[] {
  const start = monthStartIst(now).getTime();
  return entries.filter((e) => new Date(e.at).getTime() >= start);
}

/** Monday 00:00 India time of the week containing d, as a UTC date. */
export function weekStartIst(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const day = (ist.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day) - IST_OFFSET_MS);
}

/** Hours per week, oldest first, ending with the week containing now. */
export function weeklyHours(entries: Pick<TimeEntry, "at" | "minutes">[], weeks: number, now: Date): { weekStart: string; hours: number }[] {
  const current = weekStartIst(now).getTime();
  const WEEK = 7 * 24 * 3600_000;
  return Array.from({ length: weeks }, (_, i) => {
    const start = current - (weeks - 1 - i) * WEEK;
    const minutes = entries.filter((e) => {
      const t = new Date(e.at).getTime();
      return t >= start && t < start + WEEK;
    });
    return { weekStart: new Date(start).toISOString(), hours: hoursFor(minutes) };
  });
}

export type SlaState = "past" | "soon" | "ok";

/** "soon" means the SLA lands within 24 hours. */
export function slaState(task: Pick<Task, "slaAt" | "status">, now: Date): SlaState {
  if (isPastSla(task, now)) return "past";
  return new Date(task.slaAt).getTime() - now.getTime() < 24 * 3600_000 ? "soon" : "ok";
}

/** Whole minutes for a stopped timer. At least 1, capped at the 600 minute limit on a single entry. */
export function timerMinutes(startedAt: Date, stoppedAt: Date): number {
  const m = Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60000);
  return Math.min(600, Math.max(1, m));
}

export function isPastSla(task: Pick<Task, "slaAt" | "status">, now: Date): boolean {
  return task.status !== "done" && new Date(task.slaAt).getTime() < now.getTime();
}
