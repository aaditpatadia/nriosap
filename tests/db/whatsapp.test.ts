import pg from "pg";
import { afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { asRole, ID } from "./helpers";

/**
 * The WhatsApp pipeline on real Postgres. Families, numbers and people here are made up for this file,
 * so STOP and plan limits here cannot affect other test files.
 */
const url = inject("dbUrl");
let db: pg.Client;

const WA = {
  owner: "aaaaaaaa-0000-4000-8000-0000000000a1",
  liteOwner: "aaaaaaaa-0000-4000-8000-0000000000a2",
  fam: "11111111-0000-4000-8000-0000000000a1",
  lite: "11111111-0000-4000-8000-0000000000a2",
  parent: "22222222-0000-4000-8000-0000000000a1",
  liteParent: "22222222-0000-4000-8000-0000000000a2",
};
const PARENT = "919870000001";
const LITE_PARENT = "919870000002";
const CONTACT = "919870000003";
const STRANGER = "15550001234";
const OWNER_PHONE = "447700900123";

let seq = 0;
const wamid = () => `wamid.test.${Date.now()}.${seq++}`;
const payload = (msgs: object[]) => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value: { messages: msgs } }] }] });
const text = (from: string, body: string, extra: object = {}) => ({ from, id: wamid(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body }, ...extra });

async function send(m: object) {
  const { ingest, processMessage } = await import("@/lib/wa-pipeline");
  const r = await ingest(payload([m]));
  for (const id of r.stored) await processMessage(id);
  return { ...r, row: r.stored[0] ? (await db.query("select * from whatsapp_messages where id = $1", [r.stored[0]])).rows[0] : undefined };
}
const outbox = async (since: Date) => (await db.query("select title, status, text, phone_hash from whatsapp_messages where direction = 'out' and created_at >= $1 order by created_at", [since])).rows;
const n = async (sql: string, p: unknown[] = []) => Number((await db.query(sql, p)).rows[0].n);

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  process.env.WHATSAPP_CATEGORISER = "mock";
  process.env.WHATSAPP_LIMIT_PER_NUMBER = "1000";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "000";
  delete process.env.WHATSAPP_SENDING;
  delete process.env.WHATSAPP_SEND_ENABLED;
  db = new pg.Client({ connectionString: url });
  await db.connect();
  for (const [id, email] of [[WA.owner, "wa-owner@x.test"], [WA.liteOwner, "wa-lite@x.test"]]) {
    await db.query("insert into auth.users(id,email) values ($1,$2)", [id, email]);
    await db.query("update profiles set role='owner', name=$2 where id=$1", [id, email === "wa-owner@x.test" ? "Priya Test" : "Lite Owner"]);
  }
  await db.query("update profiles set name = 'Meera Test' where id = $1", [ID.coord]);
  await db.query("insert into families(id,owner_id,coordinator_id,name,plan_usd) values ($1,$2,$3,'WA family',79),($4,$5,$3,'WA lite family',40)", [WA.fam, WA.owner, ID.coord, WA.lite, WA.liteOwner]);
  await db.query("insert into parents(id,family_id,name,phone,language,city,consent_status) values ($1,$2,'Kusum Test',$3,'Gujarati','Rajkot','granted'),($4,$5,'Lite Parent',$6,'Hindi','Pune','granted')", [WA.parent, WA.fam, `+${PARENT}`, WA.liteParent, WA.lite, `+${LITE_PARENT}`]);
  for (const [p, purpose] of [[WA.parent, "store"], [WA.parent, "read_records"], [WA.liteParent, "store"], [WA.liteParent, "read_records"]]) await db.query("insert into consents(parent_id,purpose) values ($1,$2)", [p, purpose]);
  await db.query("insert into family_members(family_id, name, relation, status, phone, language) values ($1,'Cousin Test','relative','contact',$2,'Marathi')", [WA.fam, `+${CONTACT}`]);
});

afterEach(() => vi.unstubAllGlobals());

