/**
 * Payments to third parties sit behind this interface. The only implementation is a stub.
 * No money moves in this product. A licensed partner can be added here after legal review.
 */
export interface PaymentRequest {
  approvalId: string;
  familyId: string;
  payee: string;
  amountInr: number;
}

export interface PaymentResult {
  status: "stubbed";
  reference: string;
}

export interface PaymentPartner {
  pay(req: PaymentRequest): Promise<PaymentResult>;
}

export class StubPaymentPartner implements PaymentPartner {
  async pay(req: PaymentRequest): Promise<PaymentResult> {
    return { status: "stubbed", reference: `stub-${req.approvalId}` };
  }
}

export const paymentPartner: PaymentPartner = new StubPaymentPartner();

/** An approval may only be executed once the owner has approved and the undo window has closed. */
export function canExecute(a: { status: string; undoUntil?: string | null; executedAt?: string | null }, now: Date): boolean {
  return a.status === "approved" && !a.executedAt && !!a.undoUntil && new Date(a.undoUntil).getTime() < now.getTime();
}
