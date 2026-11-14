import { describe, expect, it } from "vitest";
import { answerQuestion, type AssistantFacts } from "@/lib/assistant";
import { STARTERS } from "@/lib/assistant-kb";

const facts: AssistantFacts = {
  today: "2026-11-10", base: "/family/x",
  requests: [{ id: "r1", ref: "ALY-1", title: "Fix leak", status: "awaiting_information", statusLabel: "Awaiting Information", location: "Mumbai", completedAt: null, propertyId: null }],
  deadlines: [{ id: "d1", title: "Property tax", dueOn: "2026-11-14", status: "upcoming", propertyId: null }],
  documents: [{ id: "h", title: "Health insurance policy", category: "insurance", tags: [], expiresOn: "2027-03-14", uploadedAt: "2026-10-01T00:00:00Z", propertyId: null, extracted: {} }],
  properties: [], visits: [], approvals: [],
};
const ask = (q: string) => answerQuestion(q, facts);
const hrefs = (q: string) => (ask(q).actions ?? []).map((a) => a.href);
const labels = (q: string) => (ask(q).actions ?? []).map((a) => a.label);

describe("Ally Assistant knows the product and sends people straight there", () => {
  it("says what it can do, and offers the main places", () => {
    const a = ask("What can you do?");
    expect(a.kind).toBe("answer");
    expect(a.text).toMatch(/Mumbai/);
    expect(hrefs("What can you do?")).toEqual(expect.arrayContaining(["/family/x/requests/new", "/family/x/requests/new#voice", "/family/x/documents"]));
  });
  it("explains the voice note, lists what to say, and links to it", () => {
    const a = ask("How do I send a voice note instead of typing?");
    for (const w of ["what you need", "PIN code", "phone number", "how long", "what we carry"]) expect(a.text).toContain(w);
    expect(hrefs("How do I send a voice note instead of typing?")[0]).toBe("/family/x/requests/new#voice");
  });
  it("takes a delivery, a repair, a property check and paperwork to the right place", () => {
    expect(labels("I need a delivery in Mumbai")).toContain("Start a pick up and drop");
    expect(hrefs("I need a plumber for a leak")[0]).toContain("/requests/new?text=");
    expect(hrefs("How do I get a property checked?").some((h) => h.endsWith("/properties"))).toBe(true);
    expect(hrefs("How do I upload a document?")).toContain("/family/x/documents");
  });
  it("answers how to pay, how pricing works and how to cancel without giving out the rates", () => {
    const price = ask("How does pricing work?");
    expect(price.text).toMatch(/written quotation/);
    expect(price.text).not.toMatch(/\$|%|per 30|half hour|rider|fee of/i);
    expect(ask("How do I pay?").text).toMatch(/payment link/);
    expect(hrefs("how do i cancel my request")).toContain("/family/x/requests");
  });
  it("sends privacy, plan, approvals, family and settings questions to their pages", () => {
    expect(hrefs("How do I take a copy of my data?")).toContain("/family/x/privacy");
    expect(hrefs("How do I change my plan?")).toContain("/family/x/billing");
    expect(hrefs("Where do I approve a quotation?")).toContain("/family/x/approvals");
    expect(hrefs("How do I add my mother?").some((h) => h.endsWith("/details") || h.endsWith("/people"))).toBe(true);
    expect(hrefs("Where is the monthly report?")).toContain("/family/x/report");
  });
  it("says no kindly to another city, and offers the waitlist and a person", () => {
    const a = ask("I need a plumber in Pune");
    expect(a.kind).toBe("refused");
    expect(a.text).toMatch(/only work in Mumbai/);
    expect(hrefs("I need a plumber in Pune")).toContain("/#waitlist");
    expect(hrefs("I need a plumber in Pune").some((h) => h.startsWith("https://wa.me/"))).toBe(true);
  });
  it("says no kindly to things we do not do, with a way to reach a person", () => {
    for (const q of ["Can you give me a loan?", "Can you invest my money in stocks?", "Can you send money to my brother?"]) {
      const a = ask(q);
      expect(a.kind, q).toBe("refused");
      expect(a.text, q).toMatch(/not something we do|do not handle/);
      expect((a.actions ?? []).some((x) => x.external), q).toBe(true);
    }
  });
  it("offers WhatsApp to talk to a person, and an email only when one is set", () => {
    const a = ask("How do I talk to a person?");
    expect(a.actions!.some((x) => x.href.includes("wa.me/918097020725"))).toBe(true);
    expect(a.actions!.some((x) => x.href.startsWith("mailto:"))).toBe(false); // none is set here, and none is invented
  });
  it("treats an emergency as one: contact emergency services first, and never pretends to be one", () => {
    const a = ask("There is an emergency, my father fell down");
    expect(a.text).toMatch(/emergency services/);
    expect(a.text).toMatch(/not an emergency service/);
  });
  it("still refuses advice and still will not pay, sign, file or approve, even in how-to words", () => {
    expect(ask("Should I sue my tenant?").kind).toBe("refused");
    expect(ask("Sue my tenant").kind).toBe("refused");
    expect(ask("Pay the electricity bill for me").kind).toBe("refused");
    expect(ask("How do I avoid paying tax on my rent?").kind).toBe("refused");
  });
  it("still answers from the person's own records when that is the question", () => {
    expect(ask("What needs my attention this week?").sources.length).toBeGreaterThan(0);
    expect(ask("Which documents are expiring?").sources[0].label).toBe("Health insurance policy");
    expect(ask("When does my health insurance expire?").text).toContain("2027-03-14");
  });
  it("never guesses: an unknown question says so and offers a person", () => {
    const a = ask("xylophone quartz");
    expect(a.kind).toBe("none");
    expect(a.actions!.some((x) => x.external)).toBe(true);
  });
  it("every suggested question gets a real answer, and every button goes somewhere real", () => {
    for (const g of STARTERS) for (const q of g.items) {
      const a = ask(q);
      expect(a.kind, q).not.toBe("none");
      for (const act of a.actions ?? []) expect(act.href, `${q}: ${act.label}`).toMatch(/^(\/|https:\/\/wa\.me\/|mailto:)/);
    }
  });
  it("is written in plain words with no long dashes", () => {
    for (const q of ["What can you do?", "How do I send a voice note?", "How does pricing work?", "I need a plumber in Pune", "Can you give me a loan?", "How do I pay?"]) {
      const a = ask(q);
      expect(a.text, q).not.toContain("—");
      for (const act of a.actions ?? []) expect(act.label, q).not.toContain("—");
    }
  });
});
