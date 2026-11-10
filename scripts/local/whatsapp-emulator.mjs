// LOCAL ONLY. A stand-in for Meta's servers: signs webhook bodies with the local app secret, exactly as Meta
// signs them (HMAC SHA-256 of the raw body, in X-Hub-Signature-256), and posts them to the webhook.
// It is not Meta. Passing against it does not prove behaviour with real WhatsApp traffic.
//
// Usage, with the local stack and app running (see README):
//   node scripts/local/whatsapp-emulator.mjs list
//   node scripts/local/whatsapp-emulator.mjs bill_photo
//   node scripts/local/whatsapp-emulator.mjs all
//   node scripts/local/whatsapp-emulator.mjs text_english --url http://localhost:3100 --bad-signature
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { APP_PORT, localEnv } from "./env.mjs";
import { FIXTURES } from "./whatsapp-fixtures.mjs";

export const WEBHOOK_PATH = "/api/whatsapp/webhook";

export function sign(raw, secret = localEnv().WHATSAPP_APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

/** Posts one body. signature: "valid" (default), "invalid" or "missing". */
export async function post(body, { url = `http://localhost:${APP_PORT}`, signature = "valid" } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (signature === "valid") headers["x-hub-signature-256"] = sign(raw);
  if (signature === "invalid") headers["x-hub-signature-256"] = sign(raw, "not-the-secret");
  const res = await fetch(`${url.replace(/\/$/, "")}${WEBHOOK_PATH}`, { method: "POST", headers, body: raw });
  return { status: res.status, text: await res.text() };
}

export async function verifyChallenge({ url = `http://localhost:${APP_PORT}`, token = localEnv().WHATSAPP_VERIFY_TOKEN } = {}) {
  const res = await fetch(`${url}${WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=emulator-check`);
  return { status: res.status, text: await res.text() };
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : `http://localhost:${APP_PORT}`;
  const signature = args.includes("--bad-signature") ? "invalid" : args.includes("--no-signature") ? "missing" : "valid";
  const name = args.find((a) => !a.startsWith("--") && a !== url) ?? "list";
  if (name === "list") {
    console.log(["verify", ...Object.keys(FIXTURES), "all"].join("\n"));
    return;
  }
  if (name === "verify") {
    console.log(await verifyChallenge({ url }));
    return;
  }
  const names = name === "all" ? Object.keys(FIXTURES).filter((n) => n !== "stop") : [name];
  for (const n of names) {
    const make = FIXTURES[n];
    if (!make) throw new Error(`No fixture called ${n}. Run with "list".`);
    for (const body of make()) {
      const r = await post(body, { url, signature });
      console.log(`${n}: ${r.status}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
