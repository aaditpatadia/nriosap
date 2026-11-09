import Link from "next/link";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";
import { SiteHeader } from "@/components/SiteHeader";
import { requireViewer } from "@/lib/auth";
import { inviteByToken } from "@/lib/family-members";

export const metadata = { title: "Your invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireViewer(`/invite/${token}`);
  const invite = await inviteByToken(token.slice(0, 100));
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap grid max-w-2xl gap-4 py-16">
        <h1 className="text-[length:var(--text-h1)] font-extrabold">{invite ? `Join ${invite.familyName}` : "This invitation is no longer valid"}</h1>
        {invite ? (
          <>
            <p className="text-muted">You have been invited to this Ally account as {invite.name}. The account owner chooses what you can see. They can change that at any time.</p>
            <AcceptInviteForm token={token} />
          </>
        ) : (
          <>
            <p className="text-muted">It may have expired or already been used. Please ask for a new one.</p>
            <Link className="btn btn-secondary w-fit" href="/home">Go to my account</Link>
          </>
        )}
      </main>
    </>
  );
}
