import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyStripeEvent, stripeClient } from "@/lib/billing";

/** Stripe calls this. The signature is checked on the raw body. */
export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new NextResponse("Not configured", { status: 503 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }
  await applyStripeEvent(event);
  return NextResponse.json({ received: true });
}
