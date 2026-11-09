export const ROOT: string;
export function connectionString(port: number, db?: string): string;
export function startPostgres(o?: { name?: string; port?: number; fresh?: boolean }): Promise<{ server: { stop(): Promise<void> }; url: string; port: number }>;
export function migrate(url: string): Promise<string[]>;
export const shimFile: string;
