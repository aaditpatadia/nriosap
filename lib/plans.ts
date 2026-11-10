import "server-only";
import { asService, rows, tx } from "./db";
import { DEFAULT_PLANS, type Plan } from "./plan-rules";

type Row = Record<string, any>;

/** Reads the plan table. If the database cannot be reached the public site still shows the standard plans. */
export async function loadPlans(): Promise<Plan[]> {
  try {
    const r = await asService(() => rows<Row>("select * from plans where active order by sort"));
    if (r.length === 0) return DEFAULT_PLANS;
    return r.map((p) => ({ slug: p.slug, name: p.name, priceUsd: Number(p.price_usd), blurb: p.blurb, features: p.features ?? [], requestsPerMonth: p.requests_per_month, includesVisits: p.includes_visits, priorityResponse: p.priority_response, featured: p.featured, sort: p.sort }));
  } catch {
    return DEFAULT_PLANS;
  }
}

export async function savePlan(slug: string, p: { name: string; priceUsd: number; blurb: string; features: string[]; requestsPerMonth: number | null; includesVisits: boolean; priorityResponse: boolean }, userId: string): Promise<boolean> {
  return asService(() =>
    tx(async (t) => {
      const n = await t.run("update plans set name = $2, price_usd = $3, blurb = $4, features = $5, requests_per_month = $6, includes_visits = $7, priority_response = $8, updated_at = now() where slug = $1", [slug, p.name, p.priceUsd, p.blurb, p.features, p.requestsPerMonth, p.includesVisits, p.priorityResponse]);
      if (n) await t.run("insert into audit_log(actor_id, action, entity, entity_id) values ($1,'plan_changed','plan',$2)", [userId, slug]);
      return n > 0;
    }),
  );
}
