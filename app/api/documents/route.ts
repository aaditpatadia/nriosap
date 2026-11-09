import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getFamily } from "@/lib/store";
import { isDocumentCategory, type DocumentCategory } from "@/lib/request-engine";
import { familyAccess } from "@/lib/service-requests";
import { sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { MAX_WEB_UPLOAD_BYTES, PURPOSES, type Purpose } from "@/lib/upload-rules";
import { ingestDocument } from "@/lib/vault";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, reason: "Bad origin." }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ ok: false, reason: "Please sign in." }, { status: 401 });
  if (!(await rateLimit(`upload:${viewer.id}`, 60, 600))) return NextResponse.json({ ok: false, reason: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  // Refused before the body is read. The extra 64 KB allows for the form fields around the file.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_WEB_UPLOAD_BYTES + 65536) return NextResponse.json({ ok: false, reason: "Please send a file under 4 MB, or send it on WhatsApp." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const fid = z.string().uuid().safeParse(form?.get("familyId"));
  if (!form || !(file instanceof File) || !fid.success) return NextResponse.json({ ok: false, reason: "Please choose a file." }, { status: 400 });
  // RLS decides here: a family the viewer cannot see does not exist for them.
  const fam = await getFamily(fid.data);
  if (!fam) return NextResponse.json({ ok: false, reason: "Family not found." }, { status: 404 });
  if (!(await familyAccess(fam.id)).canUpload) return NextResponse.json({ ok: false, reason: "You do not have permission to add documents here." }, { status: 403 });
  if (file.size > MAX_WEB_UPLOAD_BYTES) return NextResponse.json({ ok: false, reason: "Please send a file under 4 MB, or send it on WhatsApp." }, { status: 413 });
  const purposes = form.getAll("purpose").filter((p): p is Purpose => PURPOSES.includes(p as Purpose));
  const r = await ingestDocument({ familyId: fam.id, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), maxBytes: MAX_WEB_UPLOAD_BYTES, purposes: [...new Set(purposes)], uploaderId: viewer.id, source: "web", category: isDocumentCategory(form.get("category")) ? (form.get("category") as DocumentCategory) : undefined });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: r.status });
  return NextResponse.json(r);
}