describe("webhook storage", () => {
  it("stores a repeated delivery once", async () => {
    const { ingest } = await import("@/lib/wa-pipeline");
    const m = text(PARENT, "only once");
    const a = await ingest(payload([m]));
    const b = await ingest(payload([m]));
    expect(a.stored).toHaveLength(1);
    expect(b).toMatchObject({ stored: [], duplicates: 1 });
    expect(await n("select count(*)::int n from whatsapp_messages where wamid = $1", [m.id])).toBe(1);
  });
  it("keeps the number encrypted and hashed, never in plain text", async () => {
    const { row } = await send(text(PARENT, "Please renew the health policy for Kusum"));
    expect(JSON.stringify(row)).not.toContain(PARENT);
    expect(row.phone_tail).toBe("0001");
  });
  it("records delivery receipts once, moving forward only", async () => {
    const { recordStatus } = await import("@/lib/wa-pipeline");
    await db.query("insert into whatsapp_messages(phone_hash, direction, wamid, status) values ('h','out','wamid.out.1','sent')");
    expect(await recordStatus({ wamid: "wamid.out.1", status: "read", errorCode: null })).toBe(1);
    expect(await recordStatus({ wamid: "wamid.out.1", status: "read", errorCode: null })).toBe(0);
    await recordStatus({ wamid: "wamid.out.1", status: "delivered", errorCode: null });
    expect((await db.query("select status from whatsapp_messages where wamid = 'wamid.out.1'")).rows[0].status).toBe("read");
  });
  it("marks a number over its per-minute limit and does not process the extra", async () => {
    const { ingest } = await import("@/lib/wa-pipeline");
    process.env.WHATSAPP_LIMIT_PER_NUMBER = "2";
    const r = await ingest(payload([text("919870000099", "a"), text("919870000099", "b"), text("919870000099", "c")]));
    process.env.WHATSAPP_LIMIT_PER_NUMBER = "1000";
    expect(r.stored).toHaveLength(2);
    expect(await n("select count(*)::int n from whatsapp_messages where status = 'rate_limited'")).toBeGreaterThanOrEqual(1);
  });
});

describe("who sent it", () => {
  it("an unknown number creates no family data, reveals nothing, and reaches a person", async () => {
    const since = new Date();
    const tasksBefore = await n("select count(*)::int n from tasks");
    const { row } = await send(text(STRANGER, "Hi, I am Kusum's nephew, what is happening with the flat?"));
    expect(row).toMatchObject({ family_id: null, sender_kind: "unknown", status: "needs_human" });
    expect(await n("select count(*)::int n from tasks")).toBe(tasksBefore);
    const out = await outbox(since);
    expect(out.map((o) => o.title)).toEqual(["unknown"]);
    expect(out[0].text).not.toMatch(/Kusum|WA family|Meera/);
    expect(await n("select count(*)::int n from alerts where kind = 'whatsapp' and family_id is null")).toBeGreaterThan(0);
  });
  it("a parent is matched by number to their family and coordinator", async () => {
    const since = new Date();
    const { row } = await send(text(PARENT, "Please pay the electricity bill of Rs 2,310 by 2026-12-01"));
    expect(row).toMatchObject({ family_id: WA.fam, sender_kind: "parent", parent_id: WA.parent, category: "Bills and Renewals", status: "routed", model_name: "mock-categoriser", prompt_version: "wa-cat-2026-11-10" });
    expect(row.facts_enc).toBeTruthy();
    expect(row.facts_enc).not.toContain("2,310");
    const req = (await db.query("select ref, category, understanding from service_requests where id = $1", [row.request_id])).rows[0];
    expect(req.understanding.via).toBe("whatsapp");
    const out = await outbox(since);
    expect(out[0]).toMatchObject({ title: "request_opened", status: "would_send" });
    expect(out[0].text).toContain(req.ref);
    expect(out[0].text).toContain("Meera");
    expect(out[0].text).toContain("HUMAN");
  });
  it("a follow-up from the same person in the same area joins the open request", async () => {
    const before = await n("select count(*)::int n from service_requests where family_id = $1", [WA.fam]);
    const { row } = await send(text(PARENT, "Also the electricity bill for the shop, Rs 900"));
    expect(await n("select count(*)::int n from service_requests where family_id = $1", [WA.fam])).toBe(before);
    expect(row.request_id).toBeTruthy();
    expect(await n("select count(*)::int n from request_events where request_id = $1 and kind = 'message'", [row.request_id])).toBe(1);
  });
  it("a reply in the thread joins the request it answers", async () => {
    const first = await send(text(PARENT, "Please arrange a plumber for the leak in Rajkot"));
    const out = (await db.query("select id from whatsapp_messages where direction = 'out' and request_id = $1", [first.row.request_id])).rows[0];
    await db.query("update whatsapp_messages set wamid = 'wamid.out.thread' where id = $1", [out.id]);
    const { row } = await send(text(PARENT, "Tomorrow morning is fine", { context: { id: "wamid.out.thread" } }));
    expect(row.request_id).toBe(first.row.request_id);
  });
});

