import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SignInForms } from "@/components/SignInForms";
import { getViewer, safeNext } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getViewer()) redirect(safeNext(sp.next));
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-xl gap-6 px-4 pb-24 pt-6">
        <h1 className="text-[length:var(--text-h1)] font-bold">Sign in</h1>
        {sp.error && <p role="alert" className="text-danger">That link has expired or was already used. Please ask for a new one.</p>}
        <SignInForms next={safeNext(sp.next)} />
      </main>
    </>
  );
}
