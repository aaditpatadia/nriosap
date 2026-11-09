import { describe, expect, inject, it } from "vitest";
import { asRole, ID } from "./helpers";

const url = inject("dbUrl");

const FAMILY_TABLES = ["families", "parents", "documents", "document_consents", "policies", "claims", "claim_requirements", "tasks", "time_entries", "approvals", "events", "messages"];
const ALL_TABLES = [...FAMILY_TABLES, "consents", "audit_log", "waitlist"];

async function count(sub: string | null, table: string, role: "anon" | "authenticated" = "authenticated") {
  return asRole(url, role, sub, async (c) => Number((await c.query(`select count(*)::int n from ${table}`)).rows[0].n));
}
async function denied(sub: string, sql: string, params: unknown[] = []) {
  return asRole(url, "authenticated", sub, async (c) => {
    try {
      const r = await c.query(sql, params);
      return r.rowCount === 0 ? "no-rows" : "ALLOWED";
    } catch (e) {
      return (e as Error).message;
    }
  });
}

describe("outsider sees nothing", () => {
  for (const t of ALL_TABLES) {
    it(`signed-in outsider reads 0 rows from ${t}`, async () => expect(await count(ID.outsider, t)).toBe(0));
    it(`anonymous reads 0 rows from ${t}`, async () => expect(await count(null, t, "anon")).toBe(0));
  }
  it("outsider sees only their own profile", async () => expect(await count(ID.outsider, "profiles")).toBe(1));
  it("anonymous sees no profiles", async () => expect(await count(null, "profiles", "anon")).toBe(0));
});

describe("owner sees only their family", () => {
  for (const t of FAMILY_TABLES) {
    it(`owner reads exactly their rows in ${t}`, async () => {
      const n = await asRole(url, "authenticated", ID.owner, async (c) => {
        const col = t === "families" ? "id" : "family_id";
        const mine = (await c.query(`select count(*)::int n from ${t} where ${col} = $1`, [ID.fam])).rows[0].n;
        const theirs = (await c.query(`select count(*)::int n from ${t} where ${col} = $1`, [ID.fam2])).rows[0].n;
        return { mine, theirs };
      });
      expect(n.theirs).toBe(0);
      if (["families", "parents", "documents", "document_consents", "policies", "claims", "claim_requirements", "tasks", "time_entries", "approvals", "events", "messages"].includes(t)) expect(n.mine).toBeGreaterThan(0);
    });
  }
  it("sees own coordinator's profile but not another owner's", async () => {
    await asRole(url, "authenticated", ID.owner, async (c) => {
      expect((await c.query("select id from profiles where id=$1", [ID.coord])).rowCount).toBe(1);
      expect((await c.query("select id from profiles where id=$1", [ID.owner2])).rowCount).toBe(0);
      expect((await c.query("select id from profiles where id=$1", [ID.coord2])).rowCount).toBe(0);
    });
  });
  it("reads the audit log for their family only", async () => expect(await count(ID.owner, "audit_log")).toBeGreaterThan(0));
  it("cannot read the waitlist", async () => expect(await count(ID.owner, "waitlist")).toBe(0));
});

describe("coordinator sees only assigned families", () => {
  for (const t of FAMILY_TABLES) {
    it(`assigned coordinator is walled off from the other family in ${t}`, async () => {
      const r = await asRole(url, "authenticated", ID.coord, async (c) => {
        const col = t === "families" ? "id" : "family_id";
        return (await c.query(`select count(*)::int n from ${t} where ${col} = $1`, [ID.fam2])).rows[0].n;
      });
      expect(r).toBe(0);
    });
  }
  it("coordinator 2 cannot see family 1 tasks", async () => {
    await asRole(url, "authenticated", ID.coord2, async (c) => expect((await c.query("select 1 from tasks where id=$1", [ID.task])).rowCount).toBe(0));
  });
});

describe("admin sees everything", () => {
  for (const t of ALL_TABLES) {
    it(`admin reads ${t}`, async () => expect(await count(ID.admin, t)).toBeGreaterThan(0));
  }
});

describe("write rules", () => {
  it("owner cannot update tasks", async () => expect(await denied(ID.owner, "update tasks set title='x' where id=$1", [ID.task])).toBe("no-rows"));
  it("owner cannot log time", async () => expect(await denied(ID.owner, "insert into time_entries(task_id,family_id,user_id,minutes) values ($1,$2,$3,10)", [ID.task, ID.fam, ID.owner])).toContain("row-level security"));
  it("owner cannot update an approval directly", async () => expect(await denied(ID.owner, "update approvals set status='approved' where id=$1", [ID.approval])).toBe("no-rows"));
  it("coordinator cannot update an approval directly", async () => expect(await denied(ID.coord, "update approvals set status='approved' where id=$1", [ID.approval])).toBe("no-rows"));
  it("coordinator cannot decide an approval", async () => expect(await denied(ID.coord, "select decide_approval($1,'approved')", [ID.approval])).toContain("not allowed"));
  it("admin cannot decide an approval: money needs the owner", async () => expect(await denied(ID.admin, "select decide_approval($1,'approved')", [ID.approval])).toContain("not allowed"));
  it("another owner cannot decide an approval", async () => expect(await denied(ID.owner2, "select decide_approval($1,'approved')", [ID.approval])).toContain("not allowed"));
  it("coordinator cannot write to an unassigned family", async () => expect(await denied(ID.coord, "update tasks set title='x' where id=$1", [ID.task2])).toBe("no-rows"));
  it("coordinator cannot log time as someone else", async () => expect(await denied(ID.coord, "insert into time_entries(task_id,family_id,user_id,minutes) values ($1,$2,$3,10)", [ID.task, ID.fam, ID.coord2])).toContain("row-level security"));
  it("nobody can raise their own role", async () => {
    expect(await denied(ID.owner, "update profiles set role='admin' where id=$1", [ID.owner])).toBe("no-rows");
    expect(await denied(ID.outsider, "update profiles set role='admin' where id=$1", [ID.outsider])).toBe("no-rows");
  });
  it("outsider cannot insert a family, waitlist row or audit row", async () => {
    expect(await denied(ID.outsider, "insert into families(owner_id,name,plan_usd) values ($1,'X',79)", [ID.outsider])).toContain("row-level security");
    expect(await denied(ID.outsider, "insert into waitlist(email) values ('a@b.c')")).toContain("row-level security");
    expect(await denied(ID.outsider, "insert into audit_log(actor_id,action,entity,entity_id) values ($1,'x','y','z')", [ID.outsider])).toContain("row-level security");
  });
  it("audit_event refuses a family you cannot see", async () => expect(await denied(ID.outsider, "select audit_event('x','family','z',$1)", [ID.fam])).toContain("not allowed"));
  it("audit log cannot be changed, even by the owner role of the table", async () => {
    await asRole(url, "authenticated", ID.admin, async (c) => {
      expect((await c.query("update audit_log set action='y'").catch((e) => ({ rowCount: e.message }))).rowCount).toBe(0);
    });
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await expect(c.query("update audit_log set action='y'")).rejects.toThrow(/append only/);
    await c.end();
  });
});

