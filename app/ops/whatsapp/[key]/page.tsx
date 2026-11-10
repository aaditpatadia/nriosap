import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton, MessageActions, ReplyBox } from "@/components/WhatsAppInbox";
import { Facts, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtShort, fmtTime } from "@/lib/format";
import { SERVICE_CATEGORIES } from "@/lib/request-engine";
import { CHECK_THRESHOLD } from "@/lib/wa-categorise";
import { CATEGORY_OPTIONS, conversation, type ThreadMessage } from "@/lib/wa-inbox";

export const metadata = { title: "WhatsApp conversation" };

const OUT: Record<string, { label: string; tone?: string }> = {
  would_send: { label: "Would send. Sending is off", tone: "warn" }, queued: { label: "Queued" }, sent: { label: "Sent", tone: "ok" }, delivered: { label: "Delivered", tone: "ok" },
  read: { label: "Read", tone: "ok" }, failed: { label: "Failed", tone: "danger" }, blocked: { label: "Not sent", tone: "danger" },
};
const AI: Record<string, string> = { not_run: "Not read", done: "Read by AI", refused: "AI declined. A person reads it", failed: "AI unavailable. A person reads it", skipped_consent: "No AI consent. A person reads it", skipped_voice: "Voice note. Never sent to AI", skipped_rules: "Handled by fixed rules" };
const FACT_LABEL: Record<string, string> = { amounts: "Amounts", dates: "Dates", biller: "Biller", consumerNumber: "Consumer number", policyNumber: "Policy number", property: "Property", person: "Person" };

function Reading({ m }: { m: ThreadMessage }) {
  const facts = m.facts ? Object.entries(m.facts).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => [FACT_LABEL[k] ?? k, Array.isArray(v) ? v.join(", ") : String(v)] as [string, string]) : [];
  const low = Object.entries(m.fieldConfidence).filter(([, c]) => c < CHECK_THRESHOLD);
  return (
    <aside className="card grid content-start gap-2" aria-label="AI reading">
      <p className="font-semibold">AI reading</p>
      <p className="text-[length:var(--text-small)] text-muted">{AI[m.aiStatus] ?? m.aiStatus}</p>
      <Facts items={[
        ["Category", m.category ?? "None"],
        ["Confidence", m.confidence === null ? "None" : `${Math.round(m.confidence * 100)}%`],
        ["Title", m.title],
        ["Urgency", m.urgency],
        ["Licensed professional", m.needsProfessional ? "Needed. Do not advise" : null],
        ...facts,
        ["Model", m.model],
        ["Prompt version", m.promptVersion],
        ["Checked by", m.reviewedBy ? `${m.reviewedBy}${m.corrected ? " (changed)" : " (confirmed)"}` : null],
      ]} />
      {low.length > 0 && <p className="text-warn text-[length:var(--text-small)]">Under 90%: {low.map(([k, c]) => `${k} ${Math.round(c * 100)}%`).join(", ")}. Check before relying on it.</p>}
    </aside>
  );
}

export default async function ConversationPage({ params }: { params: Promise<{ key: string }> }) {
  await requireStaff();
  const { key } = await params;
  const c = await conversation(key);
  if (!c) notFound();
  const services = [...SERVICE_CATEGORIES] as string[];
  return (
    <>
      <Link href="/ops/whatsapp" className="btn btn-ghost w-fit">Back to inbox</Link>
      <PageHeader title={c.senderName ?? `Number ending ${c.tail}`} sub={[c.familyName ?? "No family matched. Do not share any family details until you know who this is.", c.language, c.stopped ? "Sent STOP. Nothing can be sent." : null].filter(Boolean).join(" · ")} />
      <ol className="grid gap-3" aria-label="Conversation">
        {c.messages.map((m) => (
          <li key={m.id} className={m.direction === "in" ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]" : "grid"}>
            <div className={`card grid content-start gap-2 ${m.direction === "out" ? "justify-self-end max-w-[85%]" : ""}`} data-testid={m.direction === "in" ? "wa-in" : "wa-out"}>
              <p className="flex flex-wrap items-center gap-2 text-[length:var(--text-micro)] text-muted">
                <span>{m.direction === "in" ? "From them" : m.templateName ? `Template ${m.templateName}` : "From Ally"}</span>
                <span>{fmtShort(m.at)} {fmtTime(m.at)}</span>
                {m.direction === "out" && OUT[m.status] && <span className="chip" data-tone={OUT[m.status].tone}>{OUT[m.status].label}</span>}
                {m.direction === "in" && m.category === "emergency" && <span className="chip" data-tone="danger">Emergency</span>}
                {m.requestRef && <Link className="chip" href={`/ops/requests/${m.requestId}`}>{m.requestRef}</Link>}
              </p>
              {m.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>}
              {/* A private, per-request image, so the image optimiser must not cache it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.type === "image" && m.documentId && <img src={`/api/documents/${m.documentId}/file?preview=1`} alt={`Photo sent on WhatsApp${m.text ? `: ${m.text}` : ""}`} className="max-h-80 w-auto rounded-lg border border-line" />}
              {m.documentId && <a className="btn btn-secondary w-fit" href={`/api/documents/${m.documentId}/file`} target="_blank" rel="noreferrer">Open {m.mediaFilename ?? "file"}</a>}
              {m.hasVoice && <a className="btn btn-secondary w-fit" href={`/api/wa-media/${m.id}`} target="_blank" rel="noreferrer">Listen to voice note</a>}
              {m.hasVoice && <p className="text-[length:var(--text-small)] text-muted">{m.transcript ? `Transcript (family opted in): ${m.transcript}` : "No transcript. Please listen."}</p>}
              {m.direction === "in" && !m.text && !m.documentId && !m.hasVoice && <p className="text-muted">{m.type === "other" ? "A kind of message we do not open." : "No content kept."}</p>}
              {m.direction === "out" && m.status === "would_send" && m.text && <CopyButton id={m.id} text={m.text} />}
              {m.direction === "in" && <MessageActions id={m.id} category={m.category} categories={[...CATEGORY_OPTIONS]} services={services} requests={c.openRequests} hasRequest={!!m.requestId} knownFamily={!!c.familyId} />}
            </div>
            {m.direction === "in" && <Reading m={m} />}
          </li>
        ))}
      </ol>
      <ReplyBox conversationKey={c.key} disabled={c.stopped} inWindow={c.inWindow} />
    </>
  );
}
