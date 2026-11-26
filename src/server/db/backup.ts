import fs from "node:fs";
import { sql } from "drizzle-orm";
import type { Db } from "./client";

/** Writes a consistent, compacted copy of the database to destPath via VACUUM INTO. */
export function backupDatabase(db: Db, destPath: string): void {
  if (fs.existsSync(destPath)) {
    throw new Error(`Backup destination already exists: ${destPath}`);
  }
  db.run(sql`VACUUM INTO ${destPath}`);
}
