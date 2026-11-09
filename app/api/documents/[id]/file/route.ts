import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { signedDocumentUrl } from "@/lib/vault";

/** Redirects to a 60 second signed link. Unknown and forbidden ids look the same. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) return new NextResponse("Please sign in", { status: 401 });
  const { id } = await params;
  const url = await signedDocumentUrl(id);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store" } });
}
