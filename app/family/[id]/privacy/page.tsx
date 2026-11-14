import { notFound } from "next/navigation";
import { AccessLog } from "@/components/AccessLog";
import { DeleteFamilyForm, WithdrawParentButton } from "@/components/PrivacyControls";
import { Panel } from "@/components/ui";
import { getViewer, isStaff } from "@/lib/auth";
import { collapseLog } from "@/lib/audit-labels";
import { fmtDate } from "@/lib/format";
import { consentsFor } from "@/lib/onboarding";
import { auditLog, getCoordinator, getFamily } from "@/lib/store";
import { PURPOSE_LABEL } from "@/lib/upload-rules";
import { istDate } from "@/lib/workspace-rules";

export const metadata = { title: "Privacy" };

const SECTIONS = [["consent", "Consent"], ["activity", "Who opened what"], ["data", "Your data"]] as const;

export default async function Privacy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [viewer, consents, audit, coordinator] = await Promise.all([getViewer(), consentsFor(id), auditLog(id), getCoordinator(fam.coordinatorId)]);
  const owner = viewer?.id === fam.owner.id;
  const who = (actorId: string) => (actorId && actorId === viewer?.id ? "You" : actorId && actorId === fam.coordinatorId ? coordinator?.name ?? "Your coordinator" : actorId ? "Someone with access" : "The system");
  const rows = collapseLog(audit, who);
  const people = (["owner", "parent"] as const)
    .map((subject) => ({ subject, name: subject === "parent" && !fam.parent.isSelf ? fam.parent.name : "You", items: consents.filter((c) => c.subject === subject) }))
    .filter((p) => p.items.length > 0);
  const given = consents.filter((c) => c.grantedAt && !c.withdrawnAt).length;
  const withdrawn = consents.filter((c) => c.withdrawnAt).length;
  const last = audit[0];

  return (
    <section className="grid max-w-4xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-[length:var(--text-h1)] font-bold">Privacy and your data</h1>
        <p className="max-w-2xl text-[length:var(--text-small)] text-muted">See what you agreed to, who has looked at your records, and take a copy of everything or delete it. You are in control here.</p>
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {SECTIONS.map(([key, label]) => <a key={key} href={`#${key}`} className="chip min-h-11 px-4 hover:text-ink">{label}</a>)}
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="At a glance">
        <div className="card grid gap-1"><p className="text-[length:var(--text-micro)] text-muted">Consent</p><p className="text-[length:var(--text-h3)] font-semibold">{withdrawn > 0 ? `${withdrawn} withdrawn` : `${given} of ${consents.length} given`}</p></div>
        <div className="card grid gap-1"><p className="text-[length:var(--text-micro)] text-muted">Last activity</p><p className="text-[length:var(--text-h3)] font-semibold">{last ? fmtDate(last.at) : "None yet"}</p></div>
        <div className="card grid gap-1"><p className="text-[length:var(--text-micro)] text-muted">Your data</p><p className="text-[length:var(--text-h3)] font-semibold">{owner ? "Yours to take or delete" : "Held for the owner"}</p></div>
      </div>

      <section id="consent" aria-labelledby="consent-title" className="grid scroll-mt-6 gap-3">
        <div className="grid gap-1"><h2 id="consent-title" className="text-[length:var(--text-h2)] font-bold">Consent</h2><p className="text-[length:var(--text-small)] text-muted">Each person says yes to each use of their information. Nothing is done without it.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((p) => (
            <Panel key={p.subject} title={p.name} action={<span className="chip" data-tone={p.items.every((c) => c.grantedAt && !c.withdrawnAt) ? "ok" : p.items.some((c) => c.withdrawnAt) ? "danger" : "warn"}>{p.items.every((c) => c.grantedAt && !c.withdrawnAt) ? "All given" : p.items.some((c) => c.withdrawnAt) ? "Withdrawn" : "Not yet given"}</span>}>
              <ul className="rows">
                {p.items.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[length:var(--text-small)]">
                    <span className="min-w-0">{PURPOSE_LABEL[c.purpose]}</span>
                    <span className={`shrink-0 ${c.withdrawnAt ? "text-danger" : c.grantedAt ? "text-ok" : "text-muted"}`}>{c.withdrawnAt ? `Withdrawn ${fmtDate(c.withdrawnAt)}` : c.grantedAt ? `Given ${fmtDate(c.grantedAt)}` : "Not given"}</span>
                  </li>
                ))}
              </ul>
              {p.subject === "parent" && fam.parent.consentStatus !== "withdrawn" && (owner || isStaff(viewer)) && <WithdrawParentButton familyId={id} parentName={fam.parent.name} self={fam.parent.isSelf} />}
            </Panel>
          ))}
        </div>
        <p className="text-[length:var(--text-small)] text-muted">{fam.parent.isSelf ? "You" : fam.parent.name} can also withdraw at any time by sending STOP on WhatsApp.</p>
      </section>

      <section id="activity" aria-labelledby="activity-title" className="grid scroll-mt-6 gap-3">
        <div className="grid gap-1"><h2 id="activity-title" className="text-[length:var(--text-h2)] font-bold">Who opened what</h2><p className="text-[length:var(--text-small)] text-muted">Every time someone opens your records it is written down here. Repeats on the same day are merged.</p></div>
        <div className="card"><AccessLog rows={rows} today={istDate(new Date())} /></div>
      </section>

      <section id="data" aria-labelledby="data-title" className="grid scroll-mt-6 gap-3">
        <div className="grid gap-1"><h2 id="data-title" className="text-[length:var(--text-h2)] font-bold">Your data</h2><p className="text-[length:var(--text-small)] text-muted">It is yours. Take a copy any time, or delete it all.</p></div>
        {owner ? (
          <div className="grid gap-3">
            <Panel title="Take a copy">
              <p className="text-[length:var(--text-small)] text-muted">Everything we hold, in a file you can keep. The second file also includes your documents.</p>
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-secondary" href={`/api/family/${id}/export?format=json`} download>Download as JSON</a>
                <a className="btn btn-secondary" href={`/api/family/${id}/export?format=zip`} download>Download with files (ZIP)</a>
              </div>
            </Panel>
            <details className="card group">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 font-semibold text-danger">Delete everything</summary>
              <div className="pt-3"><DeleteFamilyForm familyId={id} familyName={fam.name} bare /></div>
            </details>
          </div>
        ) : <p className="card text-[length:var(--text-small)] text-muted">Only the account owner can take a copy of the data or delete it.</p>}
      </section>
    </section>
  );
}
