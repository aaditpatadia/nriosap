export const MAX_WEB_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_WHATSAPP_MEDIA_BYTES = 16 * 1024 * 1024;

export const PURPOSES = ["read_records", "store", "share_named_third_party", "act_on_named_task"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABEL: Record<Purpose, string> = {
  read_records: "Read it to pull out key facts",
  store: "Keep it in the vault",
  share_named_third_party: "Share it with a named insurer or hospital",
  act_on_named_task: "Use it for a named task",
};

/** Trusts the file's first bytes, never its name or the browser's claimed type. */
export function sniffMime(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  const hex = Buffer.from(b.subarray(0, 12)).toString("hex");
  if (hex.startsWith("25504446")) return { mime: "application/pdf", ext: "pdf" };
  if (hex.startsWith("ffd8ff")) return { mime: "image/jpeg", ext: "jpg" };
  if (hex.startsWith("89504e470d0a1a0a")) return { mime: "image/png", ext: "png" };
  if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") return { mime: "image/webp", ext: "webp" };
  return null;
}

export function cleanTitle(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "Document";
   
  return base.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120) || "Document";
}
