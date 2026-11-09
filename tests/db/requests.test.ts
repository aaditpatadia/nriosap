import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  db = new pg.Client({ connectionString: url });
  await db.connect();
});

const make = async (over: Record<string, unknown>) => {
  const { createFamily } = await import("@/lib/onboarding");
  const r = await createFamily({ ownerId: ID.owner2, parentName: "Asha Rao", phone: `+1416${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, language: "English", city: "Pune", planUsd: 79, ownerPurposes: ["read_records", "store"], actorId: ID.owner2, ...over } as never);
  if (!r.ok) throw new Error(r.reason);
  return r.familyId;
};
const tasks = async (id: string) => (await db.query("select title, checklist from tasks where family_id = $1", [id])).rows as { title: string; checklist: string[] }[];

describe("a request with no parent involved", () => {
  it("is consented by the customer, needs no consent call, and reaches the desk", async () => {
    const id = await make({ forSelf: true, request: { category: "Property", text: "Pay the property tax on our flat in Pune." } });
    const p = (await db.query("select id, is_self, consent_status from parents where family_id = $1", [id])).rows[0];
    expect(p).toMatchObject({ is_self: true, consent_status: "granted" });
    const t = await tasks(id);
    expect(t.some((x) => x.title.startsWith("Consent call"))).toBe(false);
    expect(t.some((x) => x.title === "Property: Pay the property tax on our flat in Pune.")).toBe(true);
    const notes = (await db.query("select body from task_notes where family_id = $1", [id])).rows;
    expect(notes[0].body).toContain("property tax");
    const purposes = (await db.query("select purpose from consents where parent_id = $1 and subject = 'parent' and granted_at is not null order by purpose", [p.id])).rows.map((r) => r.purpose);
    expect(purposes).toEqual(["read_records", "store"]);
  });

  it("records consent only for what the customer agreed to", async () => {
    const id = await make({ forSelf: true, ownerPurposes: ["read_records", "store"], request: { category: "Something else", text: "Collect a parcel." } });
    const n = (await db.query("select count(*)::int n from consents c join parents p on p.id = c.parent_id where p.family_id = $1 and c.subject = 'parent' and c.purpose = 'share_named_third_party' and c.granted_at is not null", [id])).rows[0].n;
    expect(n).toBe(0);
  });

  it("flags a request that asks for advice so the desk routes it to a professional", async () => {
    const id = await make({ forSelf: true, request: { category: "Property", text: "Should I sell my flat? What tax should I pay on it?" } });
    const t = (await tasks(id)).find((x) => x.title.startsWith("Property:"))!;
    expect(t.checklist[0]).toContain("licensed professional");
  });
});

describe("a request for someone else", () => {
  it("still waits for that person's consent call", async () => {
    const id = await make({ forSelf: false, request: { category: "Looking after someone", text: "Arrange a monthly visit." } });
    expect((await db.query("select is_self, consent_status from parents where family_id = $1", [id])).rows[0]).toMatchObject({ is_self: false, consent_status: "pending" });
    const t = await tasks(id);
    expect(t.some((x) => x.title === "Consent call: Asha Rao")).toBe(true);
    expect(t.some((x) => x.title.startsWith("Looking after someone:"))).toBe(true);
  });
});
