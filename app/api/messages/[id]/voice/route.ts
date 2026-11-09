import { NextResponse } from "next/server";
import { getViewer, isStaff } from "@/lib/auth";
import { logAudit } from "@/lib/store";
import { supabaseAdmin } from "@/lib/supabase";
import { BUCKET } from "@/lib/vault";
import { voiceNotePath } from "@/lib/wa-outbound";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!isStaff(v)) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const note = await voiceNotePath(id);
  if (!note) return new NextResponse("Not found", { status: 404 });
  const s = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(note.path, 60);
  if (s.error || !s.data) return new NextResponse("Not found", { status: 404 });
  await logAudit(v!.id, "listen_voice_note", "message", id, note.familyId);
  return NextResponse.redirect(s.data.signedUrl, { status: 303, headers: { "cache-control": "no-store" } });
}
