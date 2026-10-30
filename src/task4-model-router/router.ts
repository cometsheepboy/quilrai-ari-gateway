
import "dotenv/config";

import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { initializeDatabase } from "./database.js";
import { routeToModel } from "./providers.js";
import { reserveTokens } from "./rate-limiter.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.ROUTER_PORT ?? 3005);

const TOKEN_LIMIT = Number(
  process.env.TOKEN_LIMIT_PER_MINUTE ?? 50000
);

const WINDOW_MS = Number(
  process.env.RATE_WINDOW_MS ?? 60000
);

const requestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }).strict()
  ).min(1),
  max_tokens: z.number().int().positive().max(50000).default(1000),
}).strict();

function secureMatch(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return (
    first.length === second.length &&
    timingSafeEqual(first, second)
  );
}

function authenticateTenant(
  authorization: string | undefined
): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) return null;

  const token = match[1];

  const tenants = [
    {
      id: "tenant-a",
      key: process.env.TENANT_A_API_KEY,
    },
    {
      id: "tenant-b",
      key: process.env.TENANT_B_API_KEY,
    },
  ];

  for (const tenant of tenants) {
    if (
      tenant.key &&
      secureMatch(token, tenant.key)
    ) {
      return createHash("sha256")
        .update(token)
        .digest("hex");
    }
  }

  return null;
}

function estimateTokens(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): number {
  const prompt = JSON.stringify(messages);

  // Conservative rough estimate, not an exact tokenizer.
  const promptTokens = Math.ceil(prompt.length / 4);

  return promptTokens + maxTokens;
}

app.post("/v1/chat/completions", async (req, res) => {
  // 1. Authenticate the tenant.
  const tenantHash = authenticateTenant(
    req.header("authorization")
  );

  if (!tenantHash) {
    return res.status(401).json({
      error: {
        type: "authentication_error",
        code: "INVALID_API_KEY",
        message: "Invalid or missing API key",
      },
    });
  }

  // 2. Validate the request.
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        type: "validation_error",
        code: "INVALID_REQUEST",
        message: "Invalid completion request",
      },
    });
  }

  const payload = parsed.data;

  // 3. Estimate and reserve tokens.
  const requestedTokens = estimateTokens(
    payload.messages,
    payload.max_tokens
  );

  try {
    const db = await initializeDatabase();

    const limit = reserveTokens(
      db,
      tenantHash,
      requestedTokens,
      TOKEN_LIMIT,
      WINDOW_MS
    );

    res.setHeader(
      "X-RateLimit-Limit",
      String(TOKEN_LIMIT)
    );

    res.setHeader(
      "X-RateLimit-Remaining",
      String(limit.remainingTokens)
    );

    if (!limit.allowed) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(limit.retryAfterMs / 1000))
      );

      return res.status(429).json({
        error: {
          type: "rate_limit_error",
          code: "TOKEN_LIMIT_EXCEEDED",
          message: "Tenant token quota exceeded",
        },
        usage: {
          used_tokens: limit.usedTokens,
          limit_tokens: TOKEN_LIMIT,
        },
      });
    }

    // 4. Route to primary or backup model.
    const result = await routeToModel(payload);

    return res.status(200).json({
      ...(
        result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data)
          ? result.data
          : { result: result.data }
      ),
      gateway: {
        provider: result.provider,
        estimated_reserved_tokens: requestedTokens,
      },
    });
  } catch (error) {
    console.error("Model router error:", error);

    return res.status(502).json({
      error: {
        type: "gateway_error",
        code: "UPSTREAM_FAILURE",
        message: "All available model routes failed",
      },
    });
  }
});

// Start only after SQLite has initialized.
async function main(): Promise<void> {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.error(
      `LLM Model Router listening on port ${PORT}`
    );
  });
}

main().catch(() => {
  console.error("Model router startup failed");
  process.exitCode = 1;
});
