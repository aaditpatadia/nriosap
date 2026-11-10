// LOCAL ONLY. Fake third-party APIs, so the real client code runs in tests with no accounts.
// The fake "model" just pulls labelled lines out of generated sample PDFs. It says nothing about real model accuracy.
import http from "node:http";

const pick = (text, label) => text.match(new RegExp(`${label}:\\s*([^)\\n]+)`))?.[1]?.trim() ?? null;

function readDoc(body) {
  const blocks = body.messages?.[0]?.content ?? [];
  const doc = blocks.find((b) => b.type === "document" || b.type === "image");
  if (!doc) throw new Error("no document block");
  return Buffer.from(doc.source.data, "base64").toString("latin1");
}

function fakeExtract(text) {
  const conf = text.includes("[blurry]") ? 0.71 : 0.96;
  const f = (label) => {
    const value = pick(text, label);
    return { value, confidence: value ? conf : 0 };
  };
  const kind = text.includes("POLICY SCHEDULE") ? "policy" : text.includes("DISCHARGE SUMMARY") ? "discharge_summary" : text.includes("BILL") ? "bill" : "report";
  return { kind, policy_number: f("Policy No"), insurer: f("Insurer"), sum_insured: f("Sum Insured"), renewal_date: f("Renewal"), bill_payee: f("Payee"), amount: f("Amount"), due_date: f("Due"), hospital: f("Hospital"), admission_date: f("Admitted"), discharge_date: f("Discharged") };
}

// Fake WhatsApp categoriser: keywords only. "[lowconf]" scores 0.6, "[fail]" refuses. Says nothing about real accuracy.
const CAT_RULES = [
  ["emergency", /ambulance|fell down|chest pain|unconscious/i],
  ["Insurance Administration", /insurance|policy|premium|claim/i],
  ["Bills and Renewals", /bill|electricity|renew|due/i],
  ["Repairs and Local Services", /leak|plumber|repair|electrician/i],
  ["Property and Assets", /flat|tenant|property|rent/i],
  ["Documents and Government Paperwork", /pan|aadhaar|passport|certificate/i],
  ["Family and Personal Assistance", /doctor|appointment|hospital|mother|father/i],
];
function fakeCategorise(text) {
  const c = text.includes("[lowconf]") ? 0.6 : 0.95;
  const f = (value, conf = c) => ({ value, confidence: conf });
  const category = CAT_RULES.find(([, re]) => re.test(text))?.[0] ?? "unclear";
  const title = text.replace(/<\/?message>/g, "").replace(/\[(lowconf|fail)\]/g, "").trim().split(/[.?!\n]/)[0].slice(0, 70) || "WhatsApp message";
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const amounts = text.match(/(?:rs\.?|inr|₹)\s?[\d,]+/gi) ?? [];
  return { category: f(category), title: f(title), language: f("English"), urgency: f("normal"), licensed_professional_needed: f(false), amounts: f(amounts), dates: f(dates), biller: f(null, 0), consumer_number: f(null, 0), policy_number: f(null, 0), property: f(null, 0), person: f(null, 0) };
}

const JPEG_BILL = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]), Buffer.from("\n(ELECTRICITY BILL Payee: Sample Power Ltd Amount: Rs 2,310 Due: 2026-12-01)\n")]);

export async function startFakes({ port }) {
  const sent = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const json = (s, b) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/health") return json(200, { ok: true });
      if (url.pathname === "/__whatsapp_sent") return json(200, { sent });
      if (url.pathname.endsWith("/v1/messages") && req.method === "POST") {
        const body = JSON.parse(raw);
        if (!req.headers["x-api-key"] && !req.headers.authorization) return json(401, { type: "error", error: { type: "authentication_error", message: "no key" } });
        if (!body.output_config?.format?.schema || !body.system) return json(400, { type: "error", error: { type: "invalid_request_error", message: "missing format or system" } });
        if (body.output_config.format.schema.properties?.category) {
          const msg = body.messages?.[0]?.content?.find((b) => b.type === "text")?.text ?? "";
          if (msg.includes("[fail]")) return json(200, { id: "m", type: "message", role: "assistant", model: body.model, content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } });
          return json(200, { id: "m", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(fakeCategorise(msg)) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
        }
        const text = readDoc(body);
        if (text.includes("[fail]")) return json(200, { id: "m", type: "message", role: "assistant", model: body.model, content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } });
        return json(200, { id: "m", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(fakeExtract(text)) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
      }
      // Stripe (test mode shapes only)
      if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") return json(200, { id: "cs_test_1", object: "checkout.session", url: `http://127.0.0.1:${port}/fake-checkout` });
      if (url.pathname === "/v1/billing_portal/sessions" && req.method === "POST") return json(200, { id: "bps_1", object: "billing_portal.session", url: `http://127.0.0.1:${port}/fake-portal` });
      if (url.pathname === "/fake-checkout" || url.pathname === "/fake-portal") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<title>fake stripe</title><h1>Fake Stripe page</h1>"); }
      if (url.pathname.startsWith("/v1/subscriptions/") && req.method === "DELETE") return json(200, { id: url.pathname.split("/").pop(), object: "subscription", status: "canceled" });
      // WhatsApp Graph API
      const media = url.pathname.match(/^\/v\d+\.\d+\/(media-[\w-]+)$/);
      if (media) {
        const name = media[1];
        const mime = name.includes("audio") ? "audio/ogg" : name.includes("image") ? "image/jpeg" : name.includes("video") ? "video/mp4" : "application/pdf";
        return json(200, { url: `http://127.0.0.1:${port}/download/${name}`, mime_type: mime, ...(name.includes("big") ? { file_size: 40 * 1024 * 1024 } : {}) });
      }
      if (url.pathname.startsWith("/download/")) {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        if (url.pathname.includes("image")) return res.end(JPEG_BILL);
        return res.end(url.pathname.includes("audio") ? Buffer.from("OggS fake voice note bytes") : Buffer.from("%PDF-1.4\n(POLICY SCHEDULE Insurer: Fake Insurer Policy No: WA-1234567 Renewal: 2027-05-01)\n%%EOF"));
      }
      if (url.pathname.endsWith("/messages") && req.method === "POST") {
        sent.push(JSON.parse(raw));
        return json(200, { messages: [{ id: `wamid.fake${sent.length}` }] });
      }
      return json(404, { error: `no fake for ${url.pathname}` });
    } catch (e) {
      return json(500, { error: e.message });
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { stop: () => server.close() };
}
