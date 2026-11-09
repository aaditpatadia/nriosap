// Seeds three fictional families. Refuses to run unless DEMO_MODE=1.
// Usage: node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { encryptField } from "../lib/crypto.ts";

export const FAM = {
  shah: "f0000000-0000-4000-8000-000000000001",
  kulkarni: "f0000000-0000-4000-8000-000000000002",
  mehta: "f0000000-0000-4000-8000-000000000003",
};

const DAY = "interval '1 day'";
const at = (d) => `now() + ${d} * ${DAY}`;

export async function ensureUser(admin, email, name, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (!error) return data.user.id;
  if (!/already|exists/i.test(error.message)) throw error;
  const list = await admin.auth.admin.listUsers({ perPage: 1000 });
  return list.data.users.find((u) => u.email === email).id;
}

export async function seedDemo() {
  if (process.env.DEMO_MODE !== "1") throw new Error("DEMO_MODE is not 1. The demo family is only seeded when the flag is on.");
  const pw = process.env.SEED_STAFF_PASSWORD;
  if (!pw) throw new Error("SEED_STAFF_PASSWORD is not set");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "disable" ? undefined : { rejectUnauthorized: false } });
  await c.connect();

  const already = await c.query("select 1 from families where id = $1", [FAM.shah]);
  if (already.rowCount) {
    await c.end();
    console.log("demo data already present");
    return;
  }

  const person = async (email, name, role, city, country, password) => {
    const id = await ensureUser(admin, email, name, password);
    await c.query("update profiles set role=$2, name=$3, city=$4, country=$5, email=$6 where id=$1", [id, role, name, city, country, email]);
    return id;
  };
  const D = "demo.gharsaath.test";
  const meera = await person(`meera@${D}`, "Meera Joshi", "coordinator", "Rajkot", "India", pw);
  const rohan = await person(`rohan@${D}`, "Rohan Desai", "coordinator", "Pune", "India", pw);
  const kavita = await person(`kavita@${D}`, "Kavita Rao", "coordinator", "Mumbai", "India", pw);
  await person(`admin@${D}`, "Aadit", "admin", "Mumbai", "India", pw);
  const priya = await person(process.env.DEMO_OWNER_EMAIL || `priya@${D}`, "Priya Shah", "owner", "Toronto", "Canada");
  const mihir = await person(`mihir@${D}`, "Mihir Kulkarni", "owner", "London", "United Kingdom");
  const neha = await person(`neha@${D}`, "Neha Mehta", "owner", "Singapore", "Singapore");
  await person(`outsider@${D}`, "Olivia Outsider", "owner", "Berlin", "Germany");

  const fam = async (id, name, owner, coord, plan, days) => c.query(`insert into families(id,name,owner_id,coordinator_id,plan_usd,started_at) values ($1,$2,$3,$4,$5,${at(-days)})`, [id, name, owner, coord, plan]);
  await fam(FAM.shah, "Shah family", priya, meera, 79, 40);
  await fam(FAM.kulkarni, "Kulkarni family", mihir, rohan, 79, 25);
  await fam(FAM.mehta, "Mehta family", neha, kavita, 40, 12);

  const parent = async (fid, name, phone, language, city) => (await c.query("insert into parents(family_id,name,phone,language,city,consent_status) values ($1,$2,$3,$4,$5,'granted') returning id", [fid, name, phone, language, city])).rows[0].id;
  const pShah = await parent(FAM.shah, "Kusum Shah", "+919800000001", "Gujarati", "Rajkot");
  const pKul = await parent(FAM.kulkarni, "Sulabha Kulkarni", "+919800000002", "Marathi", "Pune");
  const pMeh = await parent(FAM.mehta, "Harish Mehta", "+919800000003", "Hindi", "Mumbai");
  for (const p of [pShah, pKul, pMeh]) {
    for (const purpose of ["read_records", "store", "act_on_named_task"]) await c.query("insert into consents(parent_id,purpose,evidence_ref) values ($1,$2,'demo seed')", [p, purpose]);
  }

  const doc = async (fid, kind, title, days, confidence, fields, checkedBy, purposes) => {
    const enc = encryptField(fid, JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence }]))));
    const path = `${fid}/demo-${randomUUID()}.pdf`;
    await admin.storage.from("vault").upload(path, Buffer.from(`%PDF-1.4\nFictional demo document: ${title}\n%%EOF\n`), { contentType: "application/pdf" });
    const r = await c.query(`insert into documents(family_id,kind,title,storage_path,extracted_enc,confidence,checked_by,checked_at,created_at,source,extraction_status) values ($1,$2,$3,$4,$5,$6,$7,${checkedBy ? "now()" : "null"},${at(-days)},'seed','done') returning id`, [fid, kind, title, path, enc, confidence, checkedBy]);
    for (const p of purposes) await c.query("insert into document_consents(document_id,family_id,purpose,granted_by) values ($1,$2,$3,null)", [r.rows[0].id, fid, p]);
    return r.rows[0].id;
  };
  const base = ["read_records", "store"];
  const d1 = await doc(FAM.shah, "policy", "Health policy schedule.pdf", 39, 0.94, { Insurer: "Demo Insurer A", "Sum insured": "Rs 5,00,000", Renewal: "14 Dec 2026" }, meera, base);
  const d2 = await doc(FAM.shah, "discharge_summary", "Discharge summary (unsigned).jpg", 5, 0.82, { Hospital: "Demo City Hospital", Admitted: "28 Oct", Discharged: "2 Nov" }, null, [...base, "share_named_third_party"]);
  const d3 = await doc(FAM.shah, "bill", "Electricity bill November.pdf", 2, 0.91, { Payee: "Demo Power Co", Amount: "Rs 4,200", Due: "15 Nov" }, meera, base);
  await doc(FAM.kulkarni, "policy", "Policy copy.pdf", 24, 0.95, { Insurer: "Demo Insurer B", "Sum insured": "Rs 10,00,000" }, rohan, base);
  await doc(FAM.mehta, "report", "Cardiology report.jpg", 3, 0.6, {}, null, base);

  const pol = async (fid, insurer, no, sum, days) => c.query(`insert into policies(family_id,insurer,policy_no_enc,sum_insured_inr,renewal_date) values ($1,$2,$3,$4,(${at(days)})::date)`, [fid, insurer, encryptField(fid, no), sum]);
  await pol(FAM.shah, "Demo Insurer A", "DIA-2291-77410", 500000, 38);
  await pol(FAM.kulkarni, "Demo Insurer B", "DIB-8821-00314", 1000000, 120);
  await pol(FAM.mehta, "Demo Insurer A", "DIA-5531-90022", 300000, 9);

  const claim = async (fid, kind, status, hospital, amount, settled, opened, sla, missing) => {
    const r = await c.query(`insert into claims(family_id,kind,status,hospital,amount_claimed_inr,amount_settled_inr,opened_at,sla_due_at) values ($1,$2,$3,$4,$5,$6,${at(-opened)},${at(sla)}) returning id`, [fid, kind, status, hospital, amount, settled]);
    for (const label of missing) await c.query("insert into claim_requirements(claim_id,family_id,label) values ($1,$2,$3)", [r.rows[0].id, fid, label]);
  };
  await claim(FAM.shah, "cashless", "query", "Demo City Hospital, Rajkot", 86000, null, 6, 1, ["Signed discharge summary", "Itemised final bill"]);
  await claim(FAM.kulkarni, "reimbursement", "settled", "Demo Care Clinic, Pune", 24500, 22800, 33, -3, []);
  await claim(FAM.mehta, "reimbursement", "preparing", "Demo Heart Centre, Mumbai", 41200, null, 3, 4, ["Cancelled cheque", "Doctor's prescription copy"]);

  const task = async (fid, title, kind, status, owner, due, sla, budget, approval) => (await c.query(`insert into tasks(family_id,title,kind,status,owner_id,due_at,sla_at,hour_budget,needs_approval) values ($1,$2,$3,$4,$5,${at(due)},${at(sla)},$6,$7) returning id`, [fid, title, kind, status, owner, budget, approval])).rows[0].id;
  const t1 = await task(FAM.shah, "Chase signed discharge summary for claim", "claim", "doing", meera, 1, 1, 2, false);
  const t2 = await task(FAM.shah, "Pay November electricity bill", "bill", "waiting_owner", meera, 6, 5, 0.5, true);
  await task(FAM.shah, "Renewal quotes for health policy", "renewal", "todo", meera, 30, 30, 1, false);
  const t4 = await task(FAM.kulkarni, "Weekly check-in call (Marathi)", "checkin", "todo", rohan, 2, 2, 0.5, false);
  const t5 = await task(FAM.kulkarni, "Collect lab reports from clinic", "errand", "done", rohan, -8, -8, 1.5, false);
  const t6 = await task(FAM.mehta, "Assemble reimbursement claim documents", "claim", "waiting_parent", kavita, -1, -1, 2, true);
  const t7 = await task(FAM.mehta, "Renew health policy before expiry", "renewal", "doing", kavita, 9, 7, 1, true);

  const time = async (tid, fid, u, m, note, days) => c.query(`insert into time_entries(task_id,family_id,user_id,minutes,note,at) values ($1,$2,$3,$4,$5,${at(-days)})`, [tid, fid, u, m, note]);
  await time(t1, FAM.shah, meera, 75, "Called hospital desk, requested signed summary", 3);
  await time(t1, FAM.shah, meera, 40, "Checked insurer query email", 1);
  await time(t2, FAM.shah, meera, 20, "Prepared bill payment request", 1);
  await time(t5, FAM.kulkarni, rohan, 95, "Visited clinic, collected reports", 9);
  await time(t4, FAM.kulkarni, rohan, 25, "Check-in call", 4);
  await time(t6, FAM.mehta, kavita, 150, "Gathered documents from parent over two visits", 2);
  await time(t6, FAM.mehta, kavita, 90, "Followed up on cancelled cheque", 1);
  await time(t7, FAM.mehta, kavita, 120, "Compared renewal options, called insurer", 1);

  const appr = (fid, tid, summary, amount, payee, when, ev, by) => c.query("insert into approvals(family_id,task_id,summary,amount_inr,payee,when_text,evidence_ids,requested_by) values ($1,$2,$3,$4,$5,$6,$7,$8)", [fid, tid, summary, amount, payee, when, ev, by]);
  await appr(FAM.shah, t2, "Pay November electricity bill", 4200, "Demo Power Co", "By 15 Nov", [d3], meera);
  await appr(FAM.shah, t1, "Send claim documents to Demo Insurer A once the signed summary arrives", 0, "Demo Insurer A", "After summary is received", [d1, d2], meera);

  const ev = (fid, days, actor, name, kind, text) => c.query(`insert into events(family_id,created_at,actor,actor_name,kind,text) values ($1,${at(-days)},$2,$3,$4,$5)`, [fid, actor, name, kind, text]);
  await ev(FAM.shah, 6, "system", "Desk", "claim", "Claim opened for the Rajkot hospital stay. We asked the hospital desk for the final bill.");
  await ev(FAM.shah, 5, "ai", "Prepared by AI, checked by Meera", "document", "Discharge summary read. Two fields need a human check: doctor signature and stamp.");
  await ev(FAM.shah, 3, "human", "Meera Joshi", "visit", "Phoned the hospital desk. They will send the signed summary within two days.");
  await ev(FAM.shah, 2, "ai", "Prepared by AI, checked by Meera", "bill", "November electricity bill (Rs 4,200) found. Payment is waiting for your approval.");
  await ev(FAM.shah, 1, "system", "Desk", "claim", "Insurer asked for two things: signed discharge summary and itemised final bill.");
  await ev(FAM.kulkarni, 9, "human", "Rohan Desai", "visit", "Collected lab reports from the clinic and added them to the vault.");
  await ev(FAM.kulkarni, 4, "human", "Rohan Desai", "message", "Weekly check-in done in Marathi. Sulabha-tai says all is well.");
  await ev(FAM.mehta, 3, "ai", "Prepared by AI, needs a check", "document", "Cardiology report read with low confidence (0.60). Kavita will check it by hand.");
  await ev(FAM.mehta, 1, "human", "Kavita Rao", "claim", "Reimbursement claim is waiting on a cancelled cheque and a prescription copy from Harish-ji.");

  await c.query(`insert into messages(family_id,direction,created_at,language,body) values ($1,'out',${at(-3)},'Gujarati',$2),($1,'in',${at(-3)} + interval '1 hour','Gujarati',$3)`, [FAM.shah, "નમસ્તે કુસુમબેન, હું મીરા. હોસ્પિટલમાંથી સહી કરેલું ડિસ્ચાર્જ સમરી મળી જાય એટલે હું તમને જણાવીશ.", "સારું બેટા, આભાર."]);
  await c.query("insert into partner_contacts(kind,name,phone,email,city) values ('ca','Demo CA Patel','+919800000101','ca@demo.gharsaath.test','Mumbai'),('advocate','Demo Advocate Iyer','+919800000102','adv@demo.gharsaath.test','Pune'),('hospital_desk','Demo City Hospital desk','+919800000103',null,'Rajkot')");
  await c.end();
  console.log("demo data seeded");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await seedDemo();
