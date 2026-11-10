import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientIp } from "@/lib/http";
import { inngest, whatsappReceived } from "@/lib/inngest";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { ingest, LIMITS, processMessage } from "@/lib/wa-pipeline";
import { verifySignature } from "@/lib/whatsapp";

/**
 * Meta's WhatsApp webhook. Point the Meta app here: https://YOUR-DOMAIN/api/whatsapp/webhook
 * GET answers the subscribe check. POST checks the signature on the raw body, stores each message once,
 * answers 200 at once, and leaves the reading to a background job. Bodies and numbers are never logged.
 */

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const given = url.searchParams.get("hub.verify_token") ?? "";
  if (token && url.searchParams.get("hub.mode") === "subscribe" && same(given, token)) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

const MAX_BODY = 1024 * 1024;

export async function POST(req: Request) {
  if (!(await rateLimit(`wa-ip:${clientIp(req)}`, 1200, 60))) return new Response("Too many requests", { status: 429 });
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("Too large", { status: 413 });
  const header = req.headers.get("x-hub-signature-256");
  if (!secret || !verifySignature(raw, header, secret)) {
    log("warn", "whatsapp_webhook_rejected", { reason: !secret ? "no_secret" : header ? "bad_signature" : "no_signature", bytes: raw.length });
    return new Response("Invalid signature", { status: 401 });
  }
  // Over the global limit Meta is told to try again later, so nothing is dropped.
  if (!(await rateLimit("wa-global", LIMITS.globalPerMinute(), 60))) return new Response("Busy", { status: 503, headers: { "retry-after": "60" } });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  let result;
  try {
    result = await ingest(payload);
  } catch (e) {
    // Storage failed. A non-200 makes Meta deliver again later, so the message is not lost.
    log("error", "whatsapp_ingest_failed", { error: (e as Error).constructor.name });
    return new Response("Try again", { status: 500 });
  }
  log("info", "whatsapp_webhook", { stored: result.stored.length, duplicates: result.duplicates, statuses: result.statuses, skipped: result.skipped });
  if (result.stored.length) {
    let queued = false;
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send(result.stored.map((id) => whatsappReceived.create({ id })));
        queued = true;
      } catch (e) {
        log("warn", "whatsapp_queue_failed", { error: (e as Error).constructor.name });
      }
    }
    // Without Inngest (local runs, or Inngest down) the work runs after the reply. The sweep job catches anything missed.
    if (!queued) after(async () => {
      for (const id of result.stored) await processMessage(id);
    });
  }
  return NextResponse.json({ ok: true });
}
