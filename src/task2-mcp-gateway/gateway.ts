
import "dotenv/config";

import express from "express";
import { authenticateToken } from "./auth.js";

const app = express();

app.use(
  express.text({
    type: "*/*",
    limit: "1mb",
  })
);

const PORT = Number(process.env.GATEWAY_PORT ?? 3001);

const DOWNSTREAM_URL =
  process.env.DOWNSTREAM_URL ??
  "http://localhost:3002/mcp";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string
) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

app.post("/mcp", async (req, res) => {
  const rawBody = req.body;

  // 1. Parse the JSON-RPC request.
  let request: JsonRpcRequest;

  try {
    if (typeof rawBody !== "string" || !rawBody) {
      throw new Error("Empty request body");
    }

    request = JSON.parse(rawBody) as JsonRpcRequest;
  } catch {
    return res.status(400).json(
      rpcError(null, -32700, "Parse error")
    );
  }

  const id = request.id ?? null;

  // 2. Validate the JSON-RPC envelope.
  if (
    request.jsonrpc !== "2.0" ||
    typeof request.method !== "string" ||
    !request.method
  ) {
    return res.status(400).json(
      rpcError(id, -32600, "Invalid Request")
    );
  }

  // 3. Authenticate the Bearer token.
  const authorization = req.header("authorization");

  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json(
      rpcError(id, -32001, "Unauthorized")
    );
  }

  const user = authenticateToken(match[1]);

  if (!user) {
    return res.status(401).json(
      rpcError(id, -32001, "Unauthorized")
    );
  }

  // 4. Inspect tools/call requests.
  if (request.method === "tools/call") {
    const toolName = request.params?.name;

    if (typeof toolName !== "string" || id === null) {
      return res.status(400).json(
        rpcError(id, -32602, "Invalid tool call parameters")
      );
    }

    // 5. Protect all tools beginning with admin_.
    if (
      toolName.startsWith("admin_") &&
      user.role !== "admin"
    ) {
      console.error(
        `Blocked admin tool call from role: ${user.role}`
      );

      // IMPORTANT:
      // Return immediately. Do not contact downstream.
      return res.status(200).json(
        rpcError(
          id,
          -32001,
          "Unauthorized Tool Call"
        )
      );
    }
  }

  // 6. Forward authorized requests transparently.
  // tools/list and other MCP methods also pass through.
  try {
    const upstreamResponse = await fetch(
      DOWNSTREAM_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: rawBody,
        signal: AbortSignal.timeout(10000),
      }
    );

    const responseBody = await upstreamResponse.text();

    res.status(upstreamResponse.status);

    const contentType = upstreamResponse.headers.get(
      "content-type"
    );

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    return res.send(responseBody);
  } catch {
    // Never expose internal upstream error details.
    return res.status(502).json(
      rpcError(
        id,
        -32000,
        "Downstream MCP server unavailable"
      )
    );
  }
});

app.listen(PORT, () => {
  console.error(
    `MCP Security Gateway listening on port ${PORT}`
  );
});
