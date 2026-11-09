import { redirect } from "next/navigation";
import { demoSignIn } from "./actions";
import { SiteHeader } from "@/components/SiteHeader";
import { SignInForms } from "@/components/SignInForms";
import { getViewer, safeNext } from "@/lib/auth";
import { DEMO_PEOPLE, demoLoginEnabled } from "@/lib/demo-login";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getViewer()) redirect(safeNext(sp.next));
  const demo = demoLoginEnabled();
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-xl gap-6 px-4 pb-24 pt-6">
        <h1 className="text-[length:var(--text-h1)] font-bold">Sign in</h1>
        {sp.error && <p role="alert" className="text-danger">{sp.error === "demo" ? "That demo sign-in did not work. Is the local stack running?" : "That link has expired or was already used. Please ask for a new one."}</p>}
        {demo && (
          <section aria-labelledby="demo-in" className="card grid gap-4" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
            <h2 id="demo-in" className="text-[length:var(--text-h2)] font-bold">Try the demo</h2>
            <p className="text-muted">Local only. Pick who to be. No email or password needed.</p>
            <div className="grid gap-3">
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
        <SignInForms next={safeNext(sp.next)} />
      </main>
    </>
  );
}
