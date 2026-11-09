import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskPanel } from "@/components/TaskPanel";
import { requireStaff } from "@/lib/auth";
import { contacts, KIND_LABEL, notesFor, runningTimer } from "@/lib/ops";
import { getFamily, getTask, timeForTask } from "@/lib/store";
import { hoursFor } from "@/lib/rules";
import { fromNow } from "@/lib/format";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff();
  const t = await getTask(id);
  if (!t) notFound();
  const [fam, entries, notes, timer, partners] = await Promise.all([getFamily(t.familyId), timeForTask(id), notesFor(id), runningTimer(viewer.id), contacts()]);
  if (!fam) notFound();
  const hrs = hoursFor(entries);
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="grid content-start gap-4">
        <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
        <h1 className="text-[length:var(--text-h1)] font-bold">{t.title}</h1>
        <div className="card grid gap-1">
          <p><strong>{fam.name}</strong>: {fam.parent.name}, {fam.parent.city}, speaks {fam.parent.language}</p>
          <p className="text-muted">Owner contact: {fam.owner.name}{fam.owner.city ? ` in ${fam.owner.city}` : ""}</p>
          <p className="text-muted">Due {fromNow(t.dueAt)} · hour budget {t.hourBudget} h · logged {hrs} h</p>
          {t.needsApproval && <span className="chip w-fit" data-tone="warn">Needs owner approval before action</span>}
          <Link className="btn btn-ghost w-fit" href={`/family/${fam.id}`}>Open family</Link>
        </div>
        {t.checklist && t.checklist.length > 0 && (
          <div className="card">
            <h2 className="text-[length:var(--text-h3)] font-semibold">Steps</h2>
            <ol className="mt-2 list-decimal pl-6">{t.checklist.map((c) => <li key={c}>{c}</li>)}</ol>
          </div>
        )}
        <div className="card">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Time log</h2>
          <ul className="mt-2 grid gap-2">
            {entries.length === 0 && <li className="text-muted">No time logged yet.</li>}
            {entries.map((e) => (<li key={e.id}>{e.minutes} min: {e.note} <span className="text-muted">({fromNow(e.at)})</span></li>))}
          </ul>
        </div>
        <div className="card">
          <h2 className="text-[length:var(--text-h3)] font-semibold">Notes</h2>
          <ul className="mt-2 grid gap-2">
            {notes.length === 0 && <li className="text-muted">No notes yet.</li>}
            {notes.map((n) => (<li key={n.id}>{n.body} <span className="text-muted">({n.author}, {fromNow(n.at)})</span></li>))}
          </ul>
        </div>
        <div className="card text-[length:var(--text-small)] text-muted">
          <p className="font-semibold text-ink">Reminder</p>
          <p>Never give medical, legal or tax advice. If the parent asks, route it to the doctor, CA or advocate on the family&apos;s list and note it here.</p>
        </div>
      </section>
      <TaskPanel
        taskId={t.id}
        status={t.status}
        timerStartedAt={timer?.taskId === t.id ? timer.startedAt : undefined}
        otherTimer={!!timer && timer.taskId !== t.id}
        today={today}
        escalations={partners.map((c) => ({ id: c.id, label: `${KIND_LABEL[c.kind]}: ${c.name}`, href: c.phone ? `https://wa.me/${c.phone.replace(/\D/g, "")}` : null }))}
      />
    </div>
  );
}
