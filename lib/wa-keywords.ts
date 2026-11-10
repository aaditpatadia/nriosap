import { isConsentWithdrawal } from "./rules";

/**
 * Keyword commands read from a whole message. Matching is deliberately narrow: a word inside a longer
 * sentence never counts, so "please stop by the bank" is an ordinary message.
 *
 * NATIVE SPEAKER REVIEW NEEDED: the Hindi, Gujarati and Marathi lists below were written without a native
 * speaker. They need checking for missing everyday forms, and for any phrase that could be meant some other way.
 */

/** Lower case, no punctuation (including the Devanagari danda), single spaces. */
export function normaliseCommand(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.!?,;:"'()\[\]।॥🙏]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  // English
  "stop", "stop all", "stop messages", "stop it", "unsubscribe", "opt out", "optout",
  // Hindi and Hinglish
  "बंद करो", "बंद कीजिए", "बंद कर दो", "बंद", "रुको", "रुकिए", "रुक जाओ", "मत भेजो", "मैसेज मत भेजो", "संदेश मत भेजो",
  "band karo", "band kar do", "band kijiye", "band", "ruko", "ruk jao", "rukiye", "mat bhejo", "message mat bhejo",
  // Gujarati
  "બંધ કરો", "બંધ કરી દો", "બંધ", "મોકલશો નહીં", "ના મોકલો", "મેસેજ ના મોકલો",
  "bandh karo", "bandh kari do", "bandh", "na moklo", "message na moklo",
  // Marathi
  "बंद करा", "बंद करून टाका", "थांबा", "थांबवा", "पाठवू नका", "मेसेज पाठवू नका",
  "band kara", "thamba", "thambva", "pathvu naka",
]);

const START = new Set(["start", "restart", "unstop", "शुरू करो", "शुरू", "shuru karo", "shuru", "ચાલુ કરો", "ચાલુ", "chalu karo", "chalu", "सुरू करा", "सुरू", "suru kara"]);

const YES = new Set(["yes", "y", "yes i agree", "i agree", "agree", "haan", "han", "ha", "haa", "ha ji", "haan ji", "हाँ", "हां", "जी हाँ", "जी हां", "हाँ जी", "सहमत", "હા", "હા જી", "સંમત", "हो", "होय", "ho", "hoy", "सहमत आहे"]);
const PERSON_ONLY = new Set(["person only", "only person", "no ai", "yes no ai", "ai nahi", "ai नहीं", "ai નહીં", "ai नको", "ai nako"]);
const NO = new Set(["no", "n", "nahi", "nahin", "नहीं", "ना", "ના", "nako", "नको", "nai"]);
const HUMAN = new Set(["human", "person", "agent", "coordinator", "talk to a person", "call me", "insaan", "इंसान", "व्यक्ति", "વ્યક્તિ", "માણસ", "माणूस", "manus"]);

export type Command =
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "consent_yes" }
  | { kind: "consent_person_only" }
  | { kind: "consent_no" }
  | { kind: "human" }
  | { kind: "approve" | "decline" | "undo"; ref: string }
  | { kind: "link"; code: string }
  | { kind: "none" };

/** STOP always wins. A request that also says "stop" in a sentence is not a STOP. */
export function readCommand(text: string | undefined | null): Command {
  if (!text) return { kind: "none" };
  const n = normaliseCommand(text);
  if (!n) return { kind: "none" };
  if (STOP.has(n) || isConsentWithdrawal(text)) return { kind: "stop" };
  if (START.has(n)) return { kind: "start" };
  if (PERSON_ONLY.has(n)) return { kind: "consent_person_only" };
  if (YES.has(n)) return { kind: "consent_yes" };
  if (NO.has(n)) return { kind: "consent_no" };
  if (HUMAN.has(n)) return { kind: "human" };
  const quote = n.match(/^(approve|approved|yes approve|decline|reject|undo)\s+(aly ?-? ?\d{3,7})$/);
  if (quote) {
    const ref = `ALY-${quote[2].replace(/\D/g, "")}`;
    const verb = quote[1];
    return { kind: verb === "undo" ? "undo" : verb === "decline" || verb === "reject" ? "decline" : "approve", ref };
  }
  const link = n.match(/^link\s+(\d{6})$/);
  if (link) return { kind: "link", code: link[1] };
  return { kind: "none" };
}

export const isStop = (text: string) => readCommand(text).kind === "stop";
