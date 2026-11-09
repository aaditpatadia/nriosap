import { notFound } from "next/navigation";
import { claimsFor, familyHours, getFamily, tasksFor, timeline } from "@/lib/store";
import { fmtShort, inr } from "@/lib/format";

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = getFamily(id);
  if (!fam) notFound();
  const events = timeline(id).filter((e) => Date.now() - new Date(e.at).getTime() < 31 * 86400000);
  const done = tasksFor(id).filter((t) => t.status === "done");
  const open = tasksFor(id).filter((t) => t.status !== "done");
  const claims = claimsFor(id);
  const hours = familyHours(id);
  return (
    <section className="grid max-w-2xl gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Monthly report for {fam.parent.name}</h1>
      <p className="text-muted">Written in plain words so you can read it in two minutes. Last 30 days.</p>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">What happened</h2>
        <p>{events.length} updates, {done.length} task{done.length === 1 ? "" : "s"} finished, {open.length} still open.</p>
        <p>Desk time spent on your family: about {hours} hours.</p>
      </div>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Claims</h2>
        {claims.map((c) => (<p key={c.id}>{c.hospital}: {c.status}{c.amountSettledInr ? `, settled ${inr(c.amountSettledInr)}` : ""}. Next check {fmtShort(c.slaDueAt)}.</p>))}
      </div>
      <div className="card grid gap-2">
        <h2 className="text-[length:var(--text-h3)] font-semibold">Coming up</h2>
        <ul className="list-disc pl-6">{open.slice(0, 5).map((t) => (<li key={t.id}>{t.title} (due {fmtShort(t.dueAt)})</li>))}</ul>
      </div>
      <p className="text-[length:var(--text-small)] text-muted">This report covers administration only. For medical, legal or tax questions, please speak to the relevant professional.</p>
    </section>
  );
}
