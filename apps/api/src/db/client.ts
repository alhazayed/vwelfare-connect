import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * DATABASE_URL set → PostgreSQL. Otherwise PGlite (Postgres compiled to WebAssembly) in dataDir/pg,
 * or in memory when dataDir is "memory" (tests).
 */
export async function openDb(opts: { databaseUrl?: string; dataDir: string }): Promise<{ db: Db; close: () => Promise<void> }> {
  if (opts.databaseUrl) {
    // Fail fast instead of hanging when the database can't be reached.
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, connectionTimeoutMillis: 5_000 });
    const db = drizzlePg(pool, { schema });
    await pool.query("select 1");
    console.log("Database connected; running migrations");
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  let client: PGlite;
  if (opts.dataDir === "memory") client = new PGlite();
  else {
    mkdirSync(opts.dataDir, { recursive: true });
    client = new PGlite(join(opts.dataDir, "pg"));
  }
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