describe("consent and STOP", () => {
  it("a WhatsApp-only contact gets the consent question first, and nothing is read before YES", async () => {
    const since = new Date();
    const { row } = await send(text(CONTACT, "Please book a doctor appointment for aaji"));
    expect(row).toMatchObject({ sender_kind: "contact", status: "held_consent", ai_status: "not_run", category: null });
    expect((await outbox(since)).map((o) => o.title)).toEqual(["consent_prompt"]);
    await send(text(CONTACT, "होय"));
    expect(await n("select count(*)::int n from whatsapp_consents where purpose in ('handle','ai_read') and granted_at is not null and wording_version like 'wa-consent%'")).toBeGreaterThanOrEqual(2);
    const after = (await db.query("select status, category from whatsapp_messages where id = $1", [row.id])).rows[0];
    expect(after.status).not.toBe("held_consent");
    expect(after.category).toBeTruthy();
  });
  it("STOP in Hindi stops everything, is audited, and only the confirmation is queued", async () => {
    const since = new Date();
    const { row } = await send(text(CONTACT, "band karo"));
    expect(row.status).toBe("stopped");
    expect(await n("select count(*)::int n from whatsapp_optouts where phone_hash = $1 and restarted_at is null", [row.phone_hash])).toBe(1);
    expect(await n("select count(*)::int n from whatsapp_consents where phone_hash = $1 and withdrawn_at is null", [row.phone_hash])).toBe(0);
    expect(await n("select count(*)::int n from audit_log where action = 'whatsapp_stop' and entity_id = $1", [row.id])).toBe(1);
    expect((await outbox(since)).map((o) => o.title)).toEqual(["stopped"]);
  });
  it("after STOP a new message is held and START only re-opens after YES", async () => {
    const held = await send(text(CONTACT, "Any news on the appointment?"));
    expect(held.row.status).toBe("held_consent");
    await send(text(CONTACT, "START"));
    expect(await n("select count(*)::int n from whatsapp_optouts where phone_hash = $1 and restarted_at is null", [held.row.phone_hash])).toBe(1);
    await send(text(CONTACT, "YES"));
    expect(await n("select count(*)::int n from whatsapp_optouts where phone_hash = $1 and restarted_at is not null", [held.row.phone_hash])).toBe(1);
  });
  it("a parent's STOP withdraws their consent and pauses the family, as the app does", async () => {
    const { row } = await send(text(LITE_PARENT, "STOP"));
    expect(row.status).toBe("stopped");
    expect((await db.query("select consent_status from parents where id = $1", [WA.liteParent])).rows[0].consent_status).toBe("withdrawn");
    expect((await db.query("select status from families where id = $1", [WA.lite])).rows[0].status).toBe("paused");
    // A parent's consent comes back only through the coordinator's call, never a WhatsApp YES.
    await send(text(LITE_PARENT, "haan"));
    expect((await db.query("select consent_status from parents where id = $1", [WA.liteParent])).rows[0].consent_status).toBe("withdrawn");
    await db.query("update parents set consent_status = 'granted' where id = $1", [WA.liteParent]);
    await db.query("update consents set withdrawn_at = null where parent_id = $1", [WA.liteParent]);
    await db.query("update whatsapp_optouts set restarted_at = now() where phone_hash = $1", [row.phone_hash]);
  });
});

