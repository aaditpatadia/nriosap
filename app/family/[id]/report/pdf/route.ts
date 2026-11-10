import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { simplePdf, type PdfLine } from "@/lib/pdf";
import { STATUS_META, type RequestStatus } from "@/lib/request-engine";
import { familyAccess } from "@/lib/service-requests";
import { getFamily, logAudit } from "@/lib/store";
import { reportFor } from "@/lib/workspace";
import { isMonthKey, istDate } from "@/lib/workspace-rules";

const section = (title: string, items: string[], none: string): PdfLine[] => [{ text: title, bold: true, size: 13, gap: 12 }, ...(items.length ? items.map((text) => ({ text: `- ${text}` })) : [{ text: none }])];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Please sign in", { status: 401 });
  const access = await familyAccess(id);
  const fam = await getFamily(id);
  if (!fam || (!access.owner && !access.staff)) return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url).searchParams;
  const month = isMonthKey(u.get("month")) ? u.get("month")! : istDate(new Date()).slice(0, 7);
  const r = await reportFor(id, month, u.get("category") ?? undefined, u.get("property") ?? undefined);
  await logAudit(viewer.id, "report_downloaded", "family", id, id);
  const pdf = simplePdf([
    { text: `Ally monthly report: ${r.label}`, bold: true, size: 18 },
    { text: fam.name, gap: 2 },
    { text: `Prepared ${istDate(new Date())}, from what is recorded in Ally.`, size: 9, gap: 2 },
    ...section("Completed", r.completed.map((x) => `${x.ref}: ${x.title}`), "Nothing completed in this month."),
    ...section("In progress", r.inProgress.map((x) => `${x.ref}: ${x.title} (${STATUS_META[x.status as RequestStatus].label})`), "Nothing in progress."),
    ...section("Visits", r.visits.map((v) => `${v.at.slice(0, 10)}: ${v.purpose}`), "No visits in this month."),
    ...section("Documents collected", r.documents, "No new documents."),
    ...section("Bills and renewals handled", r.handledDeadlines, "None marked handled."),
    ...section("Approved costs", r.approved.map((a) => `${a.title}: Rs ${a.totalInr.toLocaleString("en-IN")}. Approved. Payment not confirmed by any payment system.`), "No costs approved in this month."),
    ...section("Coming up", r.upcoming.map((d) => `${d.title}, due ${d.dueOn}`), "Nothing upcoming."),
    ...section("Waiting on you", r.pending, "Nothing is waiting on you."),
    ...section("Coordinator updates", r.updates.map((x) => `${x.at.slice(0, 10)}: ${x.text}`), "No updates in this month."),
    { text: "This report covers administration only. For medical, legal or tax questions, please speak to the relevant professional.", size: 9, gap: 16 },
  ]);
  return new NextResponse(new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" }), { headers: { "content-disposition": `attachment; filename="ally-report-${month}.pdf"`, "cache-control": "private, no-store" } });
}
