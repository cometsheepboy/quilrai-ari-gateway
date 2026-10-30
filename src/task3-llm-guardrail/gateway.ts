
import "dotenv/config";

import express from "express";
import { PiiRedactor } from "./pii-redactor.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = Number(
  process.env.LLM_GATEWAY_PORT ?? 3003
);

const PROVIDER_URL =
  process.env.LLM_PROVIDER_URL ??
  "http://localhost:3004/v1/chat/completions";

interface StreamEvent {
  [key: string]: unknown;
  choices?: Array<{
    index?: number;
    delta?: {
      content?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
}

function sendDelta(
  res: express.Response,
  content: string
): void {
  if (!content) return;

  const event = {
    id: "chatcmpl-gateway-001",
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  };

  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function processSseEvent(
  eventText: string,
  redactor: PiiRedactor,
  res: express.Response
): boolean {
  const dataLines = eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return false;
  }

  const data = dataLines.join("\n");

  if (data === "[DONE]") {
    const remaining = redactor.flush();

    sendDelta(res, remaining);

    res.write("data: [DONE]\n\n");

    return true;
  }

  let event: StreamEvent;

  try {
    event = JSON.parse(data) as StreamEvent;
  } catch {
    // Never forward an unparseable event blindly.
    throw new Error("Invalid upstream SSE event");
  }

    const choice = event.choices?.[0];
    const content = choice?.delta?.content;

    if (
    choice &&
    choice.delta &&
    typeof content === "string"
    ) {
    const sanitized = redactor.push(content);

    if (sanitized) {
        choice.delta.content = sanitized;

        res.write(
        `data: ${JSON.stringify(event)}\n\n`
        );
    }
    } else {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

  return false;
}

app.post("/v1/chat/completions", async (req, res) => {
  if (req.body?.stream !== true) {
    return res.status(400).json({
      error: {
        message: "This gateway requires stream=true",
      },
    });
  }

  const controller = new AbortController();

  // Stop the upstream request if the client disconnects.
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const upstream = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({
        error: {
          message: "LLM provider request failed",
        },
      });
    }

    res.status(200);
    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const redactor = new PiiRedactor();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let completed = false;

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events end with a blank line.
      while (true) {
        const separator = /\r?\n\r?\n/.exec(buffer);

        if (!separator || separator.index === undefined) {
          break;
        }

        const eventText = buffer.slice(
          0,
          separator.index
        );

        buffer = buffer.slice(
          separator.index + separator[0].length
        );

        completed = processSseEvent(
          eventText,
          redactor,
          res
        );

        if (completed) break;
      }

      if (completed) break;
    }

    // Flush any remaining decoder bytes and incomplete event.
    buffer += decoder.decode();

    if (!completed && buffer.trim()) {
      completed = processSseEvent(
        buffer,
        redactor,
        res
      );
    }

    // Flush remaining text if the provider ended without [DONE].
    if (!completed) {
      sendDelta(res, redactor.flush());
      res.write("data: [DONE]\n\n");
    }

    res.end();
  } catch (error) {
    console.error("LLM gateway error:", error);

    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: "LLM gateway unavailable",
        },
      });
    } else if (!res.destroyed) {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.error(
    `LLM Streaming Gateway listening on port ${PORT}`
  );
});
