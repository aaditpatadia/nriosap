import "server-only";
import { asService, tx, type Tx } from "./db";
import { log } from "./log";
import { looksLikeAdvice } from "./rules";
import { sendingEnabled, sendTemplate, sendText } from "./wa-client";
import { decryptPhone } from "./wa-phone";
import { renderTemplate, replyText, templateByName, WA_LANG_CODE, type ReplyKind, type WaLang } from "./wa-templates";
import { insideServiceWindow } from "./whatsapp";

type Row = Record<string, any>;

export interface Recipient { familyId: string | null; phoneHash: string; phoneEnc: string | null; phoneTail: string | null; language: WaLang }

/** True while the number has sent STOP and not yet agreed again. */
export async function isOptedOut(t: Tx, hash: string): Promise<boolean> {
  const r = await t.one<Row>("select stopped_at, restarted_at from whatsapp_optouts where phone_hash = $1", [hash]);
  return !!r && (!r.restarted_at || new Date(r.restarted_at) < new Date(r.stopped_at));
}

/** Writes a reply to the outbox. Nothing is sent from here: delivery happens in deliver(), and only when the flag is on. */
export async function queueReply(t: Tx, to: Recipient, kind: ReplyKind, vars: { name?: string; coordinator?: string; ref?: string }, opts: { requestId?: string | null; draftedBy?: string | null } = {}): Promise<string> {
  return queueText(t, to, replyText(kind, to.language, vars), { ...opts, kind });
}

export async function queueText(t: Tx, to: Recipient, text: string, opts: { requestId?: string | null; draftedBy?: string | null; kind?: string } = {}): Promise<string> {
  const blocked = looksLikeAdvice(text);
  const r = await t.one<Row>(
    `insert into whatsapp_messages(family_id, phone_hash, phone_enc, phone_tail, direction, type, text, language, status, request_id, drafted_by, sender_kind, title)
     values ($1,$2,$3,$4,'out','text',$5,$6,$7,$8,$9,'desk',$10) returning id`,
    [to.familyId, to.phoneHash, to.phoneEnc, to.phoneTail, text.slice(0, 4000), to.language, blocked ? "blocked" : "queued", opts.requestId ?? null, opts.draftedBy ?? null, opts.kind ?? null],
  );
  return r!.id;
}

export async function queueTemplate(t: Tx, to: Recipient, name: string, values: string[], opts: { requestId?: string | null; draftedBy?: string | null } = {}): Promise<string | null> {
  const def = templateByName(name);
  if (!def || values.length !== def.vars.length) return null;
  const text = renderTemplate(def, to.language, values);
  const r = await t.one<Row>(
    `insert into whatsapp_messages(family_id, phone_hash, phone_enc, phone_tail, direction, type, text, language, status, request_id, drafted_by, sender_kind, template_name, template_vars)
     values ($1,$2,$3,$4,'out','template',$5,$6,'queued',$7,$8,'desk',$9,$10) returning id`,
    [to.familyId, to.phoneHash, to.phoneEnc, to.phoneTail, text, to.language, opts.requestId ?? null, opts.draftedBy ?? null, name, JSON.stringify(values)],
  );
  return r!.id;
}

export type DeliverResult = "would_send" | "sent" | "failed" | "blocked";

/**
 * The only place a WhatsApp message can leave. With WHATSAPP_SENDING off (the default) the row becomes
 * "would send", for the desk to read and copy. With it on: free text only inside 24 hours of the person's
 * last message, templates otherwise, never to a number that sent STOP (except the one STOP confirmation).
 */
export async function deliver(id: string): Promise<DeliverResult> {
  const m = await asService(() =>
    tx(async (t) => {
      const row = await t.one<Row>("select * from whatsapp_messages where id = $1 and direction = 'out' and status = 'queued' for update", [id]);
      if (!row) return null;
      const last = await t.one<Row>("select max(received_at) as at from whatsapp_messages where phone_hash = $1 and direction = 'in'", [row.phone_hash]);
      const stopped = await isOptedOut(t, row.phone_hash);
      return { ...row, last_in: last?.at ?? null, stopped } as Row;
    }),
  );
  if (!m) return "blocked";
  const set = (status: string, extra: { wamid?: string | null; error?: number | null } = {}) =>
    asService(() => tx((t) => t.run("update whatsapp_messages set status = $2, wamid = coalesce($3, wamid), error_code = $4 where id = $1", [id, status, extra.wamid ?? null, extra.error ?? null])));

  const block = async (): Promise<DeliverResult> => {
    await set("blocked");
    return "blocked";
  };
  if (looksLikeAdvice(m.text ?? "")) return block();
  // The one message allowed after STOP is the confirmation that we stopped.
  if (m.stopped && m.title !== "stopped") return block();
  if (!sendingEnabled()) {
    await set("would_send");
    return "would_send";
  }
  if (!m.phone_enc) return block();
  const to = decryptPhone(m.phone_enc);
  const inWindow = insideServiceWindow(m.last_in ?? undefined, new Date());
  let r;
  if (m.type === "template") {
    const values = (m.template_vars as string[] | null) ?? [];
    r = await sendTemplate(to, m.template_name, WA_LANG_CODE[(m.language as WaLang) ?? "English"] ?? "en", values);
  } else if (inWindow) {
    r = await sendText(to, m.text);
  } else {
    return block();
  }
  if (r.status === "sent") {
    await set("sent", { wamid: r.waId || null });
    return "sent";
  }
  log("warn", "whatsapp_send_failed", { messageId: id, code: r.status === "failed" ? r.code : 0 });
  await set(r.status === "disabled" ? "would_send" : "failed", { error: r.status === "failed" ? r.code : null });
  return r.status === "disabled" ? "would_send" : "failed";
}

export async function deliverAll(ids: string[]) {
  for (const id of ids) await deliver(id);
}
