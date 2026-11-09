import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { addWaitlist } from "@/lib/store";

const schema = z.object({ email: z.string().email().max(200), country: z.string().max(80), note: z.string().max(400).optional() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  if (!(await rateLimit(`waitlist:${clientIp(req)}`, 10, 3600))) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await req.json().catch(() => null);
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  await addWaitlist({ email: p.data.email, country: p.data.country, note: p.data.note ?? "" });
  return NextResponse.json({ ok: true });
}
