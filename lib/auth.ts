import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { demoLoginEnabled } from "./demo-login";
import { currentContext, one, setDefaultContextResolver, withContext, type DbContext } from "./db";
import { supabaseServer } from "./supabase";

export type Role = "owner" | "coordinator" | "admin" | "partner";
export interface Viewer {
  id: string;
  role: Role;
  name: string;
  email: string | null;
}

/** One verified session per request. getUser() checks the token with the Auth server. */
const sessionUserId = cache(async (): Promise<string | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  return error || !data.user ? null : data.user.id;
});

setDefaultContextResolver(async (): Promise<DbContext> => {
  const id = await sessionUserId();
  return id ? { kind: "user", id } : { kind: "anon" };
});

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const ctx = await currentContext();
  if (ctx.kind !== "user") return null;
  return (await withContext(ctx, () => one<{ id: string; role: Role; name: string; email: string | null }>("select id, role, name, email from profiles where id = $1", [ctx.id]))) ?? null;
});

export async function requireViewer(next?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  return v;
}

export const isStaff = (v: Pick<Viewer, "role"> | null) => v?.role === "coordinator" || v?.role === "admin";

export async function requireStaff(): Promise<Viewer> {
  const v = await requireViewer("/ops");
  if (!isStaff(v)) redirect("/home");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer("/ops");
  if (v.role !== "admin") redirect("/ops");
  return v;
}

/** For server actions: returns the viewer or null, never redirects. */
export async function actionViewer(): Promise<Viewer | null> {
  return getViewer();
}

/** Needs the demo flag and the local Auth emulator together, so it cannot switch on against a real project. */
export const isDemoMode = () => demoLoginEnabled();

/** Only same-site relative paths are allowed as a post-sign-in target. */
export function safeNext(next: unknown, fallback = "/home"): string {
  // Browsers drop tabs and newlines, which would turn "/<tab>/evil.example" into "//evil.example".
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
