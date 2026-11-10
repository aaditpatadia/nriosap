/**
 * Where "talk to a person" goes. For now every WhatsApp conversation opens a chat with one desk
 * number, until the WhatsApp Business number is verified. Change it here, or set
 * NEXT_PUBLIC_DESK_WHATSAPP, and every link follows.
 */
export const DESK_WHATSAPP = (process.env.NEXT_PUBLIC_DESK_WHATSAPP || "918097020725").replace(/\D/g, "");

/** A click-to-chat link. The text is a starting line the person can change before sending. */
export const deskChat = (text?: string) => `https://wa.me/${DESK_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
