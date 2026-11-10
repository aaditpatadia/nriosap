// LOCAL ONLY. Webhook bodies shaped like Meta's WhatsApp Cloud API, for the emulator and the tests.
// Numbers are the fictional demo family's, or plainly made up. Media ids are answered by scripts/local/fakes.mjs.

export const NUMBERS = {
  kusum: "919800000001", // Shah family, Gujarati, coordinator Meera
  sulabha: "919800000002", // Kulkarni family, Marathi, coordinator Rohan
  harish: "919800000003", // Mehta family, Hindi, coordinator Kavita, Lite plan
  unknown: "15550001234", // nobody
};

let seq = 0;
export const newWamid = (tag = "emu") => `wamid.${tag}.${Date.now()}.${seq++}`;
const ts = () => String(Math.floor(Date.now() / 1000));

export function envelope({ messages = [], statuses = [], contacts = [] }) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "000000000000000", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550000000", phone_number_id: "000000" }, contacts, messages, statuses } }] }],
  };
}

export const text = (from, body, extra = {}) => ({ from, id: newWamid("text"), timestamp: ts(), type: "text", text: { body }, ...extra });

/** Each fixture returns a list of bodies to post, in order. */
export const FIXTURES = {
  bill_photo: () => [envelope({ messages: [{ from: NUMBERS.kusum, id: newWamid("photo"), timestamp: ts(), type: "image", image: { id: "media-image-bill-1", mime_type: "image/jpeg", caption: "Electricity bill for the Rajkot house" } }] })],
  text_english: () => [envelope({ messages: [text(NUMBERS.kusum, "Please renew the health insurance policy before it lapses next month.")] })],
  text_hindi: () => [envelope({ messages: [text(NUMBERS.harish, "बिजली का बिल भरना है, कृपया देख लीजिए")] })],
  text_gujarati: () => [envelope({ messages: [text(NUMBERS.kusum, "ઘરના નળમાંથી પાણી લીક થાય છે, પ્લમ્બર મોકલશો?")] })],
  text_marathi: () => [envelope({ messages: [text(NUMBERS.sulabha, "फ्लॅटच्या भाडेकरूशी बोलायचे आहे, कृपया संपर्क करा")] })],
  voice_note: () => [envelope({ messages: [{ from: NUMBERS.kusum, id: newWamid("voice"), timestamp: ts(), type: "audio", audio: { id: "media-audio-voice-1", mime_type: "audio/ogg; codecs=opus", voice: true } }] })],
  emergency: () => [envelope({ messages: [text(NUMBERS.sulabha, "आई जिन्यावरून पडल्या, लवकर फोन करा")] })],
  unknown_number: () => [envelope({ messages: [text(NUMBERS.unknown, "Hello, I am calling about my aunt's flat. Who is this?")] })],
  repeated_delivery: () => {
    const body = envelope({ messages: [text(NUMBERS.kusum, "This one arrives twice but must be stored once.")] });
    return [body, body];
  },
  stop: () => [envelope({ messages: [text(NUMBERS.unknown, "STOP")] })],
  unsupported_video: () => [envelope({ messages: [{ from: NUMBERS.kusum, id: newWamid("video"), timestamp: ts(), type: "video", video: { id: "media-video-1", mime_type: "video/mp4" } }] })],
  status_delivered: (wamid = "wamid.out.example") => [envelope({ statuses: [{ id: wamid, status: "delivered", timestamp: ts(), recipient_id: NUMBERS.kusum }] })],
};
