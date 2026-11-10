import { createHmac, hkdfSync } from "node:crypto";
import { decryptField, encryptField } from "./crypto";

/** Meta sends numbers as digits with no plus. Stored and compared as E.164. */
export function e164FromWa(from: string): string | null {
  const d = from.replace(/\D/g, "");
  return /^[1-9]\d{9,14}$/.test(d) ? `+${d}` : null;
}

function hashKey(): Buffer {
  const master = process.env.APP_ENCRYPTION_KEY ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-insecure-master-key-change-me");
  if (master.length < 32) throw new Error("APP_ENCRYPTION_KEY must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", master, "ally-wa", "phone-hash", 32));
}

/** Keyed hash of the digits. Groups a conversation and matches STOP without keeping the number readable. */
export function phoneHash(phone: string): string {
  return createHmac("sha256", hashKey()).update(phone.replace(/\D/g, "")).digest("hex");
}

/** Numbers from unknown senders have no family key, so they share one scope of their own. */
const SCOPE = "whatsapp-numbers";
export const encryptPhone = (e164: string) => encryptField(SCOPE, e164);
export const decryptPhone = (blob: string) => decryptField(SCOPE, blob);
export const phoneTail = (e164: string) => e164.replace(/\D/g, "").slice(-4);
