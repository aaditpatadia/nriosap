import { describe, expect, it } from "vitest";
import { breakEvenHours, canAiActAlone, asksForAdvice, canUndo, hourBudget, hoursFor, isEmergency, isPastSla, looksLikeAdvice, marginPct, overHourBudget, requiresOwnerApproval, undoUntil } from "@/lib/rules";
import { decryptField, encryptField, maskTail } from "@/lib/crypto";
import { createHmac } from "node:crypto";
import { parseInbound, verifySignature } from "@/lib/whatsapp";

describe("approval policy", () => {
  it("money and filings always need the owner", () => {
    expect(requiresOwnerApproval("pay_bill")).toBe(true);
    expect(requiresOwnerApproval("submit_claim")).toBe(true);
    expect(requiresOwnerApproval("read_document")).toBe(false);
  });
  it("AI may never act alone on money, filings or advice", () => {
    expect(canAiActAlone("pay_bill")).toBe(false);
    expect(canAiActAlone("submit_claim")).toBe(false);
    expect(canAiActAlone("advice")).toBe(false);
  });
  it("AI extraction below 0.9 confidence needs a human", () => {
    expect(canAiActAlone("extract_fields", 0.95)).toBe(true);
    expect(canAiActAlone("extract_fields", 0.82)).toBe(false);
  });
});

describe("advice filter and emergencies", () => {
  it("blocks drafts that read as advice", () => {
    expect(looksLikeAdvice("You should stop taking the tablets")).toBe(true);
    expect(looksLikeAdvice("This is legal, go ahead")).toBe(true);
    expect(looksLikeAdvice("You owe Rs 40,000 in tax")).toBe(true);
  });
  it("allows administrative drafts", () => {
    expect(looksLikeAdvice("Namaste, I will collect the signed discharge summary tomorrow.")).toBe(false);
  });
  it("detects emergencies in English, Hindi, Gujarati and Marathi", () => {
    expect(isEmergency("Please send an ambulance")).toBe(true);
    expect(isEmergency("छाती में दर्द है")).toBe(true);
    expect(isEmergency("એમ્બ્યુલન્સ બોલાવો")).toBe(true);
    expect(isEmergency("रुग्णवाहिका हवी")).toBe(true);
    expect(isEmergency("Thanks, all fine today")).toBe(false);
  });
});

describe("undo window", () => {
  it("allows undo within 5 minutes only", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    const until = undoUntil(now);
    expect(canUndo({ status: "approved", undoUntil: until }, new Date("2026-11-09T10:04:59Z"))).toBe(true);
    expect(canUndo({ status: "approved", undoUntil: until }, new Date("2026-11-09T10:05:01Z"))).toBe(false);
    expect(canUndo({ status: "pending", undoUntil: until }, now)).toBe(false);
  });
});

describe("unit economics (matches unit_economics_model.xlsx)", () => {
  it("base hours: 45% at $40, 70% at $80, 79% at $120", () => {
    expect(marginPct(40, 4.049)).toBe(45);
    expect(marginPct(80, 4.049)).toBe(70);
    expect(marginPct(120, 4.049)).toBe(79);
  });
  it("high hours: 7% at $40, 51% at $80, 66% at $120", () => {
    expect(marginPct(40, 8.529)).toBe(7);
    expect(marginPct(80, 8.529)).toBe(51);
    expect(marginPct(120, 8.529)).toBe(66);
  });
  it("low hours: 62% at $40, 79% at $80", () => {
    expect(marginPct(40, 2.041)).toBe(62);
    expect(marginPct(80, 2.041)).toBe(79);
  });
  it("break-even is about 9.4 hours at $40", () => {
    expect(breakEvenHours(40)).toBe(9.4);
  });
  it("hour budgets follow the kill thresholds", () => {
    expect(hourBudget(79)).toBe(6);
    expect(hourBudget(40)).toBe(3.4);
    expect(overHourBudget(79, 6.5)).toBe(true);
    expect(overHourBudget(40, 3.0)).toBe(false);
  });
  it("sums minutes into hours", () => {
    expect(hoursFor([{ minutes: 75 }, { minutes: 45 }])).toBe(2);
  });
});

describe("sla", () => {
  it("flags open tasks past SLA", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    expect(isPastSla({ slaAt: "2026-11-09T09:00:00Z", status: "doing" }, now)).toBe(true);
    expect(isPastSla({ slaAt: "2026-11-09T09:00:00Z", status: "done" }, now)).toBe(false);
  });
});

describe("field encryption", () => {
  it("round-trips and isolates families", () => {
    const blob = encryptField("shah", "DIA-2291-77410");
    expect(blob).not.toContain("2291");
    expect(decryptField("shah", blob)).toBe("DIA-2291-77410");
    expect(() => decryptField("mehta", blob)).toThrow();
  });
  it("masks all but the tail", () => {
    expect(maskTail("DIA-2291-77410")).toBe("••••••••••7410");
  });
});

describe("whatsapp webhook", () => {
  const secret = "s3cret";
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919800000001", id: "wamid.1", type: "text", text: { body: "namaste" } }] } }] }] });
  it("accepts a valid signature and rejects a bad one", () => {
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, sig, secret)).toBe(true);
    expect(verifySignature(body, "sha256=00", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
  });
  it("parses text messages", () => {
    expect(parseInbound(JSON.parse(body))).toEqual([{ from: "919800000001", id: "wamid.1", text: "namaste" }]);
  });
});

describe("wider advice filter", () => {
  it.each(["You should sell the flat now", "We recommend you invest in this plot", "This is a good investment", "Capital gains is exempt here, so no need to worry"])("blocks: %s", (s) => expect(looksLikeAdvice(s)).toBe(true));
  it.each(["Should I sell my flat?", "How much tax do I owe on the rent?", "Is this legal?", "Will we win the case?", "What are my rights as the owner?", "Koi salah dijiye"])("notices a request for advice: %s", (s) => expect(asksForAdvice(s)).toBe(true));
  it.each(["Pay the property tax on our flat", "Get a certified copy of my degree", "Book a plumber for Tuesday"])("leaves ordinary work alone: %s", (s) => {
    expect(asksForAdvice(s)).toBe(false);
    expect(looksLikeAdvice(s)).toBe(false);
  });
});
