import { NextResponse } from "next/server";
import { z } from "zod";
import { addWaitlist } from "@/lib/store";

const schema = z.object({ email: z.string().email().max(200), country: z.string().max(80), note: z.string().max(400).optional() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  addWaitlist({ email: p.data.email, country: p.data.country, note: p.data.note ?? "" });
  return NextResponse.json({ ok: true });
}
