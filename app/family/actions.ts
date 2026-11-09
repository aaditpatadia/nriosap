"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionViewer } from "@/lib/auth";
import { PURPOSES } from "@/lib/upload-rules";
import { withdrawDocumentConsent } from "@/lib/vault";

export async function withdrawDocumentAction(documentId: string, purpose: string) {
  const p = z.object({ documentId: z.string().uuid(), purpose: z.enum(PURPOSES) }).safeParse({ documentId, purpose });
  if (!p.success || !(await actionViewer())) return { ok: false };
  try {
    await withdrawDocumentConsent(p.data.documentId, p.data.purpose);
  } catch {
    return { ok: false };
  }
  revalidatePath("/family", "layout");
  return { ok: true };
}
