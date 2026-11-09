import "server-only";
import { allowedMediaHost } from "./whatsapp";

const graphBase = () => (process.env.WHATSAPP_GRAPH_URL ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");
const token = () => process.env.WHATSAPP_ACCESS_TOKEN ?? "";

export const sendingEnabled = () => process.env.WHATSAPP_SEND_ENABLED === "1" && !!process.env.WHATSAPP_PHONE_NUMBER_ID && !!token();

export type SendResult = { status: "sent"; waId: string } | { status: "disabled" } | { status: "failed"; code: number };

/** Nothing leaves this function unless WHATSAPP_SEND_ENABLED is 1. It is off until business verification is done. */
async function post(body: object): Promise<SendResult> {
  if (!sendingEnabled()) return { status: "disabled" };
  try {
    const res = await fetch(`${graphBase()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { status: "failed", code: res.status };
    const r = (await res.json()) as { messages?: { id: string }[] };
    return { status: "sent", waId: r.messages?.[0]?.id ?? "" };
  } catch {
    return { status: "failed", code: 0 };
  }
}

const digits = (p: string) => p.replace(/\D/g, "");

export const sendText = (to: string, text: string) => post({ to: digits(to), type: "text", text: { body: text } });

export const sendTemplate = (to: string, name: string, languageCode: string, params: string[]) =>
  post({ to: digits(to), type: "template", template: { name, language: { code: languageCode }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] } });

/** Two steps on Meta's side: look up the temporary link, then fetch it with the same token. */
export async function downloadMedia(mediaId: string, maxBytes: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!token() || !/^[\w-]+$/.test(mediaId)) return null;
  const headers = { authorization: `Bearer ${token()}` };
  try {
    const meta = await fetch(`${graphBase()}/${mediaId}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!meta.ok) return null;
    const m = (await meta.json()) as { url?: string; mime_type?: string };
    if (!m.url || !allowedMediaHost(m.url, process.env.WHATSAPP_MEDIA_TEST_HOST)) return null;
    const file = await fetch(m.url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!file.ok) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : { bytes, mime: m.mime_type ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
