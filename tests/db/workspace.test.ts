import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { asRole, ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;
const VIEWER = "ffffffff-0000-4000-8000-000000000001";
const LAPSED = "ffffffff-0000-4000-8000-000000000002";
const LIMITED = "ffffffff-0000-4000-8000-000000000003";
const LIMITED_FAM = "99999999-0000-4000-8000-000000000001";
const LIMITED_PARENT = "99999999-0000-4000-8000-000000000002";

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  db = new pg.Client({ connectionString: url });
  await db.connect();
  for (const [i, u] of [VIEWER, LAPSED, LIMITED].entries()) await db.query("insert into auth.users(id, email) values ($1,$2) on conflict do nothing", [u, `ws${i}@example.test`]);
  await db.query("insert into family_members(family_id, user_id, name, relation, permissions, status, role) values ($1,$2,'Viewer','sibling','{view_requests}','active','viewer')", [ID.fam, VIEWER]);
  await db.query("insert into family_members(family_id, user_id, name, relation, permissions, status, role, access_expires_at) values ($1,$2,'Lapsed','relative','{view_requests,view_bills}','active','temporary', now() - interval '1 day')", [ID.fam, LAPSED]);
  await db.query("insert into families(id,owner_id,coordinator_id,name,plan_usd) values ($1,$2,$3,'Limited',40)", [LIMITED_FAM, LIMITED, ID.coord]);
  await db.query("insert into parents(id,family_id,name,phone,language,city,consent_status) values ($1,$2,'L','+919800000099','Hindi','Pune','granted')", [LIMITED_PARENT, LIMITED_FAM]);
});

const as = async <T>(id: string, fn: () => Promise<T>) => {
  const { withContext } = await import("@/lib/db");
  return withContext({ kind: "user", id }, fn);
};
const ws = () => import("@/lib/workspace");
const ops = () => import("@/lib/ops-console");
const svc = () => import("@/lib/service-requests");
const bill = { title: "Society dues", kind: "society" as const, amountInr: 4000, dueOn: "2026-12-01", propertyId: null, person: null, recurrence: "monthly" as const, documentId: null, reminderDays: [7], reminderOn: null, notes: null };

describe("bills and renewals", () => {
  it("are added by the owner and hidden from outsiders and plain viewers", async () => {
    const { addDeadline, deadlinesFor } = await ws();
    expect(await as(ID.owner, () => addDeadline(ID.fam, bill, ID.owner))).toBe(true);
    expect((await as(ID.owner, () => deadlinesFor(ID.fam))).some((d) => d.title === "Society dues")).toBe(true);
    expect(await as(ID.outsider, () => deadlinesFor(ID.fam))).toEqual([]);
    expect(await as(VIEWER, () => deadlinesFor(ID.fam))).toEqual([]);
  });
  it("cannot be added to someone else's account", async () => {
    const { addDeadline } = await ws();
    expect(await as(ID.owner2, () => addDeadline(ID.fam, bill, ID.owner2))).toBe(false);
    expect(await as(VIEWER, () => addDeadline(ID.fam, bill, VIEWER))).toBe(false);
  });
  it("cannot link a property from another account", async () => {
    const { addDeadline } = await ws();
    await db.query("insert into properties(id, family_id, name, kind) values ('12121212-0000-4000-8000-000000000001',$1,'Other','flat') on conflict do nothing", [ID.fam2]);
    expect(await as(ID.owner, () => addDeadline(ID.fam, { ...bill, propertyId: "12121212-0000-4000-8000-000000000001" }, ID.owner))).toBe(false);
  });
  it("roll forward when handled, and handled is not paid", async () => {
    const { addDeadline, deadlinesFor, setDeadlineStatus } = await ws();
    await as(ID.owner, () => addDeadline(ID.fam, { ...bill, title: "Water", dueOn: "2026-11-30" }, ID.owner));
    const first = (await as(ID.owner, () => deadlinesFor(ID.fam))).find((d) => d.title === "Water")!;
    await as(ID.owner, () => setDeadlineStatus(first.id, "handled", ID.owner));
    const rows = (await as(ID.owner, () => deadlinesFor(ID.fam))).filter((d) => d.title === "Water");
    expect(rows.map((d) => [d.dueOn, d.status])).toEqual(expect.arrayContaining([["2026-11-30", "handled"], ["2026-12-30", "upcoming"]]));
  });
  it("cannot be written directly by a signed-in user", async () => {
    await expect(asRole(url, "authenticated", ID.owner, (c) => c.query("insert into deadlines(family_id,title,kind,due_on) values ($1,'x','other','2026-12-01')", [ID.fam]))).rejects.toThrow();
  });
});

