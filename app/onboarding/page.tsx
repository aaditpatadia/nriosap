import { SiteHeader } from "@/components/SiteHeader";
import { OnboardingForm } from "@/components/OnboardingForm";
import { requireViewer } from "@/lib/auth";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function Onboarding() {
  await requireViewer("/onboarding");
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap grid gap-6 pb-24 pt-8">
        <OnboardingForm />
      </main>
    </>
  );
}
