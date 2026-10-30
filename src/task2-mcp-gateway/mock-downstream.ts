import "dotenv/config";
import express from "express";

const app = express();

app.use(
  express.text({
    type: "*/*",
    limit: "1mb",
  })
);

const PORT = Number(process.env.DOWNSTREAM_PORT ?? 3002);

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
    error: { code, message },
  };
}

app.post("/mcp", (req, res) => {
  let request: JsonRpcRequest;

  try {
    request = JSON.parse(req.body) as JsonRpcRequest;
  } catch {
    return res.status(400).json(
      rpcError(null, -32700, "Parse error")
    );
  }

  const { id, method, params } = request;

  // JSON-RPC notifications do not receive responses.
  if (id === undefined) {
    return res.status(202).end();
  }

  if (request.jsonrpc !== "2.0" || !method) {
    return res.json(
      rpcError(id, -32600, "Invalid Request")
    );
  }

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "quilrai-mock-downstream",
          version: "1.0.0",
        },
      },
    });
  }

  if (method === "ping") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {},
    });
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "get_status",
            description: "Get system status",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "admin_reset_key",
            description: "Reset an API key (admin only)",
            inputSchema: {
              type: "object",
              properties: {
                key_id: { type: "string" },
              },
              required: ["key_id"],
            },
          },
        ],
      },
    });
  }

  if (method === "tools/call") {
    const name = params?.name;

    if (name === "get_status") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "System status: operational",
            },
          ],
        },
      });
    }

    if (name === "admin_reset_key") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "API key successfully reset (mock operation).",
            },
          ],
        },
      });
    }

    return res.json(
      rpcError(id, -32602, "Unknown tool")
    );
  }

  return res.json(
    rpcError(id, -32601, "Method not found")
  );
});

app.listen(PORT, () => {
  console.error(
    `Mock downstream MCP server listening on port ${PORT}`
  );
});
