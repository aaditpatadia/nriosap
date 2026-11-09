"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionViewer, isStaff } from "@/lib/auth";
import { createCheckout, createPortal } from "@/lib/billing";
import { deleteFamily, withdrawParentConsent } from "@/lib/privacy";
import { getFamily } from "@/lib/store";
import { supabaseServer } from "@/lib/supabase";
import { PURPOSES } from "@/lib/upload-rules";
import { withdrawDocumentConsent } from "@/lib/vault";

/** Only the owner of this family can pay for it or manage the subscription. */
async function ownedFamily(familyId: string) {
  const v = await actionViewer();
  if (!v || !z.string().uuid().safeParse(familyId).success) return null;
  const fam = await getFamily(familyId);
  return fam && fam.owner.id === v.id ? { fam, viewer: v } : null;
}

const base = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

export async function checkoutAction(familyId: string) {
  const o = await ownedFamily(familyId);
  if (!o) return { ok: false, reason: "Only the family owner can do this." };
  const url = await createCheckout(familyId, o.fam.planUsd, o.viewer.email, base());
  if (!url) return { ok: false, reason: "Payments are not switched on yet." };
  redirect(url);
}

export async function portalAction(familyId: string) {
  const o = await ownedFamily(familyId);
  if (!o) return { ok: false, reason: "Only the family owner can do this." };
  const url = await createPortal(familyId, base());
  if (!url) return { ok: false, reason: "No subscription yet." };
  redirect(url);
}

export async function withdrawParentAction(familyId: string) {
  const v = await actionViewer();
  const fam = v && z.string().uuid().safeParse(familyId).success ? await getFamily(familyId) : undefined;
  // Family members can see this account, but only the owner or the desk can withdraw consent for it.
  if (!fam || (fam.owner.id !== v!.id && !isStaff(v))) return { ok: false };
  await withdrawParentConsent(fam.parent.id, v!.role === "owner" ? "owner" : "desk");
  revalidatePath(`/family/${familyId}`, "layout");
  return { ok: true };
}

export async function deleteFamilyAction(_prev: unknown, form: FormData) {
  const p = z.object({ familyId: z.string().uuid(), confirm: z.string() }).safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, message: "Please try again." };
  const o = await ownedFamily(p.data.familyId);
  if (!o) return { ok: false, message: "Only the family owner can do this." };
  if (p.data.confirm.trim().toLowerCase() !== o.fam.name.toLowerCase()) return { ok: false, message: `Please type ${o.fam.name} exactly.` };
  await deleteFamily(o.fam.id, o.viewer.id);
  const sb = await supabaseServer();
  await sb.auth.signOut().catch(() => {});
  redirect("/goodbye");
}

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
