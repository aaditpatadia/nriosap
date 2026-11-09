import Link from "next/link";
import { redirect } from "next/navigation";
import { demoSignIn } from "./actions";
import { SiteHeader } from "@/components/SiteHeader";
import { PageHero } from "@/components/PageHero";
import { SignInForms } from "@/components/SignInForms";
import { getViewer, safeNext } from "@/lib/auth";
import { backendReady, emailSignInEnabled, googleSignInEnabled } from "@/lib/backend";
import { DEMO_PEOPLE, demoLoginEnabled } from "@/lib/demo-login";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  demo: "That demo sign-in did not work. Is the local stack running?",
  google: "Google sign-in did not finish. Please try again, or use the email link.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getViewer()) redirect(safeNext(sp.next));
  const demo = demoLoginEnabled();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <PageHero title="Sign in" lead={<p>Everything your family needs, in one private place.</p>} />
        <div className="wrap grid gap-6 pb-24 pt-8 lg:grid-cols-2 lg:items-start">
        {sp.error && <p role="alert" className="text-danger lg:col-span-2">{ERRORS[sp.error] ?? "That link has expired or was already used. Please ask for a new one."}</p>}
        {demo && (
          <section aria-labelledby="demo-in" className="card grid gap-4 lg:col-span-2" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
            <h2 id="demo-in" className="text-[length:var(--text-h2)] font-bold">Try the demo</h2>
            <p className="text-muted">Local only. Pick who to be. No email or password needed.</p>
            <div className="grid gap-3 md:grid-cols-3">
              {DEMO_PEOPLE.map((p) => (
                <form key={p.id} action={demoSignIn}>
                  <input type="hidden" name="who" value={p.id} />
                  <button className="btn btn-primary w-full">Open as {p.label}</button>
                  <p className="mt-1 text-center text-[length:var(--text-small)] text-muted">{p.note}</p>
                </form>
              ))}
            </div>
          </section>
        )}
        {backendReady() ? <SignInForms next={safeNext(sp.next)} google={googleSignInEnabled()} email={emailSignInEnabled()} /> : (
          <section className="card grid gap-3 lg:col-span-2">
            <h2 className="text-[length:var(--text-h2)] font-bold">Accounts are not open yet</h2>
            <p className="text-muted">We are starting with a small number of families. You can see how it works now, with a fictional family and no account.</p>
            <Link href="/demo" className="btn btn-primary w-fit">Try the live demo</Link>
          </section>
        )}
        </div>
      </main>
    </>
  );
}