describe("time-limited family access", () => {
  it("ends when the date passes", async () => {
    const { familyAccess } = await svc();
    const a = await as(LAPSED, () => familyAccess(ID.fam));
    expect(a).toMatchObject({ member: false, canReadRequests: false, canSeeBills: false });
    expect((await as(VIEWER, () => familyAccess(ID.fam))).member).toBe(true);
  });
});

describe("plan limits are enforced on the server", () => {
  it("stops a Lite account at three new requests in a month", async () => {
    const { createServiceRequest } = await svc();
    const make = (n: number) => as(LIMITED, () => createServiceRequest({ familyId: LIMITED_FAM, description: `Please inspect my flat in Pune, number ${n}, by next week.`, attachmentIds: [], userId: LIMITED, userName: "L" }));
    for (const n of [1, 2, 3]) expect((await make(n)).ok).toBe(true);
    const fourth = await make(4);
    expect(fourth).toMatchObject({ ok: false });
    expect((fourth as { reason: string }).reason).toMatch(/3 new requests/);
  });
  it("blocks a visit a plan does not include, until a quotation is approved", async () => {
    const { scheduleVisit } = await ops();
    const r = await as(ID.coord, () => scheduleVisit({ familyId: ID.fam, propertyId: null, requestId: null, purpose: "Inspect", scheduledAt: "2026-12-01T10:00:00+05:30" }, ID.coord, "C"));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/approved quotation/);
  });
  it("lets a coordinator schedule only for assigned families", async () => {
    const { scheduleVisit } = await ops();
    expect((await as(ID.coord2, () => scheduleVisit({ familyId: ID.fam, propertyId: null, requestId: null, purpose: "Inspect", scheduledAt: "2026-12-01T10:00:00+05:30" }, ID.coord2, "C"))).reason).toMatch(/not on your list/);
  });
});

describe("service partners", () => {
  it("are visible to staff only", async () => {
    const { addPartner, partners } = await ops();
    await as(ID.admin, () => addPartner({ name: "Ravi Plumbing", category: "Plumbing", city: "Pune", phone: "", email: "", availability: "", notes: "" }, ID.admin));
    expect((await as(ID.coord, () => partners())).some((p) => p.name === "Ravi Plumbing")).toBe(true);
    expect(await as(ID.owner, () => partners())).toEqual([]);
  });
  it("cannot be approved without the checks, and a check records who did it", async () => {
    const { movePartner, partners } = await ops();
    const p = (await as(ID.admin, () => partners())).find((x) => x.name === "Ravi Plumbing")!;
    expect((await as(ID.admin, () => movePartner(p.id, "approved", ID.admin))).ok).toBe(false);
    expect((await as(ID.admin, () => movePartner(p.id, "references_checked", ID.admin))).ok).toBe(false);
    expect((await as(ID.admin, () => movePartner(p.id, "identity_checked", ID.admin))).ok).toBe(true);
    expect((await as(ID.admin, () => movePartner(p.id, "references_checked", ID.admin))).ok).toBe(true);
    expect((await as(ID.admin, () => movePartner(p.id, "approved", ID.admin))).ok).toBe(true);
    const row = (await db.query("select identity_checked_by, approved_by from service_partners where id = $1", [p.id])).rows[0];
    expect(row).toEqual({ identity_checked_by: ID.admin, approved_by: ID.admin });
  });
  it("must be approved before a request can use them", async () => {
    const { addPartner, partners } = await ops();
    const { assignRequest, createServiceRequest } = await svc();
    await as(ID.admin, () => addPartner({ name: "Unknown Co", category: "Painting", city: "", phone: "", email: "", availability: "", notes: "" }, ID.admin));
    const p = (await as(ID.admin, () => partners())).find((x) => x.name === "Unknown Co")!;
    const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: "Please paint the flat in Pune by next week.", attachmentIds: [], userId: ID.owner, userName: "O" }));
    expect(r.ok).toBe(true);
    const out = await as(ID.coord, () => assignRequest((r as { id: string }).id, { partnerId: p.id }, ID.coord, "C"));
    expect(out).toMatchObject({ ok: false });
  });
});

describe("the assistant sees only what the person may see", () => {
  it("gives a plain viewer no documents and no bills", async () => {
    const { assistantFacts } = await ws();
    const { familyAccess } = await svc();
    const facts = await as(VIEWER, async () => assistantFacts(ID.fam, await familyAccess(ID.fam)));
    expect(facts.documents).toEqual([]);
    expect(facts.deadlines).toEqual([]);
    expect(facts.approvals).toEqual([]);
  });
  it("gives an outsider nothing", async () => {
    const { assistantFacts } = await ws();
    const { familyAccess } = await svc();
    const facts = await as(ID.outsider, async () => assistantFacts(ID.fam, await familyAccess(ID.fam)));
    expect([facts.requests, facts.documents, facts.properties, facts.visits]).toEqual([[], [], [], []]);
  });
});

