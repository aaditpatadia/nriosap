// LOCAL ONLY. A small stand-in for the Supabase Auth and Storage REST APIs, so the real
// supabase-js code paths run in tests on a machine without Docker. It is not Supabase.
// Users live in the same Postgres (auth.users) so the signup trigger and RLS behave normally.
import { createHmac, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import pg from "pg";

const b64 = (b) => Buffer.from(b).toString("base64url");

export function signJwt(payload, secret) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

function verifyJwt(token, secret) {
  const [h, b, s] = String(token).split(".");
  if (!s) return null;
  const expect = createHmac("sha256", secret).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, "base64url");
  if (expect.length !== given.length || !timingSafeEqual(expect, given)) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp && p.exp < Date.now() / 1000 ? null : p;
}

function hashPw(pw) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  return timingSafeEqual(scryptSync(pw, salt, 32), Buffer.from(h, "hex"));
}

export async function startEmulator({ port, dbUrl, jwtSecret, storageDir }) {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const anonKey = signJwt({ role: "anon", iss: "local", exp: 4102444800 }, jwtSecret);
  const serviceKey = signJwt({ role: "service_role", iss: "local", exp: 4102444800 }, jwtSecret);
  mkdirSync(storageDir, { recursive: true });

  const inbox = new Map(); // email -> latest magic link
  const otps = new Map(); // token -> { email, challenge, redirect }
  const codes = new Map(); // code -> { userId, challenge }
  const refresh = new Map(); // refresh token -> userId
  const signTokens = new Map(); // token -> { key, exp }
  const buckets = new Set();

  const userRow = async (where, v) => (await pool.query(`select * from auth.users where ${where} = $1`, [v])).rows[0];
  const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.email_confirmed_at, created_at: u.created_at, updated_at: u.created_at, app_metadata: {}, user_metadata: u.raw_user_meta_data });
  function session(u) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const rt = randomBytes(16).toString("hex");
    refresh.set(rt, u.id);
    return { access_token: signJwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, exp }, jwtSecret), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson(u) };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const json = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const body = () => (raw.length ? JSON.parse(raw.toString()) : {});
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const claims = verifyJwt(bearer, jwtSecret);
    const isService = claims?.role === "service_role";
    const p = url.pathname;
    try {
      // ----- test helper -----
      if (p === "/__inbox") return json(200, { link: inbox.get(url.searchParams.get("email")) ?? null });

      // ----- auth -----
      if (p === "/auth/v1/health") return json(200, { name: "emulator" });
      if (p === "/auth/v1/settings") return json(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: false, phone_autoconfirm: false });
      if (p === "/auth/v1/token" && req.method === "POST") {
        const g = url.searchParams.get("grant_type");
        const b = body();
        if (g === "password") {
          const u = await userRow("email", String(b.email).toLowerCase());
          if (!u || !checkPw(b.password, u.encrypted_password)) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
          return json(200, session(u));
        }
        if (g === "pkce") {
          const c = codes.get(b.auth_code);
          if (!c) return json(400, { code: 400, error_code: "bad_code_verifier", msg: "invalid flow state" });
          const expected = createHash("sha256").update(b.code_verifier).digest("base64url");
          if (expected !== c.challenge) return json(400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match" });
          codes.delete(b.auth_code);
          return json(200, session(await userRow("id", c.userId)));
        }
        if (g === "refresh_token") {
          const id = refresh.get(b.refresh_token);
          if (!id) return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
          refresh.delete(b.refresh_token);
          return json(200, session(await userRow("id", id)));
        }
        return json(400, { msg: "unsupported grant" });
      }
      if (p === "/auth/v1/otp" && req.method === "POST") {
        const b = body();
        const email = String(b.email).toLowerCase();
        let u = await userRow("email", email);
        if (!u) {
          if (b.create_user === false) return json(422, { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" });
          u = (await pool.query("insert into auth.users(email, raw_user_meta_data) values ($1,$2) returning *", [email, b.data ?? {}])).rows[0];
        }
        const token = randomBytes(16).toString("hex");
        const redirect = url.searchParams.get("redirect_to") ?? b.redirect_to ?? "";
        otps.set(token, { userId: u.id, challenge: b.code_challenge, redirect });
        inbox.set(email, `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${encodeURIComponent(redirect)}`);
        return json(200, {});
      }
      if (p === "/auth/v1/verify" && req.method === "GET") {
        const o = otps.get(url.searchParams.get("token"));
        const target = new URL(url.searchParams.get("redirect_to") || "http://localhost");
        if (!o) { target.searchParams.set("error", "access_denied"); res.writeHead(303, { location: target.toString() }); return res.end(); }
        otps.delete(url.searchParams.get("token"));
        await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [o.userId]);
        const code = randomUUID();
        codes.set(code, { userId: o.userId, challenge: o.challenge });
        target.searchParams.set("code", code);
        res.writeHead(303, { location: target.toString() });
        return res.end();
      }
      if (p === "/auth/v1/user" && req.method === "GET") {
        if (!claims?.sub) return json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
        const u = await userRow("id", claims.sub);
        return u ? json(200, userJson(u)) : json(403, { code: 403, error_code: "user_not_found", msg: "User not found" });
      }
      if (p === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
      if (p === "/auth/v1/admin/users" && req.method === "POST") {
        if (!isService) return json(403, { msg: "forbidden" });
        const b = body();
        const email = String(b.email).toLowerCase();
        if (await userRow("email", email)) return json(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
        const u = (await pool.query("insert into auth.users(email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1,$2,$3,now()) returning *", [email, b.password ? hashPw(b.password) : null, b.user_metadata ?? {}])).rows[0];
        return json(200, userJson(u));
      }
      if (p === "/auth/v1/admin/users" && req.method === "GET") {
        if (!isService) return json(403, { msg: "forbidden" });
        const r = await pool.query("select * from auth.users");
        return json(200, { users: r.rows.map(userJson), aud: "authenticated" });
      }
      const adminUser = p.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
      if (adminUser && req.method === "DELETE") {
        if (!isService) return json(403, { msg: "forbidden" });
        await pool.query("delete from public.profiles where id = $1", [adminUser[1]]).catch(() => {});
        await pool.query("delete from auth.users where id = $1", [adminUser[1]]);
        return json(200, {});
      }
      if (adminUser && req.method === "PUT") {
        if (!isService) return json(403, { msg: "forbidden" });
        const b = body();
        if (b.password) await pool.query("update auth.users set encrypted_password = $2 where id = $1", [adminUser[1], hashPw(b.password)]);
        return json(200, userJson(await userRow("id", adminUser[1])));
      }

      // ----- storage -----
      const fileOf = (key) => path.join(storageDir, Buffer.from(key).toString("base64url"));
      if (p === "/storage/v1/bucket" && req.method === "POST") { buckets.add(body().name ?? body().id); return json(200, { name: body().name }); }
      if (p === "/storage/v1/bucket" && req.method === "GET") return json(200, [...buckets].map((name) => ({ id: name, name, public: false })));
      const sign = p.match(/^\/storage\/v1\/object\/sign\/(.+)$/);
      if (sign && req.method === "POST") {
        if (!isService) return json(403, { message: "forbidden" });
        if (!existsSync(fileOf(sign[1]))) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
        const token = randomBytes(16).toString("hex");
        signTokens.set(token, { key: sign[1], exp: Date.now() + body().expiresIn * 1000 });
        return json(200, { signedURL: `/object/sign/${sign[1]}?token=${token}` });
      }
      if (sign && req.method === "GET") {
        const t = signTokens.get(url.searchParams.get("token"));
        if (!t || t.key !== decodeURIComponent(sign[1]) && t.key !== sign[1] || t.exp < Date.now()) return json(400, { message: "invalid signature" });
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(readFileSync(fileOf(t.key)));
      }
      if (p.startsWith("/storage/v1/object/") && req.method === "DELETE" && p.split("/").length === 5) {
        if (!isService) return json(403, { message: "forbidden" });
        const bucket = p.split("/")[4];
        const removed = [];
        for (const prefix of body().prefixes ?? []) { const f = fileOf(`${bucket}/${prefix}`); if (existsSync(f)) { rmSync(f); removed.push({ name: prefix }); } }
        return json(200, removed);
      }
      const obj = p.match(/^\/storage\/v1\/object\/(.+)$/);
      if (obj && (req.method === "POST" || req.method === "PUT")) {
        if (!isService) return json(403, { message: "forbidden" });
        if (req.method === "POST" && existsSync(fileOf(obj[1])) && req.headers["x-upsert"] !== "true") return json(409, { statusCode: "409", error: "Duplicate", message: "exists" });
        writeFileSync(fileOf(obj[1]), raw);
        return json(200, { Key: obj[1], Id: randomUUID() });
      }
      if (obj && req.method === "GET") {
        if (!isService) return json(403, { message: "forbidden" });
        if (!existsSync(fileOf(obj[1]))) return json(404, { message: "Object not found" });
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(readFileSync(fileOf(obj[1])));
      }
      return json(404, { message: `emulator has no ${req.method} ${p}` });
    } catch (e) {
      return json(500, { message: e.message });
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { anonKey, serviceKey, url: `http://127.0.0.1:${port}`, stop: async () => { server.close(); await pool.end(); } };
}