describe("approval decide and undo", () => {
  it("owner approves and can undo inside the window, and it is persisted", async () => {
    await asRole(url, "authenticated", ID.owner, async (c) => {
      const a = (await c.query("select * from decide_approval($1,'approved')", [ID.approval])).rows[0];
      expect(a.status).toBe("approved");
      expect(new Date(a.undo_until).getTime() - new Date(a.decided_at).getTime()).toBe(300000);
      await expect(c.query("select decide_approval($1,'declined')", [ID.approval])).rejects.toThrow(/already decided/);
    });
    await asRole(url, "authenticated", ID.owner, async (c) => {
      await c.query("select decide_approval($1,'approved')", [ID.approval]);
      const u = (await c.query("select * from undo_approval($1)", [ID.approval])).rows[0];
      expect(u.status).toBe("pending");
      expect(u.undo_until).toBeNull();
    });
  });
  it("undo is refused once the window has passed", async () => {
    const pg = (await import("pg")).default;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query("update approvals set status='approved', undo_until=now()-interval '1 second' where id=$1", [ID.approval]);
    await asRole(url, "authenticated", ID.owner, async (c) => {
      await expect(c.query("select undo_approval($1)", [ID.approval])).rejects.toThrow(/undo window/);
    });
    await admin.query("update approvals set status='pending', undo_until=null where id=$1", [ID.approval]);
    await admin.end();
  });
});

describe("later tables stay walled off", () => {
  const LATER = ["timers", "task_notes", "escalations", "webhook_unmatched"];
  for (const t of LATER) {
    it(`outsider and owner read 0 rows from ${t}`, async () => {
      expect(await count(ID.outsider, t)).toBe(0);
      expect(await count(ID.owner, t)).toBe(0);
      expect(await count(null, t, "anon")).toBe(0);
    });
  }
  it("templates and partner contacts are staff only", async () => {
    expect(await count(ID.outsider, "task_templates")).toBe(0);
    expect(await count(ID.owner, "partner_contacts")).toBe(0);
    expect(await count(ID.coord, "task_templates")).toBeGreaterThan(0);
  });
  it("an owner cannot start a timer or write a note", async () => {
    expect(await denied(ID.owner, "insert into timers(user_id,task_id,family_id) values ($1,$2,$3)", [ID.owner, ID.task, ID.fam])).toContain("row-level security");
    expect(await denied(ID.owner, "insert into task_notes(task_id,family_id,author_id,body) values ($1,$2,$3,'x')", [ID.task, ID.fam, ID.owner])).toContain("row-level security");
  });
  it("a coordinator cannot start a timer on an unassigned family", async () => {
    expect(await denied(ID.coord, "insert into timers(user_id,task_id,family_id) values ($1,$2,$3)", [ID.coord, ID.task2, ID.fam2])).toContain("row-level security");
  });
  it("owners cannot record a parent's consent, or anyone else's", async () => {
    expect(await denied(ID.owner, "select confirm_parent_consent($1,'{store}','x')", [ID.parent])).toContain("not allowed");
    expect(await denied(ID.outsider, "select confirm_owner_consent($1,'{store}')", [ID.fam])).toContain("not allowed");
    expect(await denied(ID.coord2, "select confirm_parent_consent($1,'{store}','x')", [ID.parent])).toContain("not allowed");
  });
  it("nobody can edit a consent row directly", async () => {
    expect(await denied(ID.owner, "update consents set withdrawn_at = null")).toBe("no-rows");
    expect(await denied(ID.coord, "update consents set granted_at = now()")).toBe("no-rows");
  });
  it("document consent can only be withdrawn for a family you can see", async () => {
    expect(await denied(ID.outsider, "select withdraw_document_consent($1,'store')", [ID.doc])).toContain("not allowed");
  });
  it("an owner cannot read or forge an approval's execution", async () => {
    expect(await denied(ID.owner, "update approvals set executed_at = now()")).toBe("no-rows");
  });
});

describe("new sign-ups", () => {
  it("always start as an owner, whatever metadata they send", async () => {
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    const r = await c.query(`insert into auth.users(email, raw_user_meta_data) values ('evil@x.test', '{"role":"admin","name":"Evil"}') returning id`);
    const p = await c.query("select role,name from profiles where id=$1", [r.rows[0].id]);
    expect(p.rows[0]).toEqual({ role: "owner", name: "Evil" });
    await c.end();
  });
});
