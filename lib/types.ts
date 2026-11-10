import type { DocumentCategory } from "./request-engine";

export type Language = "Hindi" | "Gujarati" | "Marathi" | "English";
export type Actor = "ai" | "human" | "system";
export type TaskStatus = "todo" | "doing" | "waiting_parent" | "waiting_owner" | "done";
export type ApprovalStatus = "pending" | "approved" | "declined";

export interface Person {
  id: string;
  name: string;
  city: string;
  country?: string;
  photo?: string;
}

export interface Parent extends Person {
  phone: string;
  language: Language;
  consentStatus: "granted" | "pending" | "withdrawn";
  /** True when the customer is the contact, with no parent or relative involved. */
  isSelf: boolean;
}

export interface Family {
  id: string;
  name: string;
  owner: Person;
  parent: Parent;
  coordinatorId: string | null;
  status?: string;
  planUsd: number;
  startedAt: string;
}

export interface Coordinator extends Person {
  role: "coordinator" | "admin";
  phone?: string;
  workingHours?: string;
}

export interface Policy {
  id: string;
  familyId: string;
  insurer: string;
  policyNoEnc: string; // AES-256-GCM, see lib/crypto.ts
  sumInsuredInr: number;
  renewalDate: string;
}

export interface Claim {
  id: string;
  familyId: string;
  kind: "cashless" | "reimbursement";
  status: "preparing" | "submitted" | "query" | "approved" | "settled";
  hospital: string;
  amountClaimedInr: number;
  amountSettledInr?: number;
  openedAt: string;
  slaDueAt: string;
  missing: string[];
  requirements?: { id: string; label: string; receivedAt?: string; documentId?: string }[];
}

export interface DocumentRecord {
  id: string;
  familyId: string;
  kind: "policy" | "discharge_summary" | "bill" | "id" | "report";
  category: DocumentCategory;
  title: string;
  uploadedAt: string;
  confidence: number;
  extracted: Record<string, string>;
  preparedBy: "ai";
  checkedBy?: string;
  consentPurposes: string[];
  fieldConfidence?: Record<string, number>;
  scanStatus?: string;
  extractionStatus?: string;
  tags: string[];
  mime?: string;
  expiresOn?: string;
  issuedOn?: string;
  expiryConfirmed?: boolean;
  propertyId?: string;
  version: number;
  supersedes?: string;
}

export interface Task {
  id: string;
  familyId: string;
  title: string;
  kind: "claim" | "bill" | "records" | "errand" | "checkin" | "renewal";
  status: TaskStatus;
  ownerId: string;
  dueAt: string;
  slaAt: string;
  hourBudget: number;
  needsApproval: boolean;
  checklist?: string[];
  documentId?: string;
  /** "whatsapp" when the task came from a WhatsApp message. */
  source?: string;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  familyId: string;
  userId: string;
  minutes: number;
  note: string;
  at: string;
}

export interface Approval {
  id: string;
  familyId: string;
  taskId: string;
  summary: string;
  amountInr: number;
  payee: string;
  feesInr: number;
  when: string;
  evidenceIds: string[];
  status: ApprovalStatus;
  decidedAt?: string;
  undoUntil?: string;
}

export interface TimelineEvent {
  id: string;
  familyId: string;
  at: string;
  actor: Actor;
  actorName: string;
  text: string;
  kind: "message" | "document" | "claim" | "bill" | "visit" | "approval" | "system";
}

export interface WhatsAppMessage {
  id: string;
  familyId: string;
  direction: "in" | "out";
  body: string;
  at: string;
  language: Language;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
}

export interface WaitlistEntry {
  id: string;
  at: string;
  email: string;
  country: string;
  note: string;
}
