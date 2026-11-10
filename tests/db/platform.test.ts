import { beforeAll, describe, expect, inject, it } from "vitest";
import pg from "pg";
import { asRole, ID } from "./helpers";

const url = inject("dbUrl");
let db: pg.Client;
// Their own users, so joining a family here cannot change what the other test files expect.
const MEMBER = "eeeeeeee-0000-4000-8000-000000000001";
const JOINER = "eeeeeeee-0000-4000-8000-000000000002";
const JOINER2 = "eeeeeeee-0000-4000-8000-000000000003";

beforeAll(async () => {
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  process.env.APP_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-bytes";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unused";
  db = new pg.Client({ connectionString: url });
  await db.connect();
  for (const [i, u] of [MEMBER, JOINER, JOINER2].entries()) await db.query("insert into auth.users(id, email) values ($1,$2) on conflict do nothing", [u, `extra${i}@example.test`]);
});

const as = async <T>(id: string, fn: () => Promise<T>) => {
  const { withContext } = await import("@/lib/db");
  return withContext({ kind: "user", id }, fn);
};
const svc = () => import("@/lib/service-requests");
const fam = () => import("@/lib/family-members");

async function newRequest(text = "Please inspect my flat in Pune by next week.") {
  const { createServiceRequest } = await svc();
  const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: text, attachmentIds: [], userId: ID.owner, userName: "Owner" }));
  if (!r.ok) throw new Error(r.reason);
  return r.id;
}
const status = async (id: string) => (await db.query("select status from service_requests where id = $1", [id])).rows[0].status as string;
async function quoted() {
  const { createQuotation, quotesForRequest } = await svc();
  const id = await newRequest();
  const r = await as(ID.coord, () => createQuotation(id, { providerName: "Local plumber", providerFeeInr: 1000, coordinationFeeInr: 300, taxesInr: 54, notes: "", estimatedCompletion: "2027-01-10" }, ID.coord, "Coord"));
  expect(r).toEqual({ ok: true });
  const [q] = await as(ID.owner, () => quotesForRequest(id));
  return { id, q };
}
const decide = (approvalId: string, s: string) => as(ID.owner, async () => {
  const { tx } = await import("@/lib/db");
  return tx((t) => t.run("select decide_approval($1,$2)", [approvalId, s]));
});

