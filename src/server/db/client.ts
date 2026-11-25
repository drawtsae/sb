import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const migrationsFolder = () => path.join(process.cwd(), "drizzle");

function open(file: string): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema, casing: "snake_case" });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { db, sqlite };
}

const g = globalThis as unknown as {
  __soundboardDb?: { db: Db; sqlite: Database.Database };
};

export function getDb(): Db {
  if (!g.__soundboardDb) {
    const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? "./data");
    fs.mkdirSync(path.join(dataDir, "music"), { recursive: true });
    g.__soundboardDb = open(path.join(dataDir, "app.db"));
  }
  return g.__soundboardDb.db;
}

/** Test-only: close and forget the singleton so the next getDb() reopens. */
export function resetDbForTests(): void {
  g.__soundboardDb?.sqlite.close();
  g.__soundboardDb = undefined;
}

/** In-memory, migrated database for tests. */
export function createTestDb(): Db {
  return open(":memory:").db;
}
