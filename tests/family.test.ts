import { describe, expect, it } from "vitest";
import { CALL_SCRIPT, normalisePhone, OWNER_CONSENT_TEXT, REQUIRED_PURPOSES } from "@/lib/consent";
import { canExecute, paymentPartner, StubPaymentPartner } from "@/lib/payments";
import { PURPOSES } from "@/lib/upload-rules";

describe("phone numbers", () => {
  it("accepts Indian and international forms", () => {
    expect(normalisePhone("98000 00000")).toBe("+919800000000");
    expect(normalisePhone("+91 98000-00000")).toBe("+919800000000");
    expect(normalisePhone("00919800000000")).toBe("+919800000000");
    expect(normalisePhone("+1 (416) 555-0100")).toBe("+14165550100");
  });
  it("rejects nonsense", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("call me")).toBeNull();
  });
});

describe("consent wording", () => {
  it("has a line for every purpose in every language", () => {
    for (const lang of ["English", "Hindi", "Gujarati", "Marathi"] as const) for (const p of PURPOSES) expect(CALL_SCRIPT[lang][p]).toBeTruthy();
    for (const p of PURPOSES) expect(OWNER_CONSENT_TEXT[p]).toBeTruthy();
  });
  it("reading and storing are the minimum", () => expect(REQUIRED_PURPOSES).toEqual(["read_records", "store"]));
});

describe("payment partner", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("is a stub that moves nothing", async () => {
    expect(paymentPartner).toBeInstanceOf(StubPaymentPartner);
    const r = await paymentPartner.pay({ approvalId: "a", familyId: "f", payee: "p", amountInr: 100 });
    expect(r.status).toBe("stubbed");
  });
  it("only runs after approval and after the undo window", () => {
    expect(canExecute({ status: "pending", undoUntil: null }, now)).toBe(false);
    expect(canExecute({ status: "declined", undoUntil: "2026-11-09T09:00:00Z" }, now)).toBe(false);
    expect(canExecute({ status: "approved", undoUntil: "2026-11-09T10:01:00Z" }, now)).toBe(false);
    expect(canExecute({ status: "approved", undoUntil: "2026-11-09T09:59:00Z" }, now)).toBe(true);
    expect(canExecute({ status: "approved", undoUntil: "2026-11-09T09:59:00Z", executedAt: "2026-11-09T09:59:30Z" }, now)).toBe(false);
  });
});
