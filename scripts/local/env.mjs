// Fixed, throwaway values for the local stack. None of these are real secrets.
import { signJwt } from "./supabase-emulator.mjs";

export const JWT_SECRET = "local-emulator-jwt-secret-not-a-real-secret";
export const PG_PORT = 54329;
export const EMU_PORT = 54321;
export const FAKES_PORT = 54322;
export const APP_PORT = 3100;

export function localEnv() {
  return {
    DATABASE_URL: `postgres://postgres:localdev@127.0.0.1:${PG_PORT}/postgres`,
    DATABASE_SSL: "disable",
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${EMU_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: signJwt({ role: "anon", iss: "local", exp: 4102444800 }, JWT_SECRET),
    SUPABASE_SERVICE_ROLE_KEY: signJwt({ role: "service_role", iss: "local", exp: 4102444800 }, JWT_SECRET),
    APP_ENCRYPTION_KEY: "local-only-encryption-key-at-least-32-bytes",
    APP_URL: `http://localhost:${APP_PORT}`,
    DEMO_MODE: "1",
    GOOGLE_SIGNIN: "1",
    SEED_STAFF_PASSWORD: "local-staff-password-1",
    WHATSAPP_VERIFY_TOKEN: "local-verify-token",
    WHATSAPP_APP_SECRET: "local-app-secret",
    WHATSAPP_SEND_ENABLED: "0",
    WHATSAPP_SENDING: "0",
    ANTHROPIC_API_KEY: "fake-local-key",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKES_PORT}`,
    EXTRACTOR: "claude",
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${FAKES_PORT}/v21.0`,
    WHATSAPP_MEDIA_TEST_HOST: `127.0.0.1:${FAKES_PORT}`,
    STRIPE_SECRET_KEY: "sk_test_fake_local",
    STRIPE_WEBHOOK_SECRET: "whsec_fake_local",
    STRIPE_API_HOST: "127.0.0.1",
    STRIPE_API_PORT: String(FAKES_PORT),
    STRIPE_API_PROTOCOL: "http",
    STRIPE_PRICE_40: "price_40",
    STRIPE_PRICE_79: "price_79",
    STRIPE_PRICE_119: "price_119",
    RATE_LIMIT_SIGNIN: "1000",
    INNGEST_DEV: "1",
    WHATSAPP_ACCESS_TOKEN: "fake-local-token",
    WHATSAPP_PHONE_NUMBER_ID: "000000",
  };
}
