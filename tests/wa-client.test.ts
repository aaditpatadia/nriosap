import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMedia, sendTemplate, sendText, sendingEnabled } from "@/lib/wa-client";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

function on() {
  process.env.WHATSAPP_SEND_ENABLED = "1";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.WHATSAPP_ACCESS_TOKEN = "tok";
}

describe("sending flag", () => {
  it("makes no network call while the flag is off", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    process.env.WHATSAPP_SEND_ENABLED = "0";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    expect(sendingEnabled()).toBe(false);
    expect(await sendText("+91 98000", "hello")).toEqual({ status: "disabled" });
    expect(await sendTemplate("+91 98000", "t", "hi", [])).toEqual({ status: "disabled" });
    expect(f).not.toHaveBeenCalled();
  });
  it("needs credentials as well as the flag", () => {
    process.env.WHATSAPP_SEND_ENABLED = "1";
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(sendingEnabled()).toBe(false);
  });
  it("posts the Cloud API shape when on", async () => {
    on();
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] })));
    vi.stubGlobal("fetch", f);
    expect(await sendText("+91 98000", "hello")).toEqual({ status: "sent", waId: "wamid.1" });
    expect(f.mock.calls[0][0]).toContain("/123/messages");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ messaging_product: "whatsapp", to: "9198000", type: "text", text: { body: "hello" } });
  });
  it("reports a refused send as failed", async () => {
    on();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 400 })));
    expect(await sendText("1", "x")).toEqual({ status: "failed", code: 400 });
  });
});

describe("media download", () => {
  it("will not send the token to a host outside the allowlist", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://evil.example/x", mime_type: "image/jpeg" })));
    vi.stubGlobal("fetch", f);
    expect(await downloadMedia("m1", 1000)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects media ids with path characters", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await downloadMedia("../../me", 1000)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
