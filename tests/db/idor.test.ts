import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { ID } from "./helpers";

// The logic behind every server action, called with another family's ids under real RLS.
const url = inject("dbUrl");
let db: pg.Client;
const snapshot = async (sql: string, p: unknown[]) => JSON.stringify((await db.query(sql, p)).rows);

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

const as = async <T>(id: string, fn: () => Promise<T>) => {
  const { withContext } = await import("@/lib/db");
  return withContext({ kind: "user", id }, fn);
};

for (const [name, attacker] of [["outsider", ID.outsider], ["other owner", ID.owner2], ["other coordinator", ID.coord2]] as const) {
  describe(`${name} using family 1's ids`, () => {
    it("reads nothing through the store", async () => {
      const s = await import("@/lib/store");
      await as(attacker, async () => {
        expect(await s.getFamily(ID.fam)).toBeUndefined();
        expect(await s.getTask(ID.task)).toBeUndefined();
        expect(await s.documentsFor(ID.fam)).toEqual([]);
        expect(await s.policyFor(ID.fam)).toBeUndefined();
        expect(await s.claimsFor(ID.fam)).toEqual([]);
        expect(await s.approvalsFor(ID.fam)).toEqual([]);
        expect(await s.timeline(ID.fam)).toEqual([]);
        expect(await s.messagesFor(ID.fam)).toEqual([]);
        expect(await s.timeForTask(ID.task)).toEqual([]);
      });
    });
    it("gets nothing from the vault, ops or export", async () => {
      const v = await import("@/lib/vault");
      const o = await import("@/lib/ops");
      const p = await import("@/lib/privacy");
      const w = await import("@/lib/wa-outbound");
      await as(attacker, async () => {
        expect(await v.signedDocumentUrl(ID.doc)).toBeUndefined();
        expect(await v.documentForCheck(ID.doc)).toBeUndefined();
        expect(await o.notesFor(ID.task)).toEqual([]);
        expect(await p.exportData(ID.fam, attacker)).toBeNull();
        expect(await w.thread(ID.fam)).toEqual([]);
      });
    });
    it("changes nothing through any write", async () => {
      const s = await import("@/lib/store");
      const v = await import("@/lib/vault");
      const o = await import("@/lib/ops");
      const b = await import("@/lib/onboarding");
      const w = await import("@/lib/wa-outbound");
      const p = await import("@/lib/privacy");
      const before = await Promise.all([snapshot("select status, title from tasks where id=$1", [ID.task]), snapshot("select status from approvals where id=$1", [ID.approval]), snapshot("select count(*) from time_entries where task_id=$1", [ID.task]), snapshot("select checked_at from documents where id=$1", [ID.doc]), snapshot("select status from claims where id=$1", [ID.claim])]);
      await as(attacker, async () => {
        expect(await s.decideApproval(ID.approval, "approved")).toBeUndefined();
        expect(await s.undoApproval(ID.approval)).toBeUndefined();
        await expect(s.addTime(ID.task, 30, "x", attacker)).resolves.toBeUndefined();
        expect(await s.setTaskStatus(ID.task, "done", attacker)).toBeUndefined();
        expect(await v.saveCheck(ID.doc, { Insurer: "Hacked" }, "policy", attacker)).toBe(false);
        expect(await o.addNote(ID.task, "x", attacker)).toBe(false);
        expect((await o.startTimer(ID.task, attacker)).ok).toBe(false);
        expect(await o.addManualTime(ID.task, 30, "x", new Date().toISOString(), attacker)).toBe(false);
        expect(await b.requestApproval({ taskId: ID.task, summary: "x", amountInr: 1, payee: "x", feesInr: 0, when: "x", evidenceIds: [], userId: attacker })).toBe(false);
        expect(await b.confirmParentConsent(ID.parent, ["store", "read_records"], "x")).toBeNull();
        expect(await b.confirmOwnerConsent(ID.fam, ["store"])).toBe(false);
        expect(await b.pauseForCounsel(ID.parent, "x")).toBe(false);
        expect(await b.setClaimStatus(ID.claim, "settled")).toBe(false);
        expect(await b.addRequirement(ID.claim, "x")).toBe(false);
        await expect(p.withdrawParentConsent(ID.parent, "x")).resolves.toBe(false);
        await expect(v.withdrawDocumentConsent(ID.doc, "store")).rejects.toThrow();
        expect((await w.saveDraft(ID.fam, "hello", attacker)).ok).toBe(false);
        expect((await w.sendTemplateMessage(ID.fam, "doc_reminder", ["a", "b"], attacker)).ok).toBe(false);
      });
      const after = await Promise.all([snapshot("select status, title from tasks where id=$1", [ID.task]), snapshot("select status from approvals where id=$1", [ID.approval]), snapshot("select count(*) from time_entries where task_id=$1", [ID.task]), snapshot("select checked_at from documents where id=$1", [ID.doc]), snapshot("select status from claims where id=$1", [ID.claim])]);
      expect(after).toEqual(before);
    });
  });
}

describe("delete", () => {
  it("cannot be done for a family you do not own, even by an admin", async () => {
    const p = await import("@/lib/privacy");
    for (const id of [ID.outsider, ID.owner2, ID.coord, ID.admin]) {
      await expect(as(id, () => p.deleteFamily(ID.fam, id))).rejects.toThrow(/not allowed/);
      await expect(as(id, () => p.deleteFamily(ID.fam, ID.owner))).rejects.toThrow(/not allowed/);
    }
    expect((await db.query("select 1 from families where id=$1", [ID.fam])).rowCount).toBe(1);
  });
});
