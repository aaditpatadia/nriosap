import { describe, expect, it } from "vitest";
import { buildBriefing, categoriseDocument, greetingFor, requestTitle, understandRequest } from "@/lib/request-engine";

describe("reading a request", () => {
  it("understands the brief's own example", () => {
    const u = understandRequest("I need someone to inspect my flat in Pune. The tenant says there's a leakage problem.");
    expect(u).toMatchObject({ category: "Repairs and Local Services", location: "Pune", action: "Local visit", verdict: "ok" });
    expect(u.missing).toContain("Who should we contact there, and on what number?");
  });
  it("asks for the city when it is missing", () => {
    expect(understandRequest("Collect my degree certificate").missing).toContain("Which city in India is this in?");
  });
  it("does not ask for a city it was given, and normalises old names", () => {
    expect(understandRequest("Collect my degree in Bangalore by Friday").location).toBe("Bengaluru");
  });
  it("notices urgency", () => {
    expect(understandRequest("Urgent: water leak in the flat in Pune").urgent).toBe(true);
    expect(understandRequest("Renew the policy next month").urgent).toBe(false);
  });
  it("falls back to custom for anything unusual", () => {
    expect(understandRequest("Find the old recipe book").category).toBe("Custom Requests");
  });
  it.each([
    ["Please bribe the clerk", "bribe"],
    ["Make a fake rent receipt for me", "false documents"],
    ["Backdate the invoice please", "false documents"],
    ["Move this black money for me", "unlawfully"],
    ["Please spy on my tenant", "harms"],
    ["Sign on her behalf without her knowledge", "agreement"],
    ["Buy drugs for me", "cannot buy"],
  ])("refuses: %s", (text, why) => {
    const u = understandRequest(text);
    expect(u.verdict).toBe("not_possible");
    expect(u.reason).toContain(why);
  });
  it("explains that it cannot move money across borders", () => {
    const u = understandRequest("Please transfer money to my father from my US account");
    expect(u.verdict).toBe("not_possible");
    expect(u.reason).toContain("licensed partner");
  });
  it("routes judgement calls to a professional but still takes the request", () => {
    const u = understandRequest("Should I sell my flat in Pune?");
    expect(u.verdict).toBe("needs_professional");
    expect(u.reason).toContain("licensed professional");
  });
  it("makes short titles", () => {
    expect(requestTitle("Fix the tap. It drips all night.")).toBe("Fix the tap.");
    expect(requestTitle("a".repeat(30) + " " + "b".repeat(70)).endsWith("...")).toBe(true);
  });
});

describe("sorting documents", () => {
  it.each([
    ["policy", "scan.pdf", "insurance"],
    [undefined, "PAN card.jpg", "identity"],
    [undefined, "sale deed flat.pdf", "property"],
    [undefined, "NRE statement.pdf", "banking"],
    [undefined, "Power of Attorney.pdf", "legal"],
    [undefined, "supplier invoice.pdf", "business"],
    ["discharge_summary", "paper.pdf", "family"],
    [undefined, "photo.jpg", "other"],
  ])("%s %s is %s", (kind, title, want) => expect(categoriseDocument(kind, title)).toBe(want));
});

describe("the briefing", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const empty = { now, approvals: [], awaitingInfo: [], deadlines: [], expiring: [], completedThisMonth: 0, ownerConsentPending: false };
  it("says nothing when there is nothing real to say", () => expect(buildBriefing(empty)).toEqual([]));
  it("builds each line from the records it is given", () => {
    const lines = buildBriefing({ ...empty, approvals: [{ summary: "ALY-1: Fix tap" }], deadlines: [{ label: "Property tax", at: "2026-11-21T12:00:00Z" }], expiring: [{ title: "Health policy", at: "2026-12-01T12:00:00Z" }] }).map((l) => l.text);
    expect(lines).toEqual(["Waiting for your decision: ALY-1: Fix tap.", "Property tax is due in 12 days.", "Health policy expires in 22 days."]);
  });
  it("leaves out deadlines that are far away", () => {
    expect(buildBriefing({ ...empty, deadlines: [{ label: "Far", at: "2027-06-01T00:00:00Z" }] })).toEqual([]);
  });
  it("says when something is overdue", () => {
    expect(buildBriefing({ ...empty, deadlines: [{ label: "Bill", at: "2026-11-07T12:00:00Z" }] })[0].text).toBe("Bill was due 2 days ago.");
  });
});

describe("the greeting", () => {
  it("uses the person's time zone", () => {
    const t = new Date("2026-11-09T14:00:00Z");
    expect(greetingFor(t, "America/New_York")).toBe("morning");
    expect(greetingFor(t, "Asia/Kolkata")).toBe("evening");
  });
  it("survives a bad time zone", () => expect(["morning", "afternoon", "evening"]).toContain(greetingFor(new Date(), "Not/AZone")));
});
