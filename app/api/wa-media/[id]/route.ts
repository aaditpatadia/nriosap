import { NextResponse } from "next/server";
import { getViewer, isStaff } from "@/lib/auth";
import { logAudit } from "@/lib/store";
import { supabaseAdmin } from "@/lib/supabase";
import { BUCKET } from "@/lib/vault";
import { mediaFor } from "@/lib/wa-inbox";

/** A WhatsApp voice note, for the desk only, through a 60 second link. Every listen is written to the access log. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!isStaff(v)) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const media = await mediaFor(id);
  if (!media) return new NextResponse("Not found", { status: 404 });
  const s = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(media.path, 60);
  if (s.error || !s.data) return new NextResponse("Not found", { status: 404 });
  await logAudit(v!.id, "listen_whatsapp_voice_note", "whatsapp_message", id, media.familyId);
  return NextResponse.redirect(s.data.signedUrl, { status: 303, headers: { "cache-control": "no-store" } });
}
