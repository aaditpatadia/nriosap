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

export interface InboundMessage {
  from: string;
  id: string;
  type: "text" | "image" | "document" | "audio";
  text?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
}

/** Every message type the desk handles. Reactions, locations and so on are skipped. */
export function parseInboundAll(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  type Media = { id?: string; mime_type?: string; caption?: string; filename?: string };
  type Msg = { from?: string; id?: string; type?: string; text?: { body?: string }; image?: Media; document?: Media; audio?: Media; voice?: Media };
  const entries = (payload as { entry?: { changes?: { value?: { messages?: Msg[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const c of e?.changes ?? []) {
      for (const m of c?.value?.messages ?? []) {
        if (!m?.from || !m.id) continue;
        if (m.type === "text" && m.text?.body) out.push({ from: m.from, id: m.id, type: "text", text: m.text.body });
        else if (m.type === "image" && m.image?.id) out.push({ from: m.from, id: m.id, type: "image", mediaId: m.image.id, mime: m.image.mime_type, text: m.image.caption, filename: "WhatsApp photo.jpg" });
        else if (m.type === "document" && m.document?.id) out.push({ from: m.from, id: m.id, type: "document", mediaId: m.document.id, mime: m.document.mime_type, text: m.document.caption, filename: m.document.filename ?? "WhatsApp document.pdf" });
        else if ((m.type === "audio" || m.type === "voice") && (m.audio?.id || m.voice?.id)) out.push({ from: m.from, id: m.id, type: "audio", mediaId: (m.audio ?? m.voice)!.id, mime: (m.audio ?? m.voice)!.mime_type });
      }
    }
  }
  return out;
}

export const WINDOW_MS = 24 * 3600_000;

/** Free-form replies are only allowed within 24 hours of the parent's last message. */
export function insideServiceWindow(lastInboundAt: string | undefined, now: Date): boolean {
  return !!lastInboundAt && now.getTime() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

/** The media link comes from a third party, so only Meta's hosts (or a configured test host) get our token. */
export function allowedMediaHost(url: string, extra?: string): boolean {
  try {
    const u = new URL(url);
    if (extra && u.host === extra) return true;
    return u.protocol === "https:" && (/(^|\.)fbsbx\.com$/.test(u.hostname) || /(^|\.)facebook\.com$/.test(u.hostname) || /(^|\.)whatsapp\.net$/.test(u.hostname));
  } catch {
    return false;
  }
}

/** Pulls text messages out of a WhatsApp Cloud API webhook payload. */
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
