import { describe, expect, it, vi } from "vitest";
import { log, safeFields } from "@/lib/log";
import { isConsentWithdrawal } from "@/lib/rules";
import { scrubEvent, scrubText } from "@/lib/scrub";

describe("error scrubbing", () => {
  it("removes contact details, references and health words", () => {
    const out = scrubText("Failed for priya@x.com on +91 98000 00000 policy DIA-2291-77410 with diabetes and cardiology report");
    for (const bad of ["priya@", "98000", "2291", "diabetes", "cardiology"]) expect(out).not.toContain(bad);
  });
  it("removes Indian-script text", () => {
    expect(scrubText("value छाती में दर्द રહે")).not.toMatch(/[ऀ-ॿ઀-૿]/);
  });
  it("drops request, user, breadcrumbs and stack variables", () => {
    const e = scrubEvent({
      message: "for a@b.co",
      user: { email: "a@b.co" },
      request: { data: "secret" },
      extra: { x: 1 },
      breadcrumbs: [{ message: "m" }],
      server_name: "host",
      contexts: { runtime: { name: "node" }, app: { secret: 1 } },
      exception: { values: [{ type: "Error", value: "bad a@b.co", stacktrace: { frames: [{ vars: { policy: "x" }, context_line: "secret" }] } }] },
    });
    const text = JSON.stringify(e);
    expect(text).not.toContain("a@b.co");
    expect(text).not.toContain("secret");
    expect(e.user).toBeUndefined();
    expect(e.exception!.values![0].stacktrace!.frames![0].vars).toBeUndefined();
    expect(e.exception!.values![0].type).toBe("Error");
  });
});

describe("structured logs", () => {
  it("keeps ids and numbers, refuses free text", () => {
    const f = safeFields({ documentId: "33333333-0000-4000-8000-000000000001", ms: 12, ok: true, note: "Kusum has chest pain", phone: "+919800000001", email: "a@b.co" });
    expect(f.documentId).toBe("33333333-0000-4000-8000-000000000001");
    expect(f.ms).toBe(12);
    expect(f.note).toBe("[redacted]");
    expect(f.phone).toBe("[redacted]");
    expect(f.email).toBe("[redacted]");
  });
  it("writes one JSON line", () => {
    const s = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "x", { a: 1 });
    expect(JSON.parse(s.mock.calls[0][0] as string)).toMatchObject({ level: "info", event: "x", a: 1 });
    s.mockRestore();
  });
});

describe("consent withdrawal by message", () => {
  it.each(["STOP", "stop.", "Please withdraw my consent", "delete my data", "सहमति वापस लेना है", "સંમતિ પાછી લઉં છું", "संमती मागे घेते"])("recognises: %s", (t) => expect(isConsentWithdrawal(t)).toBe(true));
  it.each(["Please stop by tomorrow", "bus stop near the hospital", "thanks"])("ignores: %s", (t) => expect(isConsentWithdrawal(t)).toBe(false));
});
