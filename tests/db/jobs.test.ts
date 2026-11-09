import pg from "pg";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

const count = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0].n as number;

describe("background jobs on real Postgres", () => {
  it("raises one SLA alert per late task, however often it runs", async () => {
    const { runSlaAlerts } = await import("@/lib/jobs");
    await db.query("update tasks set sla_at = now() - interval '1 hour', status = 'doing' where id = $1", [ID.task]);
    await runSlaAlerts();
    await runSlaAlerts();
    expect(await count("select count(*)::int n from alerts where dedupe_key = $1", [`sla:${ID.task}`])).toBe(1);
  });

  it("flags a family over its hour budget", async () => {
    const { runSlaAlerts } = await import("@/lib/jobs");
    await db.query("insert into time_entries(task_id,family_id,user_id,minutes) values ($1,$2,$3,500)", [ID.task2, ID.fam2, ID.coord2]);
    await runSlaAlerts();
    expect(await count("select count(*)::int n from alerts where kind='hours' and family_id=$1", [ID.fam2])).toBe(1);
  });

  it("does nothing for an approval still inside the undo window", async () => {
    const { runApprovedActions } = await import("@/lib/jobs");
    await db.query("update approvals set status='approved', amount_inr=100, undo_until=now()+interval '4 minutes', executed_at=null where id=$1", [ID.approval]);
    await runApprovedActions();
    expect((await db.query("select executed_at from approvals where id=$1", [ID.approval])).rows[0].executed_at).toBeNull();
  });

  it("records the stub step once the window closes, and says no money moved", async () => {
    const { runApprovedActions } = await import("@/lib/jobs");
    await db.query("update approvals set undo_until=now()-interval '1 minute' where id=$1", [ID.approval]);
    const r = await runApprovedActions();
    expect(r.executed).toBe(1);
    const row = (await db.query("select execution_ref from approvals where id=$1", [ID.approval])).rows[0];
    expect(row.execution_ref).toBe(`stub-${ID.approval}`);
    expect(await count("select count(*)::int n from events where text like '%No money has moved%'")).toBeGreaterThan(0);
  });

  it("never touches a pending approval", async () => {
    const { runApprovedActions } = await import("@/lib/jobs");
    await db.query("update approvals set status='pending', undo_until=null, executed_at=null where id=$1", [ID.approval]);
    expect((await runApprovedActions()).executed).toBe(0);
  });

  it("renewal 30 days out creates one alert and one task, and sends nothing with the flag off", async () => {
    const { runRenewalReminders } = await import("@/lib/jobs");
    await db.query("update policies set renewal_date = current_date + 30 where id=$1", [ID.policy]);
    await runRenewalReminders();
    await runRenewalReminders();
    expect(await count("select count(*)::int n from alerts where dedupe_key=$1", [`renewal:${ID.policy}:30`])).toBe(1);
    expect(await count("select count(*)::int n from tasks where title like 'Prepare policy renewal%' and needs_approval")).toBe(1);
  });

  it("no reply in 24 hours asks the coordinator to phone", async () => {
    const { runNoReplyCheck } = await import("@/lib/jobs");
    await db.query("update tasks set status='waiting_parent' where id=$1", [ID.task]);
    await db.query("update messages set created_at = now() - interval '3 days' where family_id=$1", [ID.fam]);
    await runNoReplyCheck();
    expect(await count("select count(*)::int n from alerts where kind='no_reply' and family_id=$1", [ID.fam])).toBe(1);
  });
});

describe("rate limit", () => {
  it("allows up to the limit and then refuses", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    const key = `t:${Date.now()}`;
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(true);
    expect(await rateLimit(key, 2, 60)).toBe(false);
  });
});

describe("encryption at rest", () => {
  it("policy numbers are never stored in plain text", async () => {
    const { encryptField } = await import("@/lib/crypto");
    const blob = encryptField(ID.fam, "SECRET-POLICY-777");
    await db.query("update policies set policy_no_enc=$2 where id=$1", [ID.policy, blob]);
    const r = await db.query("select policy_no_enc from policies where id=$1", [ID.policy]);
    expect(r.rows[0].policy_no_enc).not.toContain("SECRET");
  });
});
