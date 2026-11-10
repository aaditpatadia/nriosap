import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeCategoriser, decide, MockCategoriser, OUTPUT_SCHEMA, toReading, type Reading } from "@/lib/wa-categorise";
import { detectEmergency } from "@/lib/wa-emergency";
import { normaliseCommand, readCommand } from "@/lib/wa-keywords";
import { mediaAllowed, parseWebhook } from "@/lib/wa-parse";
import { e164FromWa, phoneHash } from "@/lib/wa-phone";
import { REPLY_KINDS, renderTemplate, replyText, WA_TEMPLATES } from "@/lib/wa-templates";
import { isEmergency } from "@/lib/rules";
import { verifySignature } from "@/lib/whatsapp";
import { EMERGENCY, NOT_EMERGENCY } from "./fixtures/emergency-messages";

const LANGS = ["English", "Hindi", "Gujarati", "Marathi"] as const;

describe("signature on the raw body", () => {
  const body = JSON.stringify({ entry: [] });
  const sig = (b: string, s = "secret") => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;
  it("accepts a valid signature", () => expect(verifySignature(body, sig(body), "secret")).toBe(true));
  it("rejects a signature made with another secret", () => expect(verifySignature(body, sig(body, "other"), "secret")).toBe(false));
  it("rejects a missing or malformed header", () => {
    expect(verifySignature(body, null, "secret")).toBe(false);
    expect(verifySignature(body, "sha1=abc", "secret")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "secret")).toBe(false);
  });
  it("rejects a body changed after signing", () => expect(verifySignature(`${body} `, sig(body), "secret")).toBe(false));
});

describe("emergency test set", () => {
  for (const lang of LANGS) {
    it(`has at least 25 realistic ${lang} messages`, () => expect(EMERGENCY[lang].length).toBeGreaterThanOrEqual(25));
    it.each(EMERGENCY[lang])(`${lang} flags: %s`, (t) => expect(detectEmergency(t)).toBe(true));
    it.each(NOT_EMERGENCY[lang])(`${lang} leaves alone: %s`, (t) => expect(detectEmergency(t)).toBe(false));
  }
  it("catches everything the older check catches in its own tests", () => {
    for (const t of ["Papa was rushed to hospital", "He is unconscious", "gir gaye bathroom me", "मां बेहोश हो गई", "તેઓ બેભાન છે", "आई बेशुद्ध आहे", "Please send an ambulance", "એમ્બ્યુલન્સ બોલાવો"]) {
      expect(isEmergency(t)).toBe(true);
      expect(detectEmergency(t)).toBe(true);
    }
  });
});

describe("keyword commands", () => {
  it.each(["STOP", "stop.", "Stop!", "band karo", "Band Karo", "बंद करो", "ruko", "रुको", "bandh karo", "બંધ કરો", "बंद करा", "थांबा", "pathvu naka", "unsubscribe", "Please withdraw my consent"])("STOP: %s", (t) => expect(readCommand(t).kind).toBe("stop"));
  it.each(["please stop by the bank", "bus stop near the hospital", "band baja", "light band ho gayi hai", "thanks"])("not STOP: %s", (t) => expect(readCommand(t).kind).not.toBe("stop"));
  it("reads START, YES, PERSON ONLY, NO and HUMAN", () => {
    expect(readCommand("START").kind).toBe("start");
    expect(readCommand("haan").kind).toBe("consent_yes");
    expect(readCommand("હા").kind).toBe("consent_yes");
    expect(readCommand("होय").kind).toBe("consent_yes");
    expect(readCommand("person only").kind).toBe("consent_person_only");
    expect(readCommand("नहीं").kind).toBe("consent_no");
    expect(readCommand("HUMAN").kind).toBe("human");
  });
  it("reads quote decisions with a reference", () => {
    expect(readCommand("APPROVE ALY-1001")).toEqual({ kind: "approve", ref: "ALY-1001" });
    expect(readCommand("approve aly 1001")).toEqual({ kind: "approve", ref: "ALY-1001" });
    expect(readCommand("UNDO ALY-1001")).toEqual({ kind: "undo", ref: "ALY-1001" });
    expect(readCommand("decline ALY-1002")).toEqual({ kind: "decline", ref: "ALY-1002" });
    expect(readCommand("please approve everything").kind).toBe("none");
  });
  it("reads link codes", () => expect(readCommand("LINK 123456")).toEqual({ kind: "link", code: "123456" }));
  it("normalises punctuation and the danda", () => expect(normaliseCommand(" बंद करो। ")).toBe("बंद करो"));
});

const wrap = (value: object) => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "messages", value }] }] });

