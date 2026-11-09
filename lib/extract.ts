/**
 * Document extraction sits behind this interface so a real model API
 * (vision LLM, Sarvam document intelligence, etc.) can replace the mock
 * without touching screens. Raw documents are never logged.
 */
export interface ExtractionResult {
  kind: "policy" | "discharge_summary" | "bill" | "id" | "report";
  fields: Record<string, string>;
  /** 0 to 1. Below 0.9 a coordinator must check before anything relies on it. */
  confidence: number;
}

export interface DocumentExtractor {
  extract(input: { filename: string; mime: string; bytes?: Uint8Array }): Promise<ExtractionResult>;
}

/** Deterministic mock for demos and tests. Not a real extractor. */
export class MockExtractor implements DocumentExtractor {
  async extract({ filename }: { filename: string }): Promise<ExtractionResult> {
    const n = filename.toLowerCase();
    if (n.includes("policy")) {
      return {
        kind: "policy",
        fields: { insurer: "Demo Insurer A", sumInsured: "Rs 5,00,000", renewalDate: "2027-03-14" },
        confidence: 0.94,
      };
    }
    if (n.includes("discharge")) {
      return {
        kind: "discharge_summary",
        fields: { hospital: "Demo City Hospital", admitted: "2026-10-28", discharged: "2026-11-02" },
        confidence: 0.82,
      };
    }
    if (n.includes("bill") || n.includes("invoice")) {
      return {
        kind: "bill",
        fields: { payee: "Demo Power Co", amount: "Rs 4,200", dueDate: "2026-11-15" },
        confidence: 0.91,
      };
    }
    return { kind: "report", fields: {}, confidence: 0.6 };
  }
}

export const extractor: DocumentExtractor = new MockExtractor();
