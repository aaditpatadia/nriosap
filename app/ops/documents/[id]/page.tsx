import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckForm } from "@/components/CheckForm";
import { requireStaff } from "@/lib/auth";
import { documentForCheck } from "@/lib/vault";

export const metadata = { title: "Check a document" };

export default async function CheckDocument({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const d = await documentForCheck(id);
  if (!d) notFound();
  return (
    <section className="grid gap-4">
      <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
      <h1 className="text-[length:var(--text-h1)] font-bold">Check: {d.title}</h1>
      <p className="text-muted">Prepared by AI. Compare each field with the file, correct it, then confirm. Fields under 90% are marked.</p>
      <a className="btn btn-secondary w-fit" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer">Open the file</a>
      <CheckForm doc={d} />
    </section>
  );
}
