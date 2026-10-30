
export interface ProviderResult {
  success: boolean;
  status: number;
  data?: unknown;
  failure?: "timeout" | "upstream";
}

export interface ModelRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  max_tokens: number;
}

export async function callModelProvider(
  url: string,
  payload: ModelRequest,
  timeoutMs: number
): Promise<ProviderResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        failure: "upstream",
      };
    }

    const data: unknown = await response.json();

    return {
      success: true,
      status: response.status,
      data,
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (
        error.name === "TimeoutError" ||
        error.name === "AbortError"
      );

    return {
      success: false,
      status: 0,
      failure: isTimeout ? "timeout" : "upstream",
    };
  }
}

export async function routeToModel(
  payload: ModelRequest
): Promise<{
  data: unknown;
  provider: "primary" | "backup";
}> {
  const primaryUrl =
    process.env.PRIMARY_MODEL_URL!;

  const backupUrl =
    process.env.BACKUP_MODEL_URL!;

  const timeoutMs = Number(
    process.env.PRIMARY_TIMEOUT_MS ?? 3000
  );

  const primary = await callModelProvider(
    primaryUrl,
    payload,
    timeoutMs
  );

  if (primary.success) {
    return {
      data: primary.data,
      provider: "primary",
    };
  }

  // Only 429 and timeout trigger fallback.
  const shouldFallback =
    primary.status === 429 ||
    primary.failure === "timeout";

  if (!shouldFallback) {
    throw new Error("PRIMARY_PROVIDER_FAILURE");
  }

  console.error(
    `Primary provider failed (${primary.failure ?? primary.status}). Switching to backup.`
  );

  const backup = await callModelProvider(
    backupUrl,
    payload,
    10000
  );

  if (!backup.success) {
    throw new Error("ALL_PROVIDERS_FAILED");
  }

  return {
    data: backup.data,
    provider: "backup",
  };
}