describe("routing", () => {
  it("an emergency in Gujarati goes to the top of the queue before anything else runs", async () => {
    const since = new Date();
    const { row } = await send(text(PARENT, "પપ્પા બાથરૂમમાં પડી ગયા"));
    expect(row).toMatchObject({ category: "emergency", status: "needs_human", ai_status: "skipped_rules" });
    const task = (await db.query("select title, sla_at, source from tasks where id = $1", [row.task_id])).rows[0];
    expect(task.title).toMatch(/^EMERGENCY/);
    expect(task.source).toBe("whatsapp");
    expect(new Date(task.sla_at).getTime() - Date.now()).toBeLessThan(11 * 60_000);
    const out = await outbox(since);
    expect(out[0].title).toBe("emergency");
    expect(out[0].text).toContain("112");
  });
  it("a reading under 90% opens a check task", async () => {
    const { row } = await send(text(PARENT, "[lowconf] check on the tenant at our flat"));
    expect(row.status).toBe("needs_human");
    expect(Number(row.confidence)).toBeLessThan(0.9);
    const t = (await db.query("select title, checklist from tasks where id = (select task_id from service_requests where id = $1)", [row.request_id])).rows[0];
    expect(t.title).toMatch(/^Check:/);
    expect(t.checklist[0]).toMatch(/under 90%/);
  });
  it("when the model refuses, it falls back to a plain human task", async () => {
    const { row } = await send(text(PARENT, "[fail] something odd"));
    expect(row).toMatchObject({ ai_status: "refused", status: "needs_human", category: "unclear" });
    expect(row.task_id).toBeTruthy();
  });
  it("an unlawful request is refused by the rules and never becomes a request", async () => {
    const before = await n("select count(*)::int n from service_requests");
    const { row } = await send(text(PARENT, "Can you pay a bribe to speed up the property papers?"));
    expect(row).toMatchObject({ category: "refused", status: "needs_human" });
    expect(await n("select count(*)::int n from service_requests")).toBe(before);
  });
  it("an advice question is answered with a route to a professional, never advice", async () => {
    const since = new Date();
    const { row } = await send(text(PARENT, "Should I sell the flat in Rajkot this year?"));
    expect(row.needs_professional).toBe(true);
    expect((await outbox(since))[0].title).toBe("professional");
  });
  it("Lite's request limit queues the message as waiting for plan and tells the owner", async () => {
    for (let i = 0; i < 3; i++) await db.query("insert into service_requests(family_id, category, title, description) values ($1,'Custom Requests','x','x')", [WA.lite]);
    const before = await n("select count(*)::int n from service_requests where family_id = $1", [WA.lite]);
    const { row } = await send(text(LITE_PARENT, "Please pay the water bill"));
    expect(row.status).toBe("waiting_plan");
    expect(await n("select count(*)::int n from service_requests where family_id = $1", [WA.lite])).toBe(before);
    expect(await n("select count(*)::int n from events where family_id = $1 and text like 'A WhatsApp request is waiting%'", [WA.lite])).toBe(1);
  });
  it("a HUMAN reply opens a call-back task", async () => {
    const { row } = await send(text(PARENT, "HUMAN"));
    expect(row.status).toBe("command");
    expect((await db.query("select title from tasks where id = $1", [row.task_id])).rows[0].title).toMatch(/^Call back/);
  });
});