describe("webhook parsing", () => {
  it("reads text, photo, PDF, voice, replies and unsupported types", () => {
    const { messages } = parseWebhook(wrap({
      contacts: [{ wa_id: "919800000001", profile: { name: "K" } }],
      messages: [
        { from: "919800000001", id: "w1", timestamp: "1762750000", type: "text", text: { body: "hello" }, context: { id: "wout" } },
        { from: "919800000001", id: "w2", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "bill" } },
        { from: "919800000001", id: "w3", type: "document", document: { id: "m2", mime_type: "application/pdf", filename: "p.pdf" } },
        { from: "919800000001", id: "w4", type: "audio", audio: { id: "m3", mime_type: "audio/ogg; codecs=opus" } },
        { from: "919800000001", id: "w5", type: "video", video: { id: "m4", mime_type: "video/mp4" } },
        { from: "919800000001", id: "w6", type: "sticker", sticker: { id: "m5" } },
      ],
    }));
    expect(messages.map((m) => m.type)).toEqual(["text", "image", "document", "audio", "other", "other"]);
    expect(messages[0]).toMatchObject({ text: "hello", replyTo: "wout", profileName: "K", timestamp: "1762750000" });
    expect(messages[1]).toMatchObject({ mediaId: "m1", text: "bill" });
  });
  it("reads delivery receipts separately", () => {
    const { messages, statuses } = parseWebhook(wrap({ statuses: [{ id: "o1", status: "delivered" }, { id: "o2", status: "failed", errors: [{ code: 131047 }] }, { id: "o3", status: "weird" }] }));
    expect(messages).toEqual([]);
    expect(statuses).toEqual([{ wamid: "o1", status: "delivered", errorCode: null }, { wamid: "o2", status: "failed", errorCode: 131047 }]);
  });
  it("survives junk", () => {
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook({ entry: "x" })).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook(wrap({ messages: [{ id: 1 }, { from: "9" }] })).messages).toEqual([]);
  });
});

describe("media rules", () => {
  it("allows only images, PDF and audio", () => {
    expect(mediaAllowed("image", "image/jpeg")).toBe(true);
    expect(mediaAllowed("document", "application/pdf")).toBe(true);
    expect(mediaAllowed("audio", "audio/ogg; codecs=opus")).toBe(true);
    expect(mediaAllowed("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(mediaAllowed("image", "image/gif")).toBe(false);
    expect(mediaAllowed("other", "video/mp4")).toBe(false);
    expect(mediaAllowed("audio", null)).toBe(false);
  });
});

describe("phone numbers", () => {
  it("normalises Meta's digits to E.164 and hashes without the number", () => {
    process.env.APP_ENCRYPTION_KEY = "unit-test-encryption-key-at-least-32-bytes";
    expect(e164FromWa("919800000001")).toBe("+919800000001");
    expect(e164FromWa("12")).toBeNull();
    const h = phoneHash("+919800000001");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("9800000001");
    expect(phoneHash("919800000001")).toBe(h);
  });
});

const reading = (over: Partial<Reading> = {}, c = 0.95): Reading => ({
  category: "Bills and Renewals", title: "Pay the bill", facts: { amounts: [], dates: [], biller: null, consumerNumber: null, policyNumber: null, property: null, person: null },
  language: "English", urgency: "normal", needsProfessional: false, confidence: { category: c, title: c, language: c, urgency: c, licensed_professional_needed: c }, model: "m", promptVersion: "p", ...over,
});

describe("rules enforced in code", () => {
  it("emergency runs first, whatever the model says", () => expect(decide("Papa fell down", reading()).category).toBe("emergency"));
  it("any field under 90% needs a person", () => {
    const d = decide("Please pay the bill", reading({ confidence: { ...reading().confidence, title: 0.89 } }));
    expect(d.needsHuman).toBe(true);
    expect(d.lowFields).toEqual(["title"]);
  });
  it("a confident reading of a plain request goes straight through", () => expect(decide("Please pay the electricity bill", reading()).needsHuman).toBe(false));
  it("unlawful requests are refused by the request engine rules", () => expect(decide("Please pay a bribe to the clerk", reading()).refused).toMatch(/bribe/));
  it("advice questions are flagged for a professional", () => expect(decide("Should I sell the flat?", reading()).needsProfessional).toBe(true));
  it("with no reading at all it falls back to a plain human task", () => expect(decide("hello", null)).toMatchObject({ category: "unclear", needsHuman: true }));
});

describe("categoriser", () => {
  it("asks for structured output with refusal fallback and the model from env", async () => {
    let body: Record<string, any> = {};
    const client = { beta: { messages: { create: async (b: object) => { body = b as Record<string, any>; return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sample) }] }; } } } };
    const r = await new ClaudeCategoriser(client, "model-from-env").categorise("Pay the BESCOM bill of Rs 2,310 by 2026-12-01");
    expect(body.model).toBe("model-from-env");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toContain("server-side-fallback-2026-07-01");
    expect(body.output_config.format.schema).toBe(OUTPUT_SCHEMA);
    expect(r.category).toBe("Bills and Renewals");
    expect(r.facts.dates).toEqual(["2026-12-01"]);
    expect(r.confidence.amounts).toBe(0.97);
  });
  it("a refusal is an error the pipeline turns into a human task", async () => {
    const client = { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } };
    await expect(new ClaudeCategoriser(client, "m").categorise("x")).rejects.toThrow("refusal");
  });
  it("drops dates that are not YYYY-MM-DD and strips em dashes from titles", () => {
    const r = toReading({ ...sample, title: { value: "Bill — due soon", confidence: 0.9 }, dates: { value: ["15 Dec", "2026-12-15"], confidence: 0.9 } }, "m");
    expect(r.facts.dates).toEqual(["2026-12-15"]);
    expect(r.title).not.toMatch(/—/);
  });
  it("the mock scores [lowconf] under the line", async () => expect(Math.min(...Object.values((await new MockCategoriser().categorise("[lowconf] pay the bill")).confidence))).toBeLessThan(0.9));
});

