/**
 * One-click sign-in for local demos. It needs the demo flag and the local Auth emulator together,
 * so it cannot appear on a real Supabase project, even if DEMO_MODE is left on there.
 */
export function demoLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DEMO_MODE !== "1" || !env.NEXT_PUBLIC_SUPABASE_URL) return false;
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname);
  } catch {
    return false;
  }
}

export const DEMO_PEOPLE = [
  { id: "priya", label: "Priya, family owner", note: "Dashboard, approvals, documents, privacy", staff: false },
  { id: "meera", label: "Meera, coordinator", note: "Queue, timer, hours, messages for her families", staff: true },
  { id: "admin", label: "Aadit, admin", note: "Every family and all ops screens", staff: true },
] as const;

export type DemoPerson = (typeof DEMO_PEOPLE)[number]["id"];
export const DEMO_DOMAIN = "demo.gharsaath.test";
