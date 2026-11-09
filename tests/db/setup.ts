// Vitest global setup: one real Postgres for all database tests.
import { migrate, startPostgres } from "../../scripts/local/pg.mjs";
import { seedFixtures } from "./helpers";

export default async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  const { server, url } = await startPostgres({ name: "pg-test", port: 54330, fresh: true });
  try {
    await migrate(url);
    await seedFixtures(url);
  } catch (e) {
    await server.stop();
    throw e;
  }
  provide("dbUrl", url);
  return async () => {
    await server.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