const sample = {
  category: { value: "Bills and Renewals", confidence: 0.96 }, title: { value: "Pay the BESCOM electricity bill", confidence: 0.95 }, language: { value: "English", confidence: 0.99 },
  urgency: { value: "normal", confidence: 0.9 }, licensed_professional_needed: { value: false, confidence: 0.99 }, amounts: { value: ["Rs 2,310"], confidence: 0.97 },
  dates: { value: ["2026-12-01"], confidence: 0.96 }, biller: { value: "BESCOM", confidence: 0.95 }, consumer_number: { value: null, confidence: 0 }, policy_number: { value: null, confidence: 0 },
  property: { value: null, confidence: 0 }, person: { value: null, confidence: 0 },
};

describe("replies and templates", () => {
  it("every reply exists in all four languages, names the coordinator and has no em dash", () => {
    for (const k of REPLY_KINDS) for (const l of LANGS) {
      const t = replyText(k, l, { name: "Kusum", coordinator: "Meera", ref: "ALY-1001" });
      expect(t).not.toMatch(/[–—]/);
      expect(t.length).toBeLessThan(600);
      if (!["unknown", "emergency_unknown", "consent_prompt", "consent_declined", "stopped", "unsupported_media", "too_big", "linked", "link_failed", "approval_not_owner", "undone", "approval_failed"].includes(k)) expect(t).toContain("Meera");
    }
  });
  it("replies promise no outcome", () => {
    for (const k of REPLY_KINDS) for (const l of LANGS) expect(replyText(k, l, { coordinator: "Meera" })).not.toMatch(/\b(guarantee|definitely|will be approved|will be paid)\b/i);
  });
  it("templates have a text in every language with the right number of variables", () => {
    for (const t of WA_TEMPLATES) for (const l of LANGS) {
      const n = new Set(t.text[l].match(/\{\{\d+\}\}/g)).size;
      expect(n).toBe(t.vars.length);
      expect(renderTemplate(t, l, t.vars.map(() => "x"))).not.toMatch(/\{\{/);
    }
  });
  it("every template is listed for Meta submission in docs/whatsapp-templates.md", () => {
    const doc = readFileSync(path.join(import.meta.dirname, "..", "docs", "whatsapp-templates.md"), "utf8");
    for (const t of WA_TEMPLATES) {
      expect(doc).toContain(t.name);
      for (const l of LANGS) expect(doc).toContain(t.text[l]);
    }
  });
});

describe("no path can pay, sign, file or approve on its own", () => {
  const dir = path.join(import.meta.dirname, "..", "lib");
  const files = readdirSync(dir).filter((f) => /^wa-(pipeline|categorise|outbox|inbox|sender|parse|keywords|templates|emergency|phone)\.ts$/.test(f));
  const src = Object.fromEntries(files.map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));
  it("no WhatsApp module reaches the payment partner or approval execution", () => {
    for (const [f, s] of Object.entries(src)) {
      expect(s, f).not.toMatch(/paymentPartner|from "\.\/payments"|runApprovedActions|confirm_parent_consent|executed_at\s*=/);
    }
  });
  it("only the owner's own command reaches decide_approval, and only from a linked number", () => {
    const uses = Object.entries(src).filter(([, s]) => /decide_approval|undo_approval/.test(s)).map(([f]) => f);
    expect(uses).toEqual(["wa-pipeline.ts"]);
    expect(src["wa-pipeline.ts"]).toMatch(/c\.s\.kind !== "owner" \|\| !c\.s\.verifiedOwner/);
  });
  it("the AI reading has no action in it", () => {
    expect(Object.keys(OUTPUT_SCHEMA.properties).sort()).toEqual(["amounts", "biller", "category", "consumer_number", "dates", "language", "licensed_professional_needed", "person", "policy_number", "property", "title", "urgency"]);
  });
  it("sending only happens in the outbox, behind the flag", () => {
    for (const [f, s] of Object.entries(src)) if (f !== "wa-outbox.ts") expect(s, f).not.toMatch(/\bsendText\(|\bsendTemplate\(/);
    expect(src["wa-outbox.ts"]).toMatch(/if \(!sendingEnabled\(\)\)/);
  });
});
