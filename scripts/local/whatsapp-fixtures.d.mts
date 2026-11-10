export const NUMBERS: { kusum: string; sulabha: string; harish: string; unknown: string };
export function newWamid(tag?: string): string;
export function envelope(v: { messages?: object[]; statuses?: object[]; contacts?: object[] }): object;
export function text(from: string, body: string, extra?: object): object;
export const FIXTURES: Record<string, (...args: string[]) => object[]>;
