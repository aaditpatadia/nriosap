import "server-only";
import Stripe from "stripe";
import { asService, one, tx } from "./db";

type Row = Record<string, any>;

/** Test mode only. Taking a live key needs legal sign-off first, so a live key is treated as not configured. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  const host = process.env.STRIPE_API_HOST;
  return new Stripe(key, host ? { host, port: Number(process.env.STRIPE_API_PORT ?? 443), protocol: (process.env.STRIPE_API_PROTOCOL as "http" | "https") ?? "https" } : {});
}

export const priceIdFor = (planUsd: number) => process.env[`STRIPE_PRICE_${planUsd}`];
export const billingConfigured = (planUsd: number) => !!stripeClient() && !!priceIdFor(planUsd);

export interface Subscription { status: string; priceUsd?: number; currentPeriodEnd?: string; cancelAtPeriodEnd: boolean; hasCustomer: boolean }

export async function subscriptionFor(familyId: string): Promise<Subscription | undefined> {
  const r = await one<Row>("select * from subscriptions where family_id = $1", [familyId]);
  return r ? { status: r.status, priceUsd: r.price_usd == null ? undefined : Number(r.price_usd), currentPeriodEnd: r.current_period_end ?? undefined, cancelAtPeriodEnd: r.cancel_at_period_end, hasCustomer: !!r.stripe_customer_id } : undefined;
}

export async function createCheckout(familyId: string, planUsd: number, email: string | null, base: string): Promise<string | null> {
  const stripe = stripeClient();
  const price = priceIdFor(planUsd);
  if (!stripe || !price) return null;
  const existing = await asService(() => one<Row>("select stripe_customer_id from subscriptions where family_id = $1", [familyId]));
  const s = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}/family/${familyId}/billing?done=1`,
    cancel_url: `${base}/family/${familyId}/billing`,
    client_reference_id: familyId,
    metadata: { family_id: familyId },
    subscription_data: { metadata: { family_id: familyId } },
    ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id } : email ? { customer_email: email } : {}),
  });
  return s.url;
}

export async function createPortal(familyId: string, base: string): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  const r = await asService(() => one<Row>("select stripe_customer_id from subscriptions where family_id = $1", [familyId]));
  if (!r?.stripe_customer_id) return null;
  const s = await stripe.billingPortal.sessions.create({ customer: r.stripe_customer_id, return_url: `${base}/family/${familyId}/billing` });
  return s.url;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return raw ? new Date(raw * 1000) : null;
}

/** Applies a verified Stripe event. Repeat deliveries are ignored. */
export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  await asService(() =>
    tx(async (t) => {
      if (!(await t.one("insert into stripe_events(id) values ($1) on conflict do nothing returning id", [event.id]))) return;
      if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const familyId = s.metadata?.family_id;
        if (!familyId) return;
        await t.run(
          `insert into subscriptions(family_id, stripe_customer_id, stripe_subscription_id, status) values ($1,$2,$3,'active')
           on conflict (family_id) do update set stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, status = 'active', updated_at = now()`,
          [familyId, s.customer, s.subscription],
        );
      }
      if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted" || event.type === "customer.subscription.created") {
        const sub = event.data.object as Stripe.Subscription;
        const familyId = sub.metadata?.family_id;
        if (!familyId) return;
        const amount = sub.items?.data?.[0]?.price?.unit_amount;
        await t.run(
          `insert into subscriptions(family_id, stripe_customer_id, stripe_subscription_id, status, price_usd, current_period_end, cancel_at_period_end)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (family_id) do update set stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, status = excluded.status, price_usd = excluded.price_usd, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()`,
          [familyId, sub.customer, sub.id, event.type.endsWith("deleted") ? "canceled" : sub.status, amount == null ? null : amount / 100, periodEnd(sub), sub.cancel_at_period_end],
        );
      }
    }),
  );
}

export async function cancelForDeletion(familyId: string): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const r = await asService(() => one<Row>("select stripe_subscription_id, status from subscriptions where family_id = $1", [familyId]));
  if (r?.stripe_subscription_id && r.status !== "canceled") await stripe.subscriptions.cancel(r.stripe_subscription_id);
}
