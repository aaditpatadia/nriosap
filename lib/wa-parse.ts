/** Reads Meta's WhatsApp Cloud API webhook body. Pure, so it can be tested without a server. */

export type WaType = "text" | "image" | "document" | "audio" | "other";

export interface WaInbound {
  wamid: string;
  from: string;
  timestamp: string | null;
  type: WaType;
  /** The type Meta used, kept for "we cannot read this kind of message" replies. */
  rawType: string;
  text: string | null;
  mediaId: string | null;
  mime: string | null;
  filename: string | null;
  /** Set when the person replied to one of our messages. */
  replyTo: string | null;
  profileName: string | null;
}

export interface WaStatus {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: number | null;
}

type Media = { id?: string; mime_type?: string; caption?: string; filename?: string };
type Msg = {
  from?: string; id?: string; timestamp?: string; type?: string; text?: { body?: string };
  image?: Media; document?: Media; audio?: Media; voice?: Media; video?: Media; sticker?: Media;
  button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  context?: { id?: string };
};
type Value = { messages?: Msg[]; statuses?: { id?: string; status?: string; errors?: { code?: number }[] }[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] };

function values(payload: unknown): Value[] {
  const out: Value[] = [];
  const entries = (payload as { object?: string; entry?: { changes?: { field?: string; value?: Value }[] }[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) for (const c of Array.isArray(e?.changes) ? e.changes : []) if (c?.value && typeof c.value === "object") out.push(c.value);
  return out;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length ? v.slice(0, max) : null);

export function parseWebhook(payload: unknown): { messages: WaInbound[]; statuses: WaStatus[] } {
  const messages: WaInbound[] = [];
  const statuses: WaStatus[] = [];
  for (const v of values(payload)) {
    const names = new Map((v.contacts ?? []).map((c) => [c?.wa_id ?? "", c?.profile?.name ?? null]));
    for (const m of Array.isArray(v.messages) ? v.messages : []) {
      if (!m?.from || !m.id || typeof m.from !== "string" || typeof m.id !== "string") continue;
      const base = { wamid: m.id.slice(0, 200), from: m.from, timestamp: str(m.timestamp, 20), rawType: str(m.type, 30) ?? "unknown", replyTo: str(m.context?.id, 200), profileName: str(names.get(m.from), 100) };
      const media = (type: WaType, x: Media | undefined, fallbackName: string | null) =>
        messages.push({ ...base, type, text: str(x?.caption, 4000), mediaId: str(x?.id, 200), mime: str(x?.mime_type, 100), filename: str(x?.filename, 200) ?? fallbackName });
      if (m.type === "text") messages.push({ ...base, type: "text", text: str(m.text?.body, 4000), mediaId: null, mime: null, filename: null });
      else if (m.type === "button") messages.push({ ...base, type: "text", text: str(m.button?.text, 4000), mediaId: null, mime: null, filename: null });
      else if (m.type === "interactive") messages.push({ ...base, type: "text", text: str(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title, 4000), mediaId: null, mime: null, filename: null });
      else if (m.type === "image") media("image", m.image, "WhatsApp photo");
      else if (m.type === "document") media("document", m.document, "WhatsApp document");
      else if (m.type === "audio" || m.type === "voice") media("audio", m.audio ?? m.voice, null);
      else messages.push({ ...base, type: "other", text: null, mediaId: null, mime: null, filename: null });
    }
    for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
      if (!s?.id || !["sent", "delivered", "read", "failed"].includes(s.status ?? "")) continue;
      statuses.push({ wamid: String(s.id).slice(0, 200), status: s.status as WaStatus["status"], errorCode: typeof s.errors?.[0]?.code === "number" ? s.errors[0].code : null });
    }
  }
  return { messages, statuses };
}

/** Only these reach storage. Everything else gets a polite "we cannot open this" reply. */
export const ALLOWED_MEDIA = /^(image\/(jpeg|png|webp)|application\/pdf|audio\/(ogg|mpeg|mp4|aac|amr)(;.*)?)$/;

export function mediaAllowed(type: WaType, mime: string | null): boolean {
  if (type === "text") return true;
  if (type === "other" || !mime) return false;
  const base = mime.toLowerCase().trim();
  if (type === "image") return /^image\/(jpeg|png|webp)$/.test(base);
  if (type === "document") return base === "application/pdf" || /^image\/(jpeg|png|webp)$/.test(base);
  if (type === "audio") return /^audio\/(ogg|mpeg|mp4|aac|amr)(;.*)?$/.test(base);
  return false;
}
