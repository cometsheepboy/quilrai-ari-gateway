
import "dotenv/config";

import express from "express";

const app = express();

app.use(express.json());

const PORT = 3006;

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type ProviderMode = "success" | "429" | "timeout" | "500";

async function handleProvider(
  req: express.Request,
  res: express.Response,
  provider: "primary" | "backup"
): Promise<void> {
  const mode = (
    provider === "primary"
      ? process.env.PRIMARY_MODE ?? "success"
      : process.env.BACKUP_MODE ?? "success"
  ) as ProviderMode;

  console.error(
    `${provider} provider received request (mode: ${mode})`
  );

  if (mode === "timeout") {
    await delay(5000);
  }

  if (mode === "429") {
    res.status(429).json({
      error: {
        message: "Provider rate limit exceeded",
      },
    });
    return;
  }

  if (mode === "500") {
    res.status(500).json({
      error: {
        message: "Internal mock provider failure",
      },
    });
    return;
  }

  res.json({
    id: `completion-${provider}`,
    object: "chat.completion",
    model: provider === "primary" ? "model-a" : "model-b",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `Hello from ${provider} model!`,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 15,
      total_tokens: 25,
    },
  });
}

app.post("/primary", async (req, res) => {
  await handleProvider(req, res, "primary");
});

app.post("/backup", async (req, res) => {
  await handleProvider(req, res, "backup");
});

app.listen(PORT, () => {
  console.error(
    `Mock model providers listening on port ${PORT}`
  );
});
