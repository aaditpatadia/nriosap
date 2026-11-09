import Link from "next/link";
import { StaffOnboardForm } from "@/components/StaffForms";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Onboard a family" };

export default async function StaffOnboard() {
  await requireStaff();
  return (
    <section className="grid gap-4">
      <Link href="/ops" className="btn btn-ghost w-fit">Back to queue</Link>
      <h1 className="text-[length:var(--text-h1)] font-bold">Onboard a family</h1>
      <p className="text-muted">Creates the owner&apos;s account and the family. The owner signs in with an emailed link and confirms their own consent. You then call the parent.</p>
      <StaffOnboardForm />
    </section>
  );
}
