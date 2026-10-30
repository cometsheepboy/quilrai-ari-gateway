
import type { Database } from "sql.js";

import { saveDatabase } from "./database.js";

export interface RateLimitResult {
  allowed: boolean;
  usedTokens: number;
  remainingTokens: number;
  retryAfterMs: number;
}

export function reserveTokens(
  db: Database,
  tenantHash: string,
  requestedTokens: number,
  limit = 50000,
  windowMs = 60000,
  now = Date.now()
): RateLimitResult {
  if (
    !Number.isSafeInteger(requestedTokens) ||
    requestedTokens <= 0 ||
    requestedTokens > limit
  ) {
    return {
      allowed: false,
      usedTokens: 0,
      remainingTokens: limit,
      retryAfterMs: windowMs,
    };
  }

  const windowStart = now - windowMs;

  db.run("BEGIN IMMEDIATE");

  try {
    // Remove expired usage records.
    db.run(
      `DELETE FROM token_usage
       WHERE created_at <= ?`,
      [windowStart]
    );

    // Calculate usage for this tenant in the active window.
    const usageResult = db.exec(
      `SELECT
         COALESCE(SUM(tokens), 0) AS used,
         MIN(created_at) AS oldest
       FROM token_usage
       WHERE tenant_hash = ?
       AND created_at > ?`,
      [tenantHash, windowStart]
    );

    const row = usageResult[0]?.values[0];

    const usedTokens = Number(row?.[0] ?? 0);

    const oldestTimestamp =
      row?.[1] == null
        ? null
        : Number(row[1]);

    const nextUsage = usedTokens + requestedTokens;

    if (nextUsage > limit) {
      const retryAfterMs =
        oldestTimestamp === null
          ? windowMs
          : Math.max(
              1,
              oldestTimestamp + windowMs - now
            );

      db.run("COMMIT");

      saveDatabase();

      return {
        allowed: false,
        usedTokens,
        remainingTokens: Math.max(0, limit - usedTokens),
        retryAfterMs,
      };
    }

    // Reserve tokens before making the upstream request.
    db.run(
      `INSERT INTO token_usage
       (tenant_hash, tokens, created_at)
       VALUES (?, ?, ?)`,
      [tenantHash, requestedTokens, now]
    );

    db.run("COMMIT");

    saveDatabase();

    return {
      allowed: true,
      usedTokens: nextUsage,
      remainingTokens: limit - nextUsage,
      retryAfterMs: 0,
    };
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}
