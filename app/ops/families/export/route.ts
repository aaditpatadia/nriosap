import { NextResponse } from "next/server";
import { getViewer, isStaff } from "@/lib/auth";
import { hoursCsv, hoursReport } from "@/lib/ops";

export async function GET() {
  if (!isStaff(await getViewer())) return new NextResponse("Not allowed", { status: 403 });
  const csv = hoursCsv(await hoursReport());
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hours-per-family-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
