import { isConsentWithdrawal, isEmergency, looksLikeAdvice } from "./rules";

/** The public demo runs entirely in the browser with a fictional family. Nothing reaches a server. */
export type DemoRoute = "emergency" | "stop" | "advice" | "task";

/** Questions a parent might ask. The product filter checks drafts going out, so the demo also catches the asking. */
const ASKS_FOR_ADVICE = /\b(medicine|medication|tablets?|dose|surgery|treatment|tax|legal|lawyer|court|sue)\b/i;

export function routeParentMessage(text: string): DemoRoute {
  if (isEmergency(text)) return "emergency";
  if (isConsentWithdrawal(text)) return "stop";
  if (looksLikeAdvice(text) || ASKS_FOR_ADVICE.test(text)) return "advice";
  return "task";
}

export const DEMO_REPLY: Record<DemoRoute, { parent: string; desk: string; owner?: string }> = {
  emergency: {
    parent: "Please call 112 now if someone needs help. Meera has been told and will call you.",
    desk: "Emergency words found. This goes to the top of Meera's queue.",
    owner: "Your mother sent an urgent message. Meera is calling her now.",
  },
  stop: {
    parent: "We have stopped, as you asked. Nothing more will happen until you tell us.",
    desk: "Consent withdrawn. All work for this family is paused.",
    owner: "Your mother has asked us to stop. All work is paused.",
  },
  advice: {
    parent: "We cannot answer that. A doctor, advocate or CA can. Meera will help you reach one and get your papers ready.",
    desk: "Asks for advice. Blocked from the assistant and passed to a licensed professional.",
  },
  task: {
    parent: "Thank you, Kusum ji. Meera will look at this today.",
    desk: "New task added to Meera's queue.",
  },
};

export const DEMO_TRY = ["Dawai band kar doon?", "Papa fell down", "Please renew my health policy", "STOP"] as const;
