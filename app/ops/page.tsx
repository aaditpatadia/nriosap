export const dynamic = "force-dynamic";

import Link from "next/link";
import { allTasks, getCoordinator, getFamily } from "@/lib/store";
import { fromNow } from "@/lib/format";
import { isPastSla } from "@/lib/rules";

const LABEL = { todo: "To do", doing: "Doing", waiting_parent: "Waiting on parent", waiting_owner: "Waiting on owner", done: "Done" } as const;

export default function Queue() {
  const now = new Date();
  const tasks = allTasks().filter((t) => t.status !== "done").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    <section className="grid gap-4">
      <h1 className="text-[length:var(--text-h1)] font-bold">Task queue</h1>
      <div role="region" aria-label="Scrollable table" tabIndex={0} className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[length:var(--text-small)]">
          <caption className="sr-only">Open tasks sorted by due time</caption>
          <thead className="text-muted"><tr><th className="p-3">Task</th><th className="p-3">Family</th><th className="p-3">Owner</th><th className="p-3">Status</th><th className="p-3">Due</th><th className="p-3">SLA</th></tr></thead>
          <tbody>
            {tasks.map((t) => {
              const late = isPastSla(t, now);
              const emergency = t.title.startsWith("EMERGENCY");
              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="p-3"><Link className="font-semibold underline" href={`/ops/task/${t.id}`}>{t.title}</Link></td>
                  <td className="p-3">{getFamily(t.familyId)?.name}</td>
                  <td className="p-3">{getCoordinator(t.ownerId)?.name}</td>
                  <td className="p-3"><span className="chip">{LABEL[t.status]}</span></td>
                  <td className="p-3">{fromNow(t.dueAt)}</td>
                  <td className="p-3">{emergency || late ? <span className="chip" data-tone="danger">{emergency ? "Emergency" : "Past SLA"}</span> : <span className="chip" data-tone="ok">On time</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
