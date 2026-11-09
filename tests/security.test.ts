import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hardenCookie, isLocalHost } from "@/lib/cookies";
import { demoLoginEnabled } from "@/lib/demo-login";
import { httpsTarget } from "@/lib/http";
import { safeNext } from "@/lib/auth";

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean).filter(existsSync);
const textFiles = tracked.filter((f) => !/(package-lock\.json|\.woff2?|\.png|\.jpe?g|\.ico)$/.test(f));
const source = textFiles.filter((f) => /^(app|components|lib)\/.*\.tsx?$/.test(f) || f === "proxy.ts");
const read = (f: string) => readFileSync(f, "utf8");

describe("session cookies", () => {
  const real = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" };
  const local = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
  it("are HttpOnly, Secure and SameSite=Lax on a real project", () => {
    expect(hardenCookie({ httpOnly: false, secure: false, sameSite: "none" }, real)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });
  it("stay Secure when the Auth address is missing or broken", () => {
    expect(hardenCookie({}, {}).secure).toBe(true);
    expect(hardenCookie({}, { NEXT_PUBLIC_SUPABASE_URL: "nonsense" }).secure).toBe(true);
  });
  it("skip Secure only for the local plain http emulator, and are still HttpOnly", () => {
    expect(hardenCookie({}, local)).toMatchObject({ httpOnly: true, secure: false });
  });
  it("keep the lifetime Supabase asks for", () => {
    expect(hardenCookie({ maxAge: 3600 }, real).maxAge).toBe(3600);
  });
});

describe("forcing HTTPS", () => {
  it("redirects plain http on a real host and keeps the path", () => {
    expect(httpsTarget("/family/1?x=2", "http", "ally.example")).toBe("https://ally.example/family/1?x=2");
  });
  it("leaves https and local addresses alone", () => {
    expect(httpsTarget("/", "https", "ally.example")).toBeNull();
    expect(httpsTarget("/", "http", "localhost:3100")).toBeNull();
    expect(httpsTarget("/", "http", "127.0.0.1:3100")).toBeNull();
  });
  it("recognises only real local names", () => {
    expect(isLocalHost("localhost.evil.example")).toBe(false);
    expect(isLocalHost("[::1]:3000")).toBe(true);
  });
});

describe("redirect after sign-in", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "evil", "", 42, null])("refuses %j", (v) => {
    expect(safeNext(v)).toBe("/home");
  });
  it("keeps same-site paths", () => {
    expect(safeNext("/family/1?tab=2")).toBe("/family/1?tab=2");
  });
});

describe("debug features", () => {
  it("demo sign-in cannot switch on against a real project, even with the flag left on", () => {
    expect(demoLoginEnabled({ DEMO_MODE: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
    expect(demoLoginEnabled({ DEMO_MODE: "0", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
  });
});

describe("secrets", () => {
  it("only three harmless settings are public", () => {
    const names = new Set(source.flatMap((f) => read(f).match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []));
    expect([...names].sort()).toEqual(["NEXT_PUBLIC_DESK_WHATSAPP", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });
  it("no public setting is named like a secret in .env.example", () => {
    const pub = read(".env.example").match(/^NEXT_PUBLIC_[A-Z0-9_]+/gm) ?? [];
    expect(pub.length).toBeGreaterThan(0);
    for (const n of pub) expect(n).not.toMatch(/SECRET|SERVICE|PASSWORD|TOKEN|PRIVATE/);
  });
  it(".env.example holds no values for secrets", () => {
    for (const line of read(".env.example").split("\n")) {
      if (/^[A-Z_0-9]*(KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|DSN)[A-Z_0-9]*=/.test(line)) expect(line.split("=")[1], line).toBe("");
    }
  });
  it("no env file is committed and .gitignore keeps them out", () => {
    expect(tracked.filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
    expect(read(".gitignore")).toMatch(/^\.env$/m);
    expect(read(".gitignore")).toMatch(/^\.env\*\.local$/m);
  });
  it("no file in the repository holds a live credential", () => {
    const pattern = /sk-ant-[\w-]{10,}|sk_live_\w{10,}|GOCSPX-[\w-]{10,}|AIza[\w-]{30,}|ghp_\w{30,}|github_pat_\w{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/[^:@/\s]+:[^@/\s$]{6,}@(?!127\.0\.0\.1|localhost)/;
    expect(textFiles.filter((f) => pattern.test(read(f)))).toEqual([]);
  });
  it("server-only modules that touch keys are marked so they cannot reach the browser", () => {
    for (const f of ["lib/supabase.ts", "lib/db.ts", "lib/billing.ts", "lib/security-events.ts", "lib/ratelimit.ts"]) expect(read(f), f).toContain('import "server-only"');
  });
});

describe("injection", () => {
  it("no component writes raw HTML", () => {
    expect(source.filter((f) => /dangerouslySetInnerHTML|\.innerHTML\s*=|new Function\(|\beval\(/.test(read(f)))).toEqual([]);
  });
  it("query text is never built from a request value", () => {
    const interpolated = source.flatMap((f) => (read(f).match(/\.(?:run|one|rows|query)(?:<\w+>)?\(\s*`[^`]*\$\{[^}]*\}/g) ?? []).map((m) => `${f}: ${m.slice(0, 80)}`));
    // The two allowed cases use fixed values from the code: a constant table list and a constant select.
    expect(interpolated.filter((m) => !/\$\{table\}|\$\{DOC_SELECT\}|\$\{role\}/.test(m))).toEqual([]);
  });
});