describe("requests", () => {
  it("the owner creates one, with a reference, a desk task and a timeline", async () => {
    const id = await newRequest();
    const r = (await db.query("select * from service_requests where id = $1", [id])).rows[0];
    expect(r.ref).toMatch(/^ALY-\d+$/);
    expect(r).toMatchObject({ status: "submitted", location: "Pune", category: "Property and Assets", coordinator_id: ID.coord });
    expect((await db.query("select kind from tasks where id = $1", [r.task_id])).rows[0].kind).toBe("errand");
    expect((await db.query("select count(*)::int n from request_events where request_id = $1", [id])).rows[0].n).toBe(1);
  });

  it("people from other families cannot create one or read one", async () => {
    const { createServiceRequest, getRequest, requestsFor } = await svc();
    const id = await newRequest();
    for (const who of [ID.owner2, ID.outsider, ID.coord2]) {
      const r = await as(who, () => createServiceRequest({ familyId: ID.fam, description: "Please inspect my flat in Pune.", attachmentIds: [], userId: who, userName: "X" }));
      expect(r.ok).toBe(false);
      expect(await as(who, () => getRequest(id))).toBeUndefined();
      expect(await as(who, () => requestsFor(ID.fam))).toEqual([]);
    }
  });

  it("refuses unlawful work on the server, whatever the browser sends", async () => {
    const { createServiceRequest } = await svc();
    const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: "Please bribe the clerk so the file moves faster.", attachmentIds: [], userId: ID.owner, userName: "Owner" }));
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toContain("bribe");
  });

  it("flags requests that need a licensed professional", async () => {
    const id = await newRequest("Should I sell my flat in Pune this year?");
    const r = (await db.query("select needs_professional, task_id from service_requests where id = $1", [id])).rows[0];
    expect(r.needs_professional).toBe(true);
    expect((await db.query("select checklist from tasks where id = $1", [r.task_id])).rows[0].checklist[0]).toContain("licensed professional");
  });

  it("cannot attach a document from another family", async () => {
    const { createServiceRequest } = await svc();
    const other = (await db.query("insert into documents(family_id, kind, storage_path, title) values ($1,'report','x/y.pdf','Other') returning id", [ID.fam2])).rows[0].id;
    const r = await as(ID.owner, () => createServiceRequest({ familyId: ID.fam, description: "Please inspect my flat in Pune.", attachmentIds: [other], userId: ID.owner, userName: "Owner" }));
    expect(r.ok && (await db.query("select count(*)::int n from request_attachments where request_id = $1", [r.id])).rows[0].n).toBe(0);
  });

  it("completing needs a written report, and a coordinator of another family cannot touch it", async () => {
    const { setRequestStatus, saveFinalReport } = await svc();
    const id = await newRequest();
    expect((await as(ID.coord2, () => setRequestStatus(id, "in_progress", "", ID.coord2, "X"))).ok).toBe(false);
    expect((await as(ID.coord, () => setRequestStatus(id, "completed", "", ID.coord, "C"))).reason).toContain("report");
    await as(ID.coord, () => saveFinalReport(id, "Visited and photographed the flat.", ID.coord, "C"));
    expect((await as(ID.coord, () => setRequestStatus(id, "completed", "", ID.coord, "C"))).ok).toBe(true);
    expect(await status(id)).toBe("completed");
  });

  it("staff cannot mark a request approved on the customer's behalf", async () => {
    const { setRequestStatus } = await svc();
    const id = await newRequest();
    expect((await as(ID.coord, () => setRequestStatus(id, "approved", "", ID.coord, "C"))).ok).toBe(false);
  });

  it("internal notes are hidden from the customer", async () => {
    const { addRequestUpdate, requestEvents } = await svc();
    const id = await newRequest();
    await as(ID.coord, () => addRequestUpdate(id, "Internal only", false, ID.coord, "C"));
    await as(ID.coord, () => addRequestUpdate(id, "Visit booked", true, ID.coord, "C"));
    const owner = (await as(ID.owner, () => requestEvents(id))).map((e) => e.body);
    expect(owner).toContain("Visit booked");
    expect(owner).not.toContain("Internal only");
    expect((await as(ID.coord, () => requestEvents(id))).map((e) => e.body)).toContain("Internal only");
  });

  it("blocks advice in customer updates", async () => {
    const { addRequestUpdate } = await svc();
    const id = await newRequest();
    expect((await as(ID.coord, () => addRequestUpdate(id, "You should sell the flat now", true, ID.coord, "C"))).ok).toBe(false);
  });

  it("signed-in users cannot write requests directly", async () => {
    await expect(asRole(url, "authenticated", ID.owner, (c) => c.query("insert into service_requests(family_id, category, title, description) values ($1,'x','x','x')", [ID.fam]))).rejects.toThrow();
    await expect(asRole(url, "authenticated", ID.owner, (c) => c.query("update service_requests set status = 'completed'").then((r) => { if (!r.rowCount) throw new Error("no rows"); }))).rejects.toThrow();
  });
});

