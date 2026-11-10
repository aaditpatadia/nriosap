import Link from "next/link";
import { sendingEnabled } from "@/lib/wa-client";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      {!sendingEnabled() && (
        <p role="note" className="card" style={{ borderColor: "var(--warn, #b45309)" }}>
          <span className="font-semibold">WhatsApp sending is off.</span> Nothing is sent to anyone. Replies wait in the <Link className="underline" href="/ops/whatsapp/outbox">outbox</Link> as &ldquo;would send&rdquo;. Copy one and send it from the business phone if it cannot wait.
        </p>
      )}
      {children}
    </section>
  );
}