describe("media", () => {
  it("rejects video and stickers politely without downloading them", async () => {
    const since = new Date();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { row } = await send({ from: PARENT, id: wamid(), type: "video", video: { id: "media-video-1", mime_type: "video/mp4" } });
    expect(row.status).toBe("rejected");
    expect(f).not.toHaveBeenCalled();
    expect((await outbox(since))[0].title).toBe("unsupported_media");
  });
  it("rejects a Word file sent as a document", async () => {
    const { row } = await send({ from: PARENT, id: wamid(), type: "document", document: { id: "media-docx-1", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: "a.docx" } });
    expect(row.status).toBe("rejected");
  });
  it("rejects a file over the size cap using Meta's stated size, before downloading it", async () => {
    const since = new Date();
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "application/pdf", file_size: 40 * 1024 * 1024 })));
    vi.stubGlobal("fetch", f);
    const { row } = await send({ from: PARENT, id: wamid(), type: "document", document: { id: "media-big-1", mime_type: "application/pdf", filename: "big.pdf" } });
    expect(row.status).toBe("rejected");
    expect(f).toHaveBeenCalledTimes(1);
    expect((await outbox(since))[0].title).toBe("too_big");
  });
  it("a file Meta will not give us becomes a task for a person, and the message is kept", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 404 })));
    const { row } = await send({ from: PARENT, id: wamid(), type: "image", image: { id: "media-gone-1", mime_type: "image/jpeg" } });
    expect(row.status).toBe("needs_human");
    expect((await db.query("select title from tasks where id = $1", [row.task_id])).rows[0].title).toMatch(/send their file again/);
  });
});

describe("approvals by WhatsApp", () => {
  let ref = "";
  let approvalId = "";
  beforeAll(async () => {
    const r = (await db.query("insert into service_requests(family_id, category, title, description, status) values ($1,'Repairs and Local Services','Fix the geyser','x','awaiting_approval') returning id, ref", [WA.fam])).rows[0];
    ref = r.ref;
    approvalId = (await db.query("insert into approvals(family_id, summary, amount_inr) values ($1,'Fix the geyser',2500) returning id", [WA.fam])).rows[0].id;
    await db.query("insert into quotations(request_id, family_id, approval_id, total_inr) values ($1,$2,$3,2500)", [r.id, WA.fam, approvalId]);
  });
  it("does not count from a parent, or from an owner whose number is not linked", async () => {
    const { row } = await send(text(PARENT, `APPROVE ${ref}`));
    expect(row.status).toBe("command");
    expect((await db.query("select status from approvals where id = $1", [approvalId])).rows[0].status).toBe("pending");
  });
  it("counts from the owner's linked number, with the 5 minute undo", async () => {
    const { createLinkCode } = await import("@/lib/wa-pipeline");
    const code = await createLinkCode(WA.owner);
    await send(text(OWNER_PHONE, `LINK ${code}`));
    expect((await db.query("select whatsapp_verified_at from profiles where id = $1", [WA.owner])).rows[0].whatsapp_verified_at).toBeTruthy();
    // A used code never works twice.
    const again = await send(text("447700900999", `LINK ${code}`));
    expect(again.row.sender_kind).toBe("unknown");

    await send(text(OWNER_PHONE, `APPROVE ${ref}`));
    const a = (await db.query("select status, decided_by, undo_until, executed_at from approvals where id = $1", [approvalId])).rows[0];
    expect(a).toMatchObject({ status: "approved", decided_by: WA.owner, executed_at: null });
    expect(new Date(a.undo_until).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    await send(text(OWNER_PHONE, `UNDO ${ref}`));
    expect((await db.query("select status from approvals where id = $1", [approvalId])).rows[0].status).toBe("pending");
  });
  it("nothing in the WhatsApp pipeline executed a payment", async () => {
    expect(await n("select count(*)::int n from approvals where executed_at is not null and family_id in ($1,$2)", [WA.fam, WA.lite])).toBe(0);
    expect(await n("select count(*)::int n from payments where family_id in ($1,$2)", [WA.fam, WA.lite])).toBe(0);
  });
});

describe("sending", () => {
  it("with the flag off every reply waits as would_send and nothing reaches Meta", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await send(text(PARENT, "Please renew the car insurance"));
    expect(f).not.toHaveBeenCalled();
    expect(await n("select count(*)::int n from whatsapp_messages where direction = 'out' and status = 'sent'")).toBe(0);
  });
  it("with the flag on, free text goes inside 24 hours, and is held outside it", async () => {
    const { deliver, queueText } = await import("@/lib/wa-outbox");
    const { asService, tx } = await import("@/lib/db");
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.sent.1" }] })));
    vi.stubGlobal("fetch", f);
    process.env.WHATSAPP_SENDING = "1";
    try {
      const recent = (await db.query("select family_id, phone_hash, phone_enc, phone_tail from whatsapp_messages where direction = 'in' and sender_kind = 'parent' and family_id = $1 order by received_at desc limit 1", [WA.fam])).rows[0];
      const to = { familyId: recent.family_id, phoneHash: recent.phone_hash, phoneEnc: recent.phone_enc, phoneTail: recent.phone_tail, language: "English" as const };
      const id1 = await asService(() => tx((t) => queueText(t, to, "Namaste, Meera here. I have your message.")));
      expect(await deliver(id1)).toBe("sent");
      expect(f).toHaveBeenCalledTimes(1);
      await db.query("update whatsapp_messages set received_at = now() - interval '25 hours' where phone_hash = $1 and direction = 'in'", [recent.phone_hash]);
      const id2 = await asService(() => tx((t) => queueText(t, to, "Another update.")));
      expect(await deliver(id2)).toBe("blocked");
      expect(f).toHaveBeenCalledTimes(1);
      const id3 = await asService(() => tx((t) => queueText(t, to, "You should stop taking the tablets")));
      expect(await deliver(id3)).toBe("blocked");
    } finally {
      delete process.env.WHATSAPP_SENDING;
    }
  });
});