describe("quotations and approvals", () => {
  it("the server adds up the total and creates one approval", async () => {
    const { q, id } = await quoted();
    expect(q.totalInr).toBe(1354);
    expect((await db.query("select amount_inr from approvals where id = $1", [q.approvalId])).rows[0].amount_inr).toBe(1354);
    expect(await status(id)).toBe("awaiting_approval");
  });

  it("an approval moves the request, and undo moves it back", async () => {
    const { q, id } = await quoted();
    await decide(q.approvalId!, "approved");
    expect(await status(id)).toBe("approved");
    expect((await db.query("select status from quotations where id = $1", [q.id])).rows[0].status).toBe("approved");
    await as(ID.owner, async () => {
      const { tx } = await import("@/lib/db");
      return tx((t) => t.run("select undo_approval($1)", [q.approvalId]));
    });
    expect(await status(id)).toBe("awaiting_approval");
  });

  it("rejecting sends it back to the coordinator", async () => {
    const { q, id } = await quoted();
    await decide(q.approvalId!, "declined");
    expect(await status(id)).toBe("under_review");
  });

  it("only the owner can decide or ask for changes", async () => {
    const { requestQuoteChanges } = await svc();
    const { q, id } = await quoted();
    for (const who of [ID.coord, ID.owner2, ID.outsider]) {
      expect(await as(who, () => requestQuoteChanges(q.id, "Too much"))).toBe(false);
    }
    expect(await status(id)).toBe("awaiting_approval");
    expect(await as(ID.owner, () => requestQuoteChanges(q.id, "Please lower the fee"))).toBe(true);
    expect((await db.query("select status, change_note from quotations where id = $1", [q.id])).rows[0]).toEqual({ status: "changes_requested", change_note: "Please lower the fee" });
  });

  it("work cannot start while a quotation is waiting", async () => {
    const { setRequestStatus } = await svc();
    const { id } = await quoted();
    expect((await as(ID.coord, () => setRequestStatus(id, "in_progress", "", ID.coord, "C"))).ok).toBe(false);
  });

  it("a new quotation replaces the old one, so only one can be approved", async () => {
    const { createQuotation, quotesForRequest } = await svc();
    const { q, id } = await quoted();
    await as(ID.coord, () => createQuotation(id, { providerName: "", providerFeeInr: 800, coordinationFeeInr: 200, taxesInr: 0, notes: "", estimatedCompletion: "" }, ID.coord, "C"));
    const list = await as(ID.owner, () => quotesForRequest(id));
    expect(list.map((x) => x.status)).toEqual(["sent", "superseded"]);
    expect((await db.query("select status from approvals where id = $1", [q.approvalId])).rows[0].status).toBe("declined");
    expect(await status(id)).toBe("awaiting_approval");
  });
});

describe("family members", () => {
  let member: string;
  beforeAll(async () => {
    member = (await db.query("insert into family_members(family_id, user_id, name, relation, permissions, status) values ($1,$2,'Sibling','sibling',$3,'active') returning id", [ID.fam, MEMBER, ["view_requests"]])).rows[0].id;
  });

  it("see only what they were given", async () => {
    const { getRequest, familyAccess } = await svc();
    const id = await newRequest();
    expect(await as(MEMBER, () => getRequest(id))).toBeDefined();
    const a = await as(MEMBER, () => familyAccess(ID.fam));
    expect(a).toMatchObject({ member: true, owner: false, staff: false, canReadRequests: true, canCreate: false, canUpload: false, canSeeVault: false });
    const docs = await asRole(url, "authenticated", MEMBER, (c) => c.query("select id from documents where family_id = $1", [ID.fam]));
    expect(docs.rowCount).toBe(0);
    const other = await asRole(url, "authenticated", MEMBER, (c) => c.query("select id from families where id = $1", [ID.fam2]));
    expect(other.rowCount).toBe(0);
  });

  it("are written to the access log, and outsiders still cannot write to it", async () => {
    const write = (who: string) => as(who, async () => {
      const { tx } = await import("@/lib/db");
      return tx((t) => t.run("select audit_event('view_family','family',$1,$2)", [ID.fam, ID.fam]));
    });
    await expect(write(MEMBER)).resolves.toBeDefined();
    await expect(write(ID.outsider)).rejects.toThrow();
  });

  it("see one document only when it is shared with them, and lose it when unshared", async () => {
    const { shareDocument } = await fam();
    const doc = (await db.query("insert into documents(family_id, kind, storage_path, title) values ($1,'report','a/b.pdf','Shared') returning id", [ID.fam])).rows[0].id;
    const count = () => asRole(url, "authenticated", MEMBER, (c) => c.query("select id from documents where id = $1", [doc]).then((r) => r.rowCount));
    expect(await count()).toBe(0);
    expect(await as(MEMBER, () => shareDocument(doc, member, true, MEMBER))).toBeNull();
    expect(await as(ID.owner, () => shareDocument(doc, member, true, ID.owner))).toBe(ID.fam);
    expect(await count()).toBe(1);
    await as(ID.owner, () => shareDocument(doc, member, false, ID.owner));
    expect(await count()).toBe(0);
  });

  it("cannot approve, or manage other members", async () => {
    const { requestQuoteChanges } = await svc();
    const { setMemberPermissions, revokeMember } = await fam();
    const { q } = await quoted();
    expect(await as(MEMBER, () => requestQuoteChanges(q.id, "Change it"))).toBe(false);
    await expect(decide2(q.approvalId!, MEMBER)).rejects.toThrow();
    expect(await as(MEMBER, () => setMemberPermissions(member, ["view_documents"], MEMBER))).toBeNull();
    expect(await as(MEMBER, () => revokeMember(member, MEMBER))).toBeNull();
  });

  it("lose everything the moment they are revoked", async () => {
    const { getRequest } = await svc();
    const { revokeMember } = await fam();
    const id = await newRequest();
    expect(await as(ID.owner, () => revokeMember(member, ID.owner))).toBe(ID.fam);
    expect(await as(MEMBER, () => getRequest(id))).toBeUndefined();
  });
});

