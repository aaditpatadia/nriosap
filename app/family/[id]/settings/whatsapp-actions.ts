"use server";

import { actionViewer } from "@/lib/auth";
import { createLinkCode } from "@/lib/wa-pipeline";

/** Only an owner can link a number. The code works once, for 15 minutes, from the phone that sends it. */
export async function linkCodeAction(): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const v = await actionViewer();
  if (!v || v.role !== "owner") return { ok: false, reason: "Only the account holder can link a WhatsApp number." };
  return { ok: true, code: await createLinkCode(v.id) };
}
