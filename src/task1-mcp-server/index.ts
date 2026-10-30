
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
    getCustomerRecordSchema,
    triggerRefundSchema,
} from "./schemas.js";

import {
    getCustomerRecord,
    triggerRefund,
} from "./customer-service.js";

// Initialize the MCP server.
const server = new McpServer({
  name: "quilrai-customer-server",
  version: "1.0.0",
});

// Tool 1: Get customer record.
server.registerTool(
  "get_customer_record",
  {
    title: "Get Customer Record",
    description:
      "Retrieve customer information using a customer ID.",
    inputSchema: getCustomerRecordSchema,
  },
  async ({ customer_id }) => {
    const customer = getCustomerRecord(customer_id);

    if (!customer) {
      return {
        content: [
          {
            type: "text",
            text: `Customer ${customer_id} was not found.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(customer, null, 2),
        },
      ],
      structuredContent: { ...customer },
    };
  }
);

// Tool 2: Trigger refund.
server.registerTool(
  "trigger_refund",
  {
    title: "Trigger Refund",
    description:
      "Simulate a refund for an existing customer.",
    inputSchema: triggerRefundSchema,
  },
  async ({ customer_id, amount, reason }) => {
    const refund = triggerRefund(
      customer_id,
      amount,
      reason
    );

    if (!refund) {
      return {
        content: [
          {
            type: "text",
            text: `Cannot refund: customer ${customer_id} was not found.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(refund, null, 2),
        },
      ],
      structuredContent: { ...refund },
    };
  }
);

// Connect using stdio transport.
async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // IMPORTANT:
  // stdout is reserved for MCP JSON-RPC messages.
  // Always use stderr for logging.
  console.error("QuilrAI MCP Server running on stdio");
}

main().catch((error: unknown) => {
  console.error("MCP Server startup failed:", error);
  process.exitCode = 1;
});
