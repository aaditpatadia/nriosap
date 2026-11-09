import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeExtractor, ExtractionError, OUTPUT_SCHEMA, toResult } from "@/lib/extract";
import { canAiActAlone } from "@/lib/rules";
import { BasicScanner, HttpScanner } from "@/lib/scan";
import { cleanTitle, sniffMime } from "@/lib/upload-rules";

const nul = { value: null, confidence: 0 };
const base = { policy_number: nul, insurer: nul, sum_insured: nul, renewal_date: nul, bill_payee: nul, amount: nul, due_date: nul, hospital: nul, admission_date: nul, discharge_date: nul };
const fake = (reply: object) => {
  const create = vi.fn().mockResolvedValue(reply);
  return { create, client: { beta: { messages: { create } } } };
};
const textReply = (o: object) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(o) }] });
const bytes = new Uint8Array([1, 2, 3]);

afterEach(() => vi.restoreAllMocks());

describe("toResult", () => {
  it("keeps only present fields and takes the lowest confidence", () => {
    const r = toResult({ ...base, kind: "policy", insurer: { value: "Demo", confidence: 0.98 }, policy_number: { value: "AB-1", confidence: 0.85 } });
    expect(r.fields).toEqual({ Insurer: "Demo", "Policy number": "AB-1" });
    expect(r.fieldConfidence["Policy number"]).toBe(0.85);
    expect(r.confidence).toBe(0.85);
  });
  it("empty extraction has zero confidence and forces a human", () => {
    const r = toResult({ ...base, kind: "report" });
    expect(r.confidence).toBe(0);
    expect(canAiActAlone("extract_fields", r.confidence)).toBe(false);
  });
  it("clamps confidence to 0..1", () => {
    expect(toResult({ ...base, kind: "bill", amount: { value: "5", confidence: 7 } }).confidence).toBe(1);
  });
  it("rejects malformed output", () => {
    expect(() => toResult({ kind: "nonsense" })).toThrow();
  });
  it("0.9 is the line for a coordinator check", () => {
    expect(canAiActAlone("extract_fields", 0.9)).toBe(true);
    expect(canAiActAlone("extract_fields", 0.89)).toBe(false);
  });
});

describe("ClaudeExtractor", () => {
  it("sends a PDF as a document block with the schema, and asks for no opinion", async () => {
    const { create, client } = fake(textReply({ ...base, kind: "policy", insurer: { value: "Demo", confidence: 0.95 } }));
    const r = await new ClaudeExtractor(client as never, "claude-opus-5-5").extract({ filename: "p.pdf", mime: "application/pdf", bytes });
    const body = create.mock.calls[0][0];
    expect(r.kind).toBe("policy");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.messages[0].content[0].type).toBe("document");
    expect(body.output_config.format.schema).toBe(OUTPUT_SCHEMA);
    expect(body.system).toMatch(/no medical, legal or tax opinion/);
    expect(body.system).toMatch(/untrusted/);
  });
  it("sends a photo as an image block", async () => {
    const { create, client } = fake(textReply({ ...base, kind: "bill" }));
    await new ClaudeExtractor(client as never).extract({ filename: "b.jpg", mime: "image/jpeg", bytes });
    expect(create.mock.calls[0][0].messages[0].content[0].type).toBe("image");
  });
  it("treats a refusal as a failed read", async () => {
    const { client } = fake({ stop_reason: "refusal", content: [] });
    await expect(new ClaudeExtractor(client as never).extract({ filename: "x", mime: "application/pdf", bytes })).rejects.toBeInstanceOf(ExtractionError);
  });
  it("never logs document text or field values", async () => {
    const secret = "VERY-SECRET-POLICY-99";
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m));
    const { client } = fake(textReply({ ...base, kind: "policy", policy_number: { value: secret, confidence: 0.95 } }));
    await new ClaudeExtractor(client as never).extract({ filename: "x", mime: "application/pdf", bytes: Buffer.from(secret) });
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(secret);
  });
});

describe("upload rules", () => {
  const pdf = Buffer.from("%PDF-1.4 hello world!");
  it("trusts bytes, not names", () => {
    expect(sniffMime(pdf)?.mime).toBe("application/pdf");
    expect(sniffMime(Buffer.from("MZ executable file bytes"))).toBeNull();
    expect(sniffMime(Buffer.from("<html><script>x</script>"))).toBeNull();
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe("jpg");
  });
  it("cleans titles", () => {
    expect(cleanTitle("C:\\Users\\x\\policy<1>.pdf")).toBe("policy1.pdf");
    expect(cleanTitle("../../etc/passwd")).toBe("passwd");
  });
});

describe("virus scan hook", () => {
  it("basic scanner catches the EICAR test string and says it is only basic", async () => {
    const s = new BasicScanner();
    expect(await s.scan(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"))).toBe("infected");
    expect(await s.scan(Buffer.from("clean"))).toBe("basic_only");
  });
  it("http scanner fails closed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await new HttpScanner("http://x").scan(bytes)).toBe("infected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ verdict: "clean" }))));
    expect(await new HttpScanner("http://x").scan(bytes)).toBe("clean");
    vi.unstubAllGlobals();
  });
});
