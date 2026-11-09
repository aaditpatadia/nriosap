import Link from "next/link";
import { NewTaskForm } from "@/components/NewTaskForm";
import { requireStaff } from "@/lib/auth";
import { templates } from "@/lib/ops";
import { listFamilies } from "@/lib/store";

export const metadata = { title: "New task" };

export default async function NewTask() {
  await requireStaff();
  const [fams, tpl] = await Promise.all([listFamilies(), templates()]);
  return (
    <section className="grid gap-4">
      <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
      <h1 className="text-[length:var(--text-h1)] font-bold">New task from a template</h1>
      <NewTaskForm families={fams.map((f) => ({ id: f.id, name: f.name }))} templates={tpl.map((t) => ({ id: t.id, label: `${t.name} (${t.hourBudget} h budget)` }))} />
    </section>
  );
}
