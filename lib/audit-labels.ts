import { STATUS_META, type RequestStatus } from "./request-engine";

/** Plain words for what the log records, and which group each belongs to, so a person can scan it. */
export type AuditGroup = "documents" | "requests" | "account" | "desk";

const KNOWN: Record<string, { label: string; group: AuditGroup }> = {
  view_family: { label: "Opened the family page", group: "account" },
  view_document_list: { label: "Opened the document list", group: "documents" },
  view_document: { label: "Opened a document", group: "documents" },
  view_document_fields: { label: "Checked the details in a document", group: "documents" },
  view_policy: { label: "Viewed the insurance policy", group: "documents" },
  document_uploaded: { label: "Added a document", group: "documents" },
  document_renamed: { label: "Renamed a document", group: "documents" },
  document_recategorised: { label: "Moved a document to another category", group: "documents" },
  document_linked: { label: "Linked a document to a request", group: "documents" },
  document_details_changed: { label: "Changed the details of a document", group: "documents" },
  data_exported: { label: "Took a copy of the data", group: "account" },
  approval_approved: { label: "Approved a cost", group: "requests" },
  approval_declined: { label: "Declined a cost", group: "requests" },
  approval_undone: { label: "Undid a decision", group: "requests" },
  approval_step_recorded: { label: "A step on an approval was recorded", group: "requests" },
  request_created: { label: "A request was made", group: "requests" },
  request_created_whatsapp: { label: "A request arrived on WhatsApp", group: "requests" },
  request_details_updated: { label: "Place and timing details were added", group: "requests" },
  request_cancelled: { label: "A request was cancelled", group: "requests" },
  request_disputed: { label: "A request was disputed", group: "requests" },
  request_escalated: { label: "A request was escalated", group: "desk" },
  view_request: { label: "Opened a request", group: "requests" },
  quote_sent: { label: "The desk sent a quotation", group: "desk" },
  price_calculated: { label: "The desk prepared a price", group: "desk" },
  payment_recorded: { label: "How to pay was added", group: "desk" },
  payment_confirmed: { label: "A payment was confirmed", group: "desk" },
  payment_failed: { label: "A payment did not go through", group: "desk" },
  log_time: { label: "The desk logged time on your work", group: "desk" },
  visit_scheduled: { label: "A visit was booked", group: "desk" },
  visit_completed: { label: "A visit was completed", group: "desk" },
  property_added: { label: "Added a property", group: "account" },
  property_updated: { label: "Changed a property", group: "account" },
  property_removed: { label: "Removed a property", group: "account" },
  property_contact_changed: { label: "Changed who to contact at a property", group: "account" },
  deadline_added: { label: "Added a bill or date", group: "account" },
  member_added: { label: "Added a family member", group: "account" },
  member_joined: { label: "A family member joined", group: "account" },
  member_revoked: { label: "Removed a family member", group: "account" },
  member_permissions_changed: { label: "Changed what a family member can see", group: "account" },
  family_onboarded: { label: "The account was set up", group: "account" },
  assistant_query: { label: "Asked Ally Assistant a question", group: "account" },
  whatsapp_linked: { label: "Linked a WhatsApp number", group: "account" },
  whatsapp_link_code_created: { label: "Made a code to link WhatsApp", group: "account" },
  whatsapp_stop: { label: "Stopped messages on WhatsApp", group: "account" },
};

export function describeAudit(action: string): { label: string; group: AuditGroup } {
  if (KNOWN[action]) return KNOWN[action];
  if (action.startsWith("request_status:")) {
    const s = action.slice("request_status:".length) as RequestStatus;
    return { label: `Your request moved to ${STATUS_META[s]?.label ?? s.replaceAll("_", " ")}`, group: "requests" };
  }
  if (action.startsWith("parent_consent_withdrawn")) return { label: "Consent was withdrawn", group: "account" };
  const plain = action.replaceAll("_", " ").replaceAll(":", " ").trim();
  return { label: plain.charAt(0).toUpperCase() + plain.slice(1), group: "account" };
}

export interface LogRow { id: string; at: string; who: string; label: string; group: AuditGroup; count: number }

/** Merges runs of the same thing by the same person on the same day, so ten page opens read as one line. */
export function collapseLog(entries: { id: string; at: string; action: string; actorId: string }[], who: (actorId: string) => string): LogRow[] {
  const out: LogRow[] = [];
  for (const e of entries) {
    const d = describeAudit(e.action);
    const w = who(e.actorId);
    const prev = out[out.length - 1];
    if (prev && prev.label === d.label && prev.who === w && prev.at.slice(0, 10) === e.at.slice(0, 10)) { prev.count += 1; continue; }
    out.push({ id: e.id, at: e.at, who: w, label: d.label, group: d.group, count: 1 });
  }
  return out;
}
