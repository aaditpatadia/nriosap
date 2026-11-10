import "server-only";
import { asService, isUuid, one, rows, tx } from "./db";

type Row = Record<string, any>;
export type PaymentStatus = "pending" | "confirmed" | "failed";
export interface PaymentRecord { id: string; requestId: string; payee: string; amountInr: number; method: "provider_link" | "bank_transfer" | "other"; linkUrl: string | null; status: PaymentStatus; reference: string | null; receiptDocumentId: string | null; note: string | null; confirmedAt: string | null; createdAt: string }

const toPayment = (p: Row): PaymentRecord => ({ id: p.id, requestId: p.request_id, payee: p.payee, amountInr: Number(p.amount_inr), method: p.method, linkUrl: p.link_url, status: p.status, reference: p.reference, receiptDocumentId: p.receipt_document_id, note: p.note, confirmedAt: p.confirmed_at, createdAt: p.created_at });

export async function paymentsForRequest(requestId: string): Promise<PaymentRecord[]> {
  if (!isUuid(requestId)) return [];
  return (await rows<Row>("select id, request_id, payee, amount_inr, method, link_url, status, reference, receipt_document_id, note, confirmed_at, created_at from payments where request_id = $1 order by created_at desc", [requestId])).map(toPayment);
}

/** Only https links to the provider's own payment page. Ally never receives this money. */
export function safePaymentLink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Staff record how the customer pays, once the customer has approved the quotation. */
export async function recordPayment(requestId: string, p: { method: PaymentRecord["method"]; linkUrl: string | null; note: string }, userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isUuid(requestId)) return { ok: false, reason: "Request not found." };
  const q = await one<Row>("select q.id, q.family_id, q.total_inr, coalesce(q.provider_name, 'the provider') as payee from quotations q where q.request_id = $1 and q.status = 'approved' and public.can_work_family(q.family_id) order by q.created_at desc limit 1", [requestId]);
  if (!q) return { ok: false, reason: "The customer has not approved a quotation for this request." };
  await asService(() => tx(async (t) => {
    const r = await t.one<Row>("insert into payments(family_id, request_id, quotation_id, payee, amount_inr, method, link_url, note, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id", [q.family_id, requestId, q.id, q.payee, q.total_inr, p.method, p.linkUrl, p.note || null, userId]);
    await t.run("insert into request_events(request_id, family_id, kind, body, actor_id, actor_name) values ($1,$2,'update',$3,$4,'Desk')", [requestId, q.family_id, p.linkUrl ? `How to pay: use ${q.payee}'s own payment page. Ally does not receive this money.` : `How to pay ${q.payee} has been added.`, userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,'payment_recorded','payment',$2,$3)", [userId, r!.id, q.family_id]);
  }));
  return { ok: true };
}

/** A payment is shown as confirmed only with a receipt or a reference that proves it. */
export async function settlePayment(paymentId: string, status: "confirmed" | "failed", proof: { reference: string; receiptDocumentId: string | null }, userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isUuid(paymentId)) return { ok: false, reason: "Payment not found." };
  if (status === "confirmed" && !proof.reference && !proof.receiptDocumentId) return { ok: false, reason: "Add the payment reference or the receipt first." };
  const p = await one<Row>("select id, family_id, request_id from payments where id = $1 and public.can_work_family(family_id)", [paymentId]);
  if (!p) return { ok: false, reason: "That payment is not on your list." };
  await asService(() => tx(async (t) => {
    const receipt = proof.receiptDocumentId && isUuid(proof.receiptDocumentId) ? (await t.one<Row>("select id from documents where id = $1 and family_id = $2 and deleted_at is null", [proof.receiptDocumentId, p.family_id]))?.id ?? null : null;
    await t.run("update payments set status = $2, reference = coalesce(nullif($3,''), reference), receipt_document_id = coalesce($4, receipt_document_id), confirmed_by = case when $2 = 'confirmed' then $5::uuid end, confirmed_at = case when $2 = 'confirmed' then now() end where id = $1", [paymentId, status, proof.reference, receipt, userId]);
    await t.run("insert into request_events(request_id, family_id, kind, body, actor_id, actor_name) values ($1,$2,'update',$3,$4,'Desk')", [p.request_id, p.family_id, status === "confirmed" ? "Payment confirmed, with proof saved." : "The payment did not go through. Your coordinator will tell you what to do next.", userId]);
    await t.run("insert into audit_log(actor_id, action, entity, entity_id, family_id) values ($1,$2,'payment',$3,$4)", [userId, `payment_${status}`, paymentId, p.family_id]);
  }));
  return { ok: true };
}
