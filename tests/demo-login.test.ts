import { describe, expect, it } from "vitest";
import { demoLoginEnabled } from "@/lib/demo-login";

describe("demo sign-in", () => {
  it("is on with the flag and the local emulator", () => {
    expect(demoLoginEnabled({ DEMO_MODE: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(true);
  });
  it("can never turn on against a real Supabase project", () => {
    expect(demoLoginEnabled({ DEMO_MODE: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
    expect(demoLoginEnabled({ DEMO_MODE: "1", NEXT_PUBLIC_SUPABASE_URL: "https://localhost.evil.example" })).toBe(false);
  });
  it("is off without the flag", () => {
    expect(demoLoginEnabled({ DEMO_MODE: "0", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(demoLoginEnabled({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(demoLoginEnabled({ DEMO_MODE: "1" })).toBe(false);
  });
});
