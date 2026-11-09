/** Virus scan hook. Point VIRUS_SCAN_URL at a scanner service to get a real verdict. */
export type ScanVerdict = "clean" | "infected" | "basic_only";

export interface VirusScanner {
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
}

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** Only catches the standard test signature. Records "basic_only" so nobody mistakes it for a real scan. */
export class BasicScanner implements VirusScanner {
  async scan(bytes: Uint8Array): Promise<ScanVerdict> {
    return Buffer.from(bytes).includes(EICAR) ? "infected" : "basic_only";
  }
}

/** Expects POST of raw bytes returning {"verdict":"clean"|"infected"}. Fails closed: errors count as infected. */
export class HttpScanner implements VirusScanner {
  constructor(private readonly url: string) {}
  async scan(bytes: Uint8Array): Promise<ScanVerdict> {
    try {
      const res = await fetch(this.url, { method: "POST", body: Buffer.from(bytes), headers: { "content-type": "application/octet-stream" }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return "infected";
      const body = (await res.json()) as { verdict?: string };
      return body.verdict === "clean" ? "clean" : "infected";
    } catch {
      return "infected";
    }
  }
}

export const getScanner = (): VirusScanner => (process.env.VIRUS_SCAN_URL ? new HttpScanner(process.env.VIRUS_SCAN_URL) : new BasicScanner());
