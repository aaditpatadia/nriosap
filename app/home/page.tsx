import { redirect } from "next/navigation";
import { isStaff, requireViewer } from "@/lib/auth";
import { listFamilies } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Sends each person to the right place after sign-in. */
export default async function Home() {
  const v = await requireViewer();
  if (isStaff(v)) redirect("/ops");
  const families = await listFamilies();
  redirect(families[0] ? `/family/${families[0].id}` : "/onboarding");
}
