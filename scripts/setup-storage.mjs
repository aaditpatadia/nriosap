// Creates the private document bucket. Safe to run twice.
// Usage: node --env-file=.env.local scripts/setup-storage.mjs
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export async function setupStorage() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.storage.createBucket("vault", { public: false, fileSizeLimit: 16 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"] });
  if (error && !/already exists/i.test(error.message)) throw error;
  console.log("storage bucket ready");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await setupStorage();
