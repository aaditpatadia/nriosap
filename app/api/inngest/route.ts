import { serve } from "inngest/next";
import { functions, inngest } from "@/lib/inngest";

const handlers = serve({ client: inngest, functions });

/** On Vercel the signing key is what proves a call came from Inngest. Without it the endpoint stays shut. */
const shut = () => process.env.VERCEL === "1" && !process.env.INNGEST_SIGNING_KEY;

function guarded<H extends (...args: never[]) => unknown>(handler: H): H {
  return ((...args: Parameters<H>) => (shut() ? new Response("Not configured", { status: 503 }) : handler(...args))) as H;
}

export const GET = guarded(handlers.GET);
export const POST = guarded(handlers.POST);
export const PUT = guarded(handlers.PUT);
