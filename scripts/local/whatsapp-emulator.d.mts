export const WEBHOOK_PATH: string;
export function sign(raw: string, secret?: string): string;
export function post(body: unknown, o?: { url?: string; signature?: "valid" | "invalid" | "missing" }): Promise<{ status: number; text: string }>;
export function verifyChallenge(o?: { url?: string; token?: string }): Promise<{ status: number; text: string }>;
