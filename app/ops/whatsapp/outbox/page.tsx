import Link from "next/link";
import { CopyButton } from "@/components/WhatsAppInbox";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { fmtShort, fmtTime } from "@/lib/format";
import { outbox } from "@/lib/wa-inbox";

export const metadata = { title: "WhatsApp outbox" };

const STATUS: Record<string, { label: string; tone?: string }> = { would_send: { label: "Would send", tone: "warn" }, queued: { label: "Queued" }, blocked: { label: "Not sent", tone: "danger" }, failed: { label: "Failed", tone: "danger" } };

export default async function Outbox() {
  await requireStaff();
  const list = await outbox();
  return (
    <>
      <PageHeader title="WhatsApp outbox" sub="Replies Ally would send. While sending is off, nothing here has reached anyone. Not sent means it was blocked: after STOP, outside the 24 hour window, or because it read like advice." />
      <Tabs items={[{ href: "/ops/whatsapp", label: "Needs a person", active: false }, { href: "/ops/whatsapp?status=all", label: "All", active: false }, { href: "/ops/whatsapp/outbox", label: "Outbox", active: true }]} />
      {list.length === 0 && <Empty title="The outbox is empty." />}
      <ul className="grid gap-3" aria-label="Outbox">
        {list.map((o) => (
          <li key={o.id} className="card grid gap-2" data-testid="wa-outbox">
            <p className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] text-muted">
              <span className="chip" data-tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label ?? o.status}</span>
              <Link className="underline" href={`/ops/whatsapp/${o.key}`}>{o.familyName ?? "Unknown number"} · ending {o.tail ?? "?"}</Link>
              <span>{fmtShort(o.at)} {fmtTime(o.at)}</span>
              {o.templateName && <span>Template {o.templateName}</span>}
              {o.copiedAt && <span>Copied {fmtTime(o.copiedAt)}</span>}
            </p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{o.text}</p>
            {o.status === "would_send" && <CopyButton id={o.id} text={o.text} />}
          </li>
        ))}
      </ul>
    </>
  );
}
