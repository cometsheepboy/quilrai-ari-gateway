
import type { Database, SqlJsStatic } from "sql.js";
import initSqlJs from "sql.js";

import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";

import path from "node:path";

let database: Database | null = null;

let SQL: SqlJsStatic;

const databasePath = path.resolve(
  process.env.SQLITE_PATH ?? "./data/assessment.sqlite"
);

function persistDatabase(db: Database): void {
  const exported = db.export();

  const directory = path.dirname(databasePath);

  mkdirSync(directory, { recursive: true });

  const temporaryPath = `${databasePath}.tmp`;

  writeFileSync(temporaryPath, Buffer.from(exported));

  renameSync(temporaryPath, databasePath);
}

export async function initializeDatabase(): Promise<Database> {
  if (database) {
    return database;
  }

  SQL = await initSqlJs();

  mkdirSync(path.dirname(databasePath), {
    recursive: true,
  });

  if (existsSync(databasePath)) {
    const file = readFileSync(databasePath);

    database = new SQL.Database(
      new Uint8Array(file)
    );
  } else {
    database = new SQL.Database();
  }

  database.run(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_hash TEXT NOT NULL,
      tokens INTEGER NOT NULL CHECK(tokens > 0),
      created_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_time
    ON token_usage (tenant_hash, created_at)
  `);

  persistDatabase(database);

  console.error("SQLite database initialized");

  return database;
}

export function getDatabase(): Database {
  if (!database) {
    throw new Error("Database not initialized");
  }

  return database;
}

export function saveDatabase(): void {
  if (!database) {
    throw new Error("Database not initialized");
  }

  persistDatabase(database);
}
