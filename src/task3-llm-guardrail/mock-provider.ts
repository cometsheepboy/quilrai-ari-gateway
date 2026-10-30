
import "dotenv/config";

import express from "express";

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = Number(
  process.env.LLM_PROVIDER_PORT ?? 3004
);

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

app.post("/v1/chat/completions", async (req, res) => {
  if (req.body?.stream !== true) {
    return res.status(400).json({
      error: {
        message: "Streaming must be enabled",
      },
    });
  }

  res.setHeader(
    "Content-Type",
    "text/event-stream; charset=utf-8"
  );
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Deliberately split PII across separate deltas.
    const chunks = [
    "Safe introductory text. ".repeat(15),
    "Hello! ",
    "Contact me at john.doe@",
    "example.com for help. ",
    "My SSN is 123-",
    "45-6789. ",
    "My card number is ",
    "4111111111111111. ",
    "Thank you!",
    ];

  try {
    for (const content of chunks) {
      await delay(100);

      const event = {
        id: "chatcmpl-mock-001",
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

    // Final completion event.
    res.write(
      `data: ${JSON.stringify({
        id: "chatcmpl-mock-001",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      })}\n\n`
    );

    res.write("data: [DONE]\n\n");
    res.end();
  } catch {
    if (!res.destroyed) {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.error(
    `Mock LLM provider listening on port ${PORT}`
  );
});
