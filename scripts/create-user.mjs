// Creates a coordinator or admin. Staff roles can only be set this way.
// Usage: node --env-file=.env.local scripts/create-user.mjs <email> "<name>" <coordinator|admin> "<city>"
// The password is read from the STAFF_PASSWORD environment variable so it stays out of shell history.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { ensureUser } from "./seed.mjs";

const [email, name, role, city] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;
if (!email || !name || !["coordinator", "admin"].includes(role) || !password || password.length < 12) {
  console.error('Usage: STAFF_PASSWORD=... node --env-file=.env.local scripts/create-user.mjs <email> "<name>" <coordinator|admin> "<city>"  (password 12+ characters)');
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = await ensureUser(admin, email.toLowerCase(), name, password);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "disable" ? undefined : { rejectUnauthorized: false } });
await c.connect();
await c.query("update profiles set role=$2, name=$3, city=$4, email=$5 where id=$1", [id, role, name, city ?? "", email.toLowerCase()]);
await c.end();
console.log(`${role} ready: ${email}`);
