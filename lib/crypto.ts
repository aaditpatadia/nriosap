import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Per-family key derived from one master secret. Set APP_ENCRYPTION_KEY in production. */
// The salt below is a fixed internal value from the old working name. Changing it would make stored data unreadable.
function keyFor(familyId: string): Buffer {
  const master = process.env.APP_ENCRYPTION_KEY ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-insecure-master-key-change-me");
  if (master.length < 32) throw new Error("APP_ENCRYPTION_KEY must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", master, "gharsaath", `family:${familyId}`, 32));
}

export function encryptField(familyId: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(familyId), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptField(familyId: string, blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(familyId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function maskTail(value: string, keep = 4): string {
  if (value.length <= keep) return value;
  return "•".repeat(Math.max(0, value.length - keep)) + value.slice(-keep);
}
