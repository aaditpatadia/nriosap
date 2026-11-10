import Link from "next/link";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fromNow } from "@/lib/format";
import { conversations } from "@/lib/wa-inbox";

export const metadata = { title: "WhatsApp inbox" };

const STATUS: Record<string, { label: string; tone?: string }> = {
  received: { label: "Received" }, processing: { label: "Reading" }, held_consent: { label: "Waiting for consent", tone: "warn" }, rate_limited: { label: "Too many at once", tone: "warn" },
  needs_human: { label: "Needs a person", tone: "danger" }, routed: { label: "On a request", tone: "ok" }, waiting_plan: { label: "Waiting for plan", tone: "warn" }, confirmed: { label: "Checked", tone: "ok" },
  spam: { label: "Spam" }, rejected: { label: "File refused" }, stopped: { label: "STOP", tone: "danger" }, command: { label: "Reply word" },
};
const WHO: Record<string, string> = { owner: "Owner", parent: "Parent", member: "Family member", contact: "WhatsApp contact", unknown: "Unknown number" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const status = sp.status === "all" ? undefined : (sp.status ?? "open");
  const list = await conversations({ status });
  return (
    <>
      <PageHeader title="WhatsApp inbox" sub="Every message that reaches Ally on WhatsApp. Emergencies first, then anything that needs a person." />
      <Tabs items={[{ href: "/ops/whatsapp", label: "Needs a person", active: status === "open" }, { href: "/ops/whatsapp?status=all", label: "All", active: !status }, { href: "/ops/whatsapp/outbox", label: "Outbox", active: false }]} />
      {list.length === 0 && <Empty title="Nothing here." />}
      {list.length > 0 && (
        <div className="table-box">
          <table className="data-table">
            <caption className="sr-only">WhatsApp conversations, emergencies first</caption>
            <thead><tr><th>Sender</th><th>Last message</th><th>Category</th><th>Confidence</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.key} data-testid="wa-conversation">
                  <td>
                    <Link className="font-semibold" href={`/ops/whatsapp/${c.key}`}>{c.senderName ?? `Number ending ${c.tail}`}</Link>
                    <p className="text-[length:var(--text-small)] text-muted">{WHO[c.senderKind] ?? c.senderKind}{c.familyName ? ` · ${c.familyName}` : ""}</p>
                  </td>
                  <td className="max-w-[28ch] truncate">{c.lastText ?? (c.lastType === "audio" ? "Voice note" : c.lastType === "image" ? "Photo" : c.lastType === "document" ? "Document" : "Message")}</td>
                  <td>{c.emergency ? <span className="chip" data-tone="danger">Emergency</span> : (c.category ?? "Not read")}</td>
                  <td>{c.confidence === null ? "None" : `${Math.round(c.confidence * 100)}%`}</td>
                  <td><span className="chip" data-tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label ?? c.status}</span>{c.open > 1 && <span className="ml-1 text-muted">+{c.open - 1}</span>}</td>
                  <td>{fromNow(c.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
