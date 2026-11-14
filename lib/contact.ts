/**
 * Where "talk to a person" goes. For now every WhatsApp conversation opens a chat with one desk
 * number, until the WhatsApp Business number is verified. Change it here, or set
 * NEXT_PUBLIC_DESK_WHATSAPP, and every link follows.
 */
export const DESK_WHATSAPP = (process.env.NEXT_PUBLIC_DESK_WHATSAPP || "918097020725").replace(/\D/g, "");

/** A click-to-chat link. The text is a starting line the person can change before sending. */
export const deskChat = (text?: string) => `https://wa.me/${DESK_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** An email address for support. It is shown only when one has been set, so no address is ever invented. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;
export const supportMail = (subject: string) => (SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` : null);
