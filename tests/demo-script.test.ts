import { describe, expect, it } from "vitest";
import { authBase, backendReady, googleSignInEnabled } from "@/lib/backend";
import { DEMO_REPLY, DEMO_TRY, routeParentMessage } from "@/lib/demo-script";

describe("public demo routing", () => {
  it("sends each try-it message where the product would", () => {
    expect(DEMO_TRY.map(routeParentMessage)).toEqual(["advice", "emergency", "task", "stop"]);
  });
  it("puts an emergency ahead of everything else", () => {
    expect(routeParentMessage("Chest pain, which tablet?")).toBe("emergency");
  });
  it("never answers an advice question", () => {
    expect(routeParentMessage("Should I pay this tax?")).toBe("advice");
    expect(DEMO_REPLY.advice.parent).toContain("cannot answer");
  });
  it("has no em dashes in its copy", () => {
    expect(JSON.stringify(DEMO_REPLY)).not.toContain("—");
  });
});

describe("deployment flags", () => {
  const ready = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", DATABASE_URL: "postgres://x" };
  it("needs every backend setting", () => {
    expect(backendReady(ready)).toBe(true);
    expect(backendReady({ ...ready, DATABASE_URL: undefined })).toBe(false);
    expect(backendReady({})).toBe(false);
  });
  it("shows Google only when flagged and the backend exists", () => {
    expect(googleSignInEnabled({ ...ready, GOOGLE_SIGNIN: "1" })).toBe(true);
    expect(googleSignInEnabled(ready)).toBe(false);
    expect(googleSignInEnabled({ GOOGLE_SIGNIN: "1" })).toBe(false);
  });
  it("falls back to the request origin without APP_URL", () => {
    const saved = process.env.APP_URL;
    delete process.env.APP_URL;
    const req = { headers: new Headers(), nextUrl: { origin: "https://nriosap.vercel.app" } } as unknown as Parameters<typeof authBase>[0];
    expect(authBase(req)).toBe("https://nriosap.vercel.app");
    if (saved) process.env.APP_URL = saved;
  });
});
