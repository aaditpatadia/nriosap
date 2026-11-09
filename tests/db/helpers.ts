import pg from "pg";

export const ID = {
  owner: "aaaaaaaa-0000-4000-8000-000000000001",
  owner2: "aaaaaaaa-0000-4000-8000-000000000002",
  coord: "bbbbbbbb-0000-4000-8000-000000000001",
  coord2: "bbbbbbbb-0000-4000-8000-000000000002",
  admin: "cccccccc-0000-4000-8000-000000000001",
  outsider: "dddddddd-0000-4000-8000-000000000001",
  fam: "11111111-0000-4000-8000-000000000001",
  fam2: "11111111-0000-4000-8000-000000000002",
  parent: "22222222-0000-4000-8000-000000000001",
  parent2: "22222222-0000-4000-8000-000000000002",
  doc: "33333333-0000-4000-8000-000000000001",
  policy: "44444444-0000-4000-8000-000000000001",
  claim: "55555555-0000-4000-8000-000000000001",
  task: "66666666-0000-4000-8000-000000000001",
  task2: "66666666-0000-4000-8000-000000000002",
  approval: "77777777-0000-4000-8000-000000000001",
} as const;

/** Runs fn in a transaction as a Supabase role with the given JWT subject, then rolls back. */
export async function asRole<T>(url: string, role: "anon" | "authenticated", sub: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub, role }) : ""]);
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
}

export async function seedFixtures(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const users: [string, string, string][] = [
    [ID.owner, "owner", "o1@x.test"],
    [ID.owner2, "owner", "o2@x.test"],
    [ID.coord, "coordinator", "c1@x.test"],
    [ID.coord2, "coordinator", "c2@x.test"],
    [ID.admin, "admin", "a@x.test"],
    [ID.outsider, "owner", "out@x.test"],
  ];
  for (const [id, role, email] of users) {
    await c.query("insert into auth.users(id,email) values ($1,$2)", [id, email]);
    await c.query("update profiles set role=$2, name=$3 where id=$1", [id, role, email.split("@")[0]]);
  }
  await c.query("insert into families(id,owner_id,coordinator_id,name,plan_usd) values ($1,$2,$3,'One',79),($4,$5,$6,'Two',40)", [ID.fam, ID.owner, ID.coord, ID.fam2, ID.owner2, ID.coord2]);
  await c.query("insert into parents(id,family_id,name,phone,language,city,consent_status) values ($1,$2,'P1','+919800000001','Hindi','Pune','granted'),($3,$4,'P2','+919800000002','Marathi','Pune','granted')", [ID.parent, ID.fam, ID.parent2, ID.fam2]);
  await c.query("insert into consents(parent_id,purpose) values ($1,'store')", [ID.parent]);
  await c.query("insert into documents(id,family_id,kind,storage_path,title) values ($1,$2,'policy','x/y.pdf','Policy')", [ID.doc, ID.fam]);
  await c.query("insert into document_consents(document_id,family_id,purpose) values ($1,$2,'store')", [ID.doc, ID.fam]);
  await c.query("insert into policies(id,family_id,insurer,policy_no_enc) values ($1,$2,'I','enc')", [ID.policy, ID.fam]);
  await c.query("insert into claims(id,family_id,kind,status) values ($1,$2,'cashless','query')", [ID.claim, ID.fam]);
  await c.query("insert into claim_requirements(claim_id,family_id,label) values ($1,$2,'Bill')", [ID.claim, ID.fam]);
  await c.query("insert into tasks(id,family_id,kind,title,owner_id) values ($1,$2,'claim','T1',$3),($4,$5,'bill','T2',$6)", [ID.task, ID.fam, ID.coord, ID.task2, ID.fam2, ID.coord2]);
  await c.query("insert into time_entries(task_id,family_id,user_id,minutes) values ($1,$2,$3,30)", [ID.task, ID.fam, ID.coord]);
  await c.query("insert into approvals(id,family_id,task_id,summary) values ($1,$2,$3,'Pay')", [ID.approval, ID.fam, ID.task]);
  await c.query("insert into events(family_id,kind,actor,text) values ($1,'system','system','E')", [ID.fam]);
  await c.query("insert into messages(family_id,direction,body) values ($1,'in','hello')", [ID.fam]);
  await c.query("insert into audit_log(actor_id,action,entity,entity_id,family_id) values ($1,'view','family',$2::text,$2::uuid)", [ID.owner, ID.fam]);
  await c.query("insert into waitlist(email) values ('w@x.test')");
  await c.end();
}
