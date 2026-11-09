import { after, NextResponse } from "next/server";
import { clientIp } from "@/lib/http";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { parseInboundAll, verifySignature, type InboundMessage } from "@/lib/whatsapp";
import { processMedia, storeInbound, type StoredInbound } from "@/lib/wa-inbound";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Inbound messages. The signature is checked on the raw body before anything is parsed.
 * Messages and emergency tasks are stored before answering. Media is fetched after answering.
 */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!(await rateLimit(`wa:${clientIp(req)}`, 600, 60))) return new Response("Too many requests", { status: 429 });
  const raw = await req.text();
  if (!secret || !verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const messages = parseInboundAll(payload);
  const stored: { m: InboundMessage; s: StoredInbound }[] = [];
  for (const m of messages) stored.push({ m, s: await storeInbound(m) });
  after(async () => {
    for (const { m, s } of stored) {
      try {
        await processMedia(m, s);
      } catch (e) {
        log("error", "whatsapp_media_failed", { type: m.type, error: (e as Error).constructor.name });
      }
    }
  });
  return NextResponse.json({ ok: true });
}
