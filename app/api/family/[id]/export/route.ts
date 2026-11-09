import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { exportData, exportZip } from "@/lib/privacy";
import { rateLimit } from "@/lib/ratelimit";

const headers = (type: string, name: string) => ({ "content-type": type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" });

/** Owner only. Everyone else gets the same answer as for a family that does not exist. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (!v) return new NextResponse("Please sign in", { status: 401 });
  if (!(await rateLimit(`export:${v.id}`, 20, 600))) return new NextResponse("Too many downloads. Please wait a few minutes.", { status: 429 });
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (format === "zip") {
    const zip = await exportZip(id, v.id);
    return zip ? new NextResponse(Buffer.from(zip), { headers: headers("application/zip", "ally-export.zip") }) : new NextResponse("Not found", { status: 404 });
  }
  const r = await exportData(id, v.id);
  return r ? new NextResponse(JSON.stringify(r.data, null, 2), { headers: headers("application/json", "ally-export.json") }) : new NextResponse("Not found", { status: 404 });
}
