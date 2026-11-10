/** What each plan includes. The database can change these without a rebuild; these are the fallback. */
export interface Plan {
  slug: string; name: string; priceUsd: number; blurb: string; features: string[];
  requestsPerMonth: number | null; includesVisits: boolean; priorityResponse: boolean; featured: boolean; sort: number;
}

export const DEFAULT_PLANS: Plan[] = [
  { slug: "lite", name: "Lite", priceUsd: 40, blurb: "For a few things a month.", features: ["Document vault", "Bills and renewal tracking", "Monthly report", "Up to 3 new requests a month", "In-person visits are quoted before they happen"], requestsPerMonth: 3, includesVisits: false, priorityResponse: false, featured: false, sort: 1 },
  { slug: "family", name: "Family", priceUsd: 79, blurb: "A good place to start.", features: ["Everything in Lite", "No monthly limit on new requests", "Errands, property and paper chasing", "Help with claims paperwork", "Weekly updates from your coordinator", "In-person visits are quoted before they happen"], requestsPerMonth: null, includesVisits: false, priorityResponse: false, featured: true, sort: 2 },
  { slug: "plus", name: "Plus", priceUsd: 119, blurb: "When you need someone on the ground.", features: ["Everything in Family", "Priority in the coordinator queue", "In-person visits arranged within your plan", "Hospital desk support"], requestsPerMonth: null, includesVisits: true, priorityResponse: true, featured: false, sort: 3 },
];

/** A family stores what it pays. An older price that no plan matches gets the closest plan at or below it. */
export function planForPrice(priceUsd: number, plans: Plan[] = DEFAULT_PLANS): Plan {
  const sorted = [...plans].sort((a, b) => a.priceUsd - b.priceUsd);
  return sorted.find((p) => p.priceUsd === priceUsd) ?? [...sorted].reverse().find((p) => p.priceUsd <= priceUsd) ?? sorted[0];
}

export function requestLimitReason(plan: Plan, usedThisMonth: number): string | null {
  if (plan.requestsPerMonth === null || usedThisMonth < plan.requestsPerMonth) return null;
  return `Your ${plan.name} plan includes ${plan.requestsPerMonth} new requests a month, and you have used them. You can move to a larger plan in Settings, or send this next month.`;
}

export const requestsLeft = (plan: Plan, used: number) => (plan.requestsPerMonth === null ? null : Math.max(0, plan.requestsPerMonth - used));

/** On plans without visits, a visit must rest on a quotation the customer has already approved. */
export function visitBlockedReason(plan: Plan, hasApprovedQuote: boolean): string | null {
  if (plan.includesVisits || hasApprovedQuote) return null;
  return `The ${plan.name} plan does not include visits. Link this visit to a request with an approved quotation first.`;
}
