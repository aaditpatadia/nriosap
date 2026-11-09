import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies Meta's X-Hub-Signature-256 header over the raw request body. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(given, "hex");
  } catch {
    return false;
  }
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface InboundText {
  from: string;
  text: string;
  id: string;
}

/** Pulls text messages out of a WhatsApp Cloud API webhook payload. Other types are ignored in the MVP. */
export function parseInbound(payload: unknown): InboundText[] {
  const out: InboundText[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const e of entries) {
    const changes = (e as { changes?: unknown[] })?.changes ?? [];
    for (const c of changes) {
      const messages = (c as { value?: { messages?: unknown[] } })?.value?.messages ?? [];
      for (const m of messages) {
        const msg = m as { from?: string; id?: string; type?: string; text?: { body?: string } };
        if (msg.type === "text" && msg.from && msg.text?.body && msg.id) {
          out.push({ from: msg.from, text: msg.text.body, id: msg.id });
        }
      }
    }
  }
  return out;
}
