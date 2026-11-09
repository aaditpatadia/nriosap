import { describe, expect, it, vi } from "vitest";
import { isEmergency, looksLikeAdvice } from "@/lib/rules";
import { LANGUAGE_CODE, MockTranscriber, SarvamTranscriber } from "@/lib/transcribe";
import { allowedMediaHost, insideServiceWindow, parseInboundAll } from "@/lib/whatsapp";

const wrap = (m: object) => ({ entry: [{ changes: [{ value: { messages: [m] } }] }] });

describe("parseInboundAll", () => {
  it("reads text, image, document and voice", () => {
    expect(parseInboundAll(wrap({ from: "91", id: "a", type: "text", text: { body: "hi" } }))[0].type).toBe("text");
    expect(parseInboundAll(wrap({ from: "91", id: "b", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "bill" } }))[0]).toMatchObject({ type: "image", mediaId: "m1", text: "bill" });
    expect(parseInboundAll(wrap({ from: "91", id: "c", type: "document", document: { id: "m2", filename: "p.pdf" } }))[0]).toMatchObject({ type: "document", filename: "p.pdf" });
    expect(parseInboundAll(wrap({ from: "91", id: "d", type: "audio", audio: { id: "m3", mime_type: "audio/ogg" } }))[0]).toMatchObject({ type: "audio", mediaId: "m3" });
  });
  it("ignores status updates and junk", () => {
    expect(parseInboundAll({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(parseInboundAll(null)).toEqual([]);
    expect(parseInboundAll(wrap({ from: "91", id: "e", type: "reaction" }))).toEqual([]);
  });
});

describe("24 hour window", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("is open under 24 hours and closed after", () => {
    expect(insideServiceWindow("2026-11-08T11:00:00Z", now)).toBe(true);
    expect(insideServiceWindow("2026-11-08T09:00:00Z", now)).toBe(false);
    expect(insideServiceWindow(undefined, now)).toBe(false);
  });
});

describe("media host allowlist", () => {
  it("only Meta hosts get the token", () => {
    expect(allowedMediaHost("https://lookaside.fbsbx.com/whatsapp/x")).toBe(true);
    expect(allowedMediaHost("https://evil.example/x")).toBe(false);
    expect(allowedMediaHost("http://lookaside.fbsbx.com/x")).toBe(false);
    expect(allowedMediaHost("https://fbsbx.com.evil.example/x")).toBe(false);
    expect(allowedMediaHost("not a url")).toBe(false);
  });
});

describe("extended advice filter", () => {
  it.each([
    "You need to take this medicine twice a day",
    "Please double your dose tonight",
    "You will win this case",
    "You should go ahead with the surgery",
    "No need to pay tax on this",
    "आपको यह दवा लेनी चाहिए",
    "dawa band kar do",
    "આ દવા લેવી જોઈએ",
    "हे औषध घ्या",
  ])("blocks: %s", (t) => expect(looksLikeAdvice(t)).toBe(true));
  it.each([
    "Please send the discharge summary when you can",
    "Your appointment with the doctor is at 11",
    "The bill for Rs 4,200 is due on 15 Nov",
    "बिल की फोटो भेज दीजिए",
    "Please speak to your doctor about this",
  ])("allows: %s", (t) => expect(looksLikeAdvice(t)).toBe(false));
});

describe("extended emergency detection", () => {
  it.each(["Papa was rushed to hospital", "He is unconscious", "gir gaye bathroom me", "मां बेहोश हो गई", "તેઓ બેભાન છે", "आई बेशुद्ध आहे"])("flags: %s", (t) => expect(isEmergency(t)).toBe(true));
  it("does not flag an ordinary hospital errand", () => expect(isEmergency("Please collect the bill from the hospital desk")).toBe(false));
});

describe("transcription", () => {
  it("language comes from the parent profile", () => {
    expect(LANGUAGE_CODE.Gujarati).toBe("gu-IN");
    expect(LANGUAGE_CODE.Marathi).toBe("mr-IN");
  });
  it("mock says it is not configured rather than inventing text", async () => {
    expect(await new MockTranscriber().transcribe()).toEqual({ status: "not_configured" });
  });
  it("sends language and key to Sarvam, and reads the transcript", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcript: "namaste" })));
    vi.stubGlobal("fetch", f);
    const r = await new SarvamTranscriber("k", "http://x/stt", "saaras:v4").transcribe({ bytes: new Uint8Array([1]), mime: "audio/ogg", language: "Hindi" });
    expect(r).toEqual({ status: "done", text: "namaste" });
    expect(f.mock.calls[0][1].headers["api-subscription-key"]).toBe("k");
    expect(f.mock.calls[0][1].body.get("language_code")).toBe("hi-IN");
    vi.unstubAllGlobals();
  });
  it("a failed call is reported as failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 500 })));
    expect(await new SarvamTranscriber("k", "http://x").transcribe({ bytes: new Uint8Array([1]), mime: "audio/ogg", language: "Hindi" })).toEqual({ status: "failed" });
    vi.unstubAllGlobals();
  });
});