describe("RLS on the new tables", () => {
  const count = (sub: string | null, sql: string, p: unknown[] = [], role: "anon" | "authenticated" = "authenticated") => asRole(url, role, sub, async (c) => Number((await c.query(sql, p)).rows[0].n));
  it("an owner sees their own family's WhatsApp messages and no one else's", async () => {
    expect(await count(WA.owner, "select count(*)::int n from whatsapp_messages where family_id = $1", [WA.fam])).toBeGreaterThan(0);
    expect(await count(WA.owner, "select count(*)::int n from whatsapp_messages where family_id is distinct from $1", [WA.fam])).toBe(0);
  });
  it("an outsider and anonymous see nothing in any new table", async () => {
    for (const t of ["whatsapp_messages", "whatsapp_status_events", "whatsapp_consents", "whatsapp_optouts", "whatsapp_link_codes"]) {
      expect(await count(ID.outsider, `select count(*)::int n from ${t}`), t).toBe(0);
      expect(await count(null, `select count(*)::int n from ${t}`, [], "anon"), t).toBe(0);
    }
  });
  it("the desk sees unknown-number messages, owners do not", async () => {
    expect(await count(ID.coord, "select count(*)::int n from whatsapp_messages where family_id is null")).toBeGreaterThan(0);
    expect(await count(WA.owner, "select count(*)::int n from whatsapp_messages where family_id is null")).toBe(0);
  });
  it("a coordinator of another family sees none of this family's messages", async () => {
    expect(await count(ID.coord2, "select count(*)::int n from whatsapp_messages where family_id = $1", [WA.fam])).toBe(0);
  });
  it("no signed-in user can write to the new tables directly", async () => {
    for (const sql of [
      "insert into whatsapp_messages(phone_hash, direction) values ('x','in')",
      "update whatsapp_messages set status = 'confirmed'",
      "insert into whatsapp_consents(phone_hash, purpose, wording_version) values ('x','handle','v')",
      "delete from whatsapp_optouts",
      "insert into whatsapp_link_codes(code_hash, profile_id, expires_at) values ('x', auth.uid(), now())",
    ]) {
      const r = await asRole(url, "authenticated", WA.owner, async (c) => {
        try {
          return (await c.query(sql)).rowCount === 0 ? "no-rows" : "ALLOWED";
        } catch (e) {
          return (e as Error).message;
        }
      });
      expect(r, sql).not.toBe("ALLOWED");
    }
  });
});
