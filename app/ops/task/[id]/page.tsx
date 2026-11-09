import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskPanel } from "@/components/TaskPanel";
import { getFamily, getTask, timeForTask } from "@/lib/store";
import { hoursFor } from "@/lib/rules";
import { fromNow } from "@/lib/format";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = (await getTask(id));
  if (!t) notFound();
  const fam = (await getFamily(t.familyId))!;
  const entries = (await timeForTask(id));
  const hrs = hoursFor(entries);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="grid content-start gap-4">
        <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
        <h1 className="text-[length:var(--text-h1)] font-bold">{t.title}</h1>
        <div className="card grid gap-1">
          <p><strong>{fam.name}</strong>: {fam.parent.name}, {fam.parent.city}, speaks {fam.parent.language}</p>
          <p className="text-muted">Owner contact: {fam.owner.name} in {fam.owner.city}</p>
          <p className="text-muted">Due {fromNow(t.dueAt)} · hour budget {t.hourBudget} h · logged {hrs} h</p>
          {t.needsApproval && <span className="chip w-fit" data-tone="warn">Needs owner approval before action</span>}
        </div>
        <div className="card">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Time log</h2>
          <ul className="mt-2 grid gap-2">
            {entries.length === 0 && <li className="text-muted">No time logged yet.</li>}
            {entries.map((e) => (<li key={e.id}>{e.minutes} min: {e.note} <span className="text-muted">({fromNow(e.at)})</span></li>))}
          </ul>
        </div>
        <div className="card text-[length:var(--text-small)] text-muted">
          <p className="font-semibold text-ink">Reminder</p>
          <p>Never give medical, legal or tax advice. If the parent asks, route it to the doctor, CA or advocate on the family's list and note it here.</p>
        </div>
      </section>
      <TaskPanel taskId={t.id} status={t.status} />
    </div>
  );
}
