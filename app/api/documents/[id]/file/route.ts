import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { previewBytes, signedDocumentUrl } from "@/lib/vault";

/** Redirects to a 60 second signed link. Unknown and forbidden ids look the same. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) return new NextResponse("Please sign in", { status: 401 });
  const { id } = await params;
  if (new URL(req.url).searchParams.get("preview") === "1") {
    const p = await previewBytes(id);
    if (!p) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(p.bytes, { headers: { "content-type": p.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }
  const url = await signedDocumentUrl(id);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store" } });
}