describe("visits and reports", () => {
  it("an outsider cannot read another family's visits", async () => {
    await db.query("insert into visits(family_id, purpose, scheduled_at) values ($1,'Check flat', now())", [ID.fam]);
    const { visitsFor } = await ws();
    expect((await as(ID.owner, () => visitsFor(ID.fam))).length).toBeGreaterThan(0);
    expect(await as(ID.owner2, () => visitsFor(ID.fam))).toEqual([]);
  });
  it("saved views belong to one person", async () => {
    const { saveFilter, savedFilters } = await ops();
    await saveFilter(ID.coord, "Mine", "sla=past");
    expect((await as(ID.coord, () => savedFilters(ID.coord))).map((f) => f.name)).toContain("Mine");
    expect(await as(ID.coord2, () => savedFilters(ID.coord))).toEqual([]);
  });
});

describe("payment records", () => {
  it("need an approved quotation, and cannot be confirmed without proof", async () => {
    const { recordPayment, settlePayment, paymentsForRequest } = await import("@/lib/payment-records");
    const { createServiceRequest, createQuotation } = await svc();
    const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: "Please fix the tap in the flat in Pune by next week.", attachmentIds: [], userId: ID.owner, userName: "O" }));
    const requestId = (r as { id: string }).id;
    expect((await as(ID.coord, () => recordPayment(requestId, { method: "provider_link", linkUrl: "https://pay.example/x", note: "" }, ID.coord))).ok).toBe(false);
    await as(ID.coord, () => createQuotation(requestId, { providerName: "Plumber", providerFeeInr: 500, coordinationFeeInr: 0, taxesInr: 0, notes: "" }, ID.coord, "C"));
    await db.query("update quotations set status = 'approved' where request_id = $1", [requestId]);
    expect((await as(ID.coord, () => recordPayment(requestId, { method: "provider_link", linkUrl: "https://pay.example/x", note: "" }, ID.coord))).ok).toBe(true);
    const [p] = await as(ID.owner, () => paymentsForRequest(requestId));
    expect(p.status).toBe("pending");
    expect((await as(ID.coord, () => settlePayment(p.id, "confirmed", { reference: "", receiptDocumentId: null }, ID.coord))).ok).toBe(false);
    await expect(db.query("update payments set status = 'confirmed' where id = $1", [p.id])).rejects.toThrow();
    expect((await as(ID.coord, () => settlePayment(p.id, "confirmed", { reference: "UTR1", receiptDocumentId: null }, ID.coord))).ok).toBe(true);
    expect(await as(ID.owner2, () => paymentsForRequest(requestId))).toEqual([]);
    expect((await as(ID.coord2, () => settlePayment(p.id, "failed", { reference: "", receiptDocumentId: null }, ID.coord2))).ok).toBe(false);
  });
  it("accept only https links without credentials", async () => {
    const { safePaymentLink } = await import("@/lib/payment-records");
    expect(safePaymentLink("https://pay.example/x")).toBe("https://pay.example/x");
    for (const bad of ["http://pay.example", "javascript:alert(1)", "https://user:pw@pay.example", "not a link"]) expect(safePaymentLink(bad)).toBeNull();
  });
});

describe("onboarding", () => {
  it("a second press returns the same account instead of a duplicate", async () => {
    const { createOwnFamily: createFamily } = await import("@/lib/onboarding");
    const USER = "ffffffff-0000-4000-8000-000000000009";
    await db.query("insert into auth.users(id, email) values ($1,'twice@example.test') on conflict do nothing", [USER]);
    const make = () => createFamily({ ownerId: USER, parentName: "Twice", forSelf: true, phone: null, language: "English", city: "Pune", planUsd: 79, ownerPurposes: ["read_records", "store"], actorId: USER });
    const [a, b] = [await make(), await make()];
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
    expect((await db.query("select count(*)::int n from families where owner_id = $1", [USER])).rows[0].n).toBe(1);
    const consents = (await db.query("select subject, purpose, granted_at is not null as given from consents c join parents p on p.id = c.parent_id join families f on f.id = p.family_id where f.owner_id = $1 order by subject, purpose", [USER])).rows;
    expect(consents).toHaveLength(8);
    expect(consents.filter((c) => c.given).map((c) => `${c.subject}:${c.purpose}`).sort()).toEqual(["owner:read_records", "owner:store", "parent:read_records", "parent:store"]);
  });
});
