type Env = Record<string, string | undefined>;
interface Client {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
export const REQUIRED: string[];
export function problems(env: Env): string[];
export function vercelEnv(env: Env, appUrl: string): Record<string, string>;
export function isPublicSetting(name: string): boolean;
export function applyMigrations(client: Client, dir?: string): Promise<string[]>;
export function makeAdmin(client: Client, userId: string, email: string): Promise<boolean>;
export const WHATSAPP_REQUIRED: string[];
export function whatsappProblems(env: Env): string[];
