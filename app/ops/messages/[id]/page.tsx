import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageComposer, SendDraftButton } from "@/components/MessageComposer";
import { requireStaff } from "@/lib/auth";
import { fmtTime, fmtShort } from "@/lib/format";
import { getFamily } from "@/lib/store";
import { sendingEnabled } from "@/lib/wa-client";
import { lastInboundAt } from "@/lib/wa-inbound";
import { TEMPLATES, thread } from "@/lib/wa-outbound";
import { insideServiceWindow } from "@/lib/whatsapp";

export const metadata = { title: "Messages" };

const STATUS: Record<string, { label: string; tone?: string }> = {
  draft: { label: "Draft, not sent", tone: "warn" },
  blocked: { label: "Blocked: reads like advice", tone: "danger" },
  approved_not_sent: { label: "Approved. Sending is off", tone: "warn" },
  sent: { label: "Sent", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export default async function Messages({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const fam = await getFamily(id);
  if (!fam) notFound();
  const [msgs, last] = await Promise.all([thread(id), lastInboundAt(id)]);
  const open = insideServiceWindow(last, new Date());
  return (
    <section className="grid max-w-2xl gap-4">
      <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
      <h1 className="text-[length:var(--text-h1)] font-bold">Messages with {fam.parent.name}</h1>
      <p className="text-muted">{fam.parent.language} · {open ? "Inside the 24 hour window. You can reply freely." : "Outside the 24 hour window. Only template messages can go out."}</p>
      {!sendingEnabled() && <p className="card text-muted">Sending is off until WhatsApp business verification is done. Approved messages are recorded but not delivered.</p>}
      <ul className="grid gap-2 rounded-[var(--radius-card)] bg-tint p-3" aria-label="Conversation">
        {msgs.length === 0 && <li className="text-muted">No messages yet.</li>}
        {msgs.map((m) => (
          <li key={m.id} className={`grid max-w-[85%] gap-1 rounded-2xl border border-line bg-surface px-4 py-2 ${m.direction === "out" ? "justify-self-end" : ""}`}>
            <p className="break-words">{m.body}</p>
            {m.hasVoice && <p className="text-[length:var(--text-small)] text-muted">{m.transcriptStatus === "done" ? `Transcript: ${m.transcript}` : "No transcript yet. Please listen to the note."}</p>}
            {m.hasVoice && <a className="btn btn-ghost w-fit" href={`/api/messages/${m.id}/voice`} target="_blank" rel="noreferrer">Listen</a>}
            {m.documentId && <Link className="btn btn-ghost w-fit" href={`/ops/documents/${m.documentId}`}>Open document</Link>}
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--text-micro)] text-muted">
              <span>{fmtShort(m.at)} {fmtTime(m.at)}</span>
              {m.direction === "out" && STATUS[m.status] && <span className="chip" data-tone={STATUS[m.status].tone}>{STATUS[m.status].label}</span>}
            </p>
            {m.status === "draft" && <SendDraftButton id={m.id} />}
          </li>
        ))}
      </ul>
      <MessageComposer familyId={id} parentFirstName={fam.parent.name.split(" ")[0]} templates={Object.entries(TEMPLATES).map(([name, t]) => ({ name, label: t.label, preview: t.preview, params: [...t.params] }))} />
    </section>
  );
}