const decide2 = (approvalId: string, who: string) => as(who, async () => {
  const { tx } = await import("@/lib/db");
  return tx((t) => t.run("select decide_approval($1,'approved')", [approvalId]));
});

describe("invitations", () => {
  const link = async (email = "") => {
    const { addMember } = await fam();
    const r = await as(ID.owner, () => addMember({ familyId: ID.fam, name: "Invited", relation: "sibling", permissions: ["view_requests"], email, phone: null, language: "English", whatsappOk: true, isEmergency: false, invite: true, userId: ID.owner, base: "https://site.example" }));
    if (!r.ok || !r.inviteLink) throw new Error("no link");
    return r.inviteLink.split("/").pop()!;
  };

  it("only the owner can invite", async () => {
    const { addMember } = await fam();
    const r = await as(ID.coord, () => addMember({ familyId: ID.fam, name: "X", relation: "sibling", permissions: [], email: "", phone: null, language: "English", whatsappOk: true, isEmergency: false, invite: true, userId: ID.coord, base: "" }));
    expect(r.ok).toBe(false);
  });

  it("stores only a hash of the link", async () => {
    const token = await link();
    expect((await db.query("select count(*)::int n from family_members where invite_token_hash = $1", [token])).rows[0].n).toBe(0);
  });

  it("works once", async () => {
    const { acceptInvite } = await fam();
    const token = await link();
    expect(await acceptInvite(token, { id: JOINER, email: "x@example.test" })).toEqual({ ok: true, familyId: ID.fam });
    expect((await acceptInvite(token, { id: JOINER2, email: "y@example.test" })).ok).toBe(false);
  });

  it("must match the email it was sent to, and cannot be used by the owner", async () => {
    const { acceptInvite } = await fam();
    const token = await link("right@example.test");
    expect((await acceptInvite(token, { id: JOINER2, email: "wrong@example.test" })).ok).toBe(false);
    expect((await acceptInvite(await link(), { id: ID.owner, email: "o@example.test" })).ok).toBe(false);
  });
});

describe("properties", () => {
  it("only the owner or their coordinator can add one, and other families cannot read it", async () => {
    const { addProperty, propertiesFor } = await svc();
    const p = { name: "Pune flat", kind: "flat", address: "", city: "Pune", tenantName: "", notes: "" };
    expect(await as(ID.owner2, () => addProperty(ID.fam, p, ID.owner2))).toBe(false);
    expect(await as(ID.owner, () => addProperty(ID.fam, p, ID.owner))).toBe(true);
    expect((await as(ID.owner, () => propertiesFor(ID.fam))).length).toBeGreaterThan(0);
    expect(await as(ID.coord2, () => propertiesFor(ID.fam))).toEqual([]);
  });
});
