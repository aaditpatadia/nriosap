import { redirect } from "next/navigation";

/** Bills & Renewals now holds the calendar. Old links keep working. */
export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/family/${id}/bills?view=calendar`);
}
