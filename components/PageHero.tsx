import { Kinetic } from "./Kinetic";
import { ThreadArc } from "./ThreadArc";

/** The dark opening band used by the public pages. */
export function PageHero({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="band wrap relative overflow-hidden py-14 lg:py-20">
      <span aria-hidden className="aurora" />
      <ThreadArc className="page-arc" />
      <div className="relative grid max-w-3xl gap-3">
        <h1 className="text-[length:var(--text-display)] font-extrabold"><Kinetic text={title} /></h1>
        {lead && <div className="rise text-muted">{lead}</div>}
        {children}
      </div>
    </section>
  );
}
