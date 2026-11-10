import { SiteHeader } from "@/components/SiteHeader";
import { OnboardingForm } from "@/components/OnboardingForm";
import { redirect } from "next/navigation";
import { isStaff, requireViewer } from "@/lib/auth";
import { listFamilies } from "@/lib/store";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const v = await requireViewer("/onboarding");
  // Someone already set up, for example after a refresh, goes straight to their account.
  if (isStaff(v)) redirect("/ops");
  const mine = (await listFamilies()).find((f) => f.owner.id === v.id);
  if (mine) redirect(`/family/${mine.id}`);
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap grid gap-6 pb-24 pt-8">
        <OnboardingForm />
      </main>
    </>
  );
}
