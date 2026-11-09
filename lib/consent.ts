import type { Language } from "./types";
import type { Purpose } from "./upload-rules";

/** Draft wording, not reviewed by a lawyer. Bump the version when it changes so each record shows what was read. */
export const WORDING_VERSION = "draft-2026-11";

export const REQUIRED_PURPOSES: Purpose[] = ["read_records", "store"];

export const OWNER_CONSENT_TEXT: Record<Purpose, string> = {
  read_records: "The desk may read my parent's documents to prepare tasks. An AI service reads them first and a person checks.",
  store: "The desk may keep my parent's documents in a private vault.",
  share_named_third_party: "The desk may share a document with a named insurer or hospital, after asking.",
  act_on_named_task: "The desk may prepare tasks for my approval. Nothing is paid or sent without me.",
};

/** What the coordinator reads aloud, in the parent's language. Translations need a native and legal review. */
export const CALL_SCRIPT: Record<Language, Record<Purpose, string>> = {
  English: {
    read_records: "May we read your documents to help with your paperwork?",
    store: "May we keep your documents safely with us?",
    share_named_third_party: "May we share a document with your insurer or hospital when you ask us to?",
    act_on_named_task: "May we help with named tasks, like a bill or a claim, for your family?",
  },
  Hindi: {
    read_records: "क्या हम आपके काग़ज़ात पढ़ सकते हैं, ताकि आपका काम कर सकें?",
    store: "क्या हम आपके काग़ज़ात सुरक्षित रूप से अपने पास रख सकते हैं?",
    share_named_third_party: "आपके कहने पर क्या हम कोई काग़ज़ आपकी बीमा कंपनी या अस्पताल को दे सकते हैं?",
    act_on_named_task: "क्या हम बिल या क्लेम जैसे तय कामों में आपकी मदद कर सकते हैं?",
  },
  Gujarati: {
    read_records: "તમારું કામ કરવા માટે શું અમે તમારા કાગળો વાંચી શકીએ?",
    store: "શું અમે તમારા કાગળો સલામત રીતે અમારી પાસે રાખી શકીએ?",
    share_named_third_party: "તમે કહો ત્યારે શું અમે કોઈ કાગળ તમારી વીમા કંપની કે હોસ્પિટલને આપી શકીએ?",
    act_on_named_task: "બિલ કે ક્લેમ જેવા નક્કી કરેલા કામોમાં શું અમે તમારી મદદ કરી શકીએ?",
  },
  Marathi: {
    read_records: "तुमचे काम करण्यासाठी आम्ही तुमची कागदपत्रे वाचू शकतो का?",
    store: "आम्ही तुमची कागदपत्रे सुरक्षितपणे आमच्याकडे ठेवू शकतो का?",
    share_named_third_party: "तुम्ही सांगाल तेव्हा आम्ही एखादे कागदपत्र तुमच्या विमा कंपनीला किंवा रुग्णालयाला देऊ शकतो का?",
    act_on_named_task: "बिल किंवा क्लेमसारख्या ठरलेल्या कामांमध्ये आम्ही तुम्हाला मदत करू शकतो का?",
  },
};

/** E.164 with a plausible length. The number is how a parent is matched on WhatsApp, so it has to be exact. */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s()-]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : /^[6-9]\d{9}$/.test(cleaned) ? `+91${cleaned}` : cleaned;
  return /^\+[1-9]\d{9,14}$/.test(withPlus) ? withPlus : null;
}

export const PLAN_PRICES = [40, 79, 119] as const;
export const PLAN_NAME: Record<number, string> = { 40: "Lite", 79: "Family", 119: "Plus" };
