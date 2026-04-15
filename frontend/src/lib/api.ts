type ApiErrorPayload = {
  error?: string;
};

function looksLikeHtml(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

async function parseApiBody<T>(response: Response): Promise<T | ApiErrorPayload> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as T | ApiErrorPayload;
  }

  const text = await response.text();

  if (looksLikeHtml(text)) {
    throw new Error(
      "Backend API returned HTML instead of JSON. Check NEXT_PUBLIC_API_BASE_URL or your /api routing."
    );
  }

  throw new Error(text || `Backend API returned an unexpected response (${contentType || "unknown"}).`);
}

export async function fetchApiJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the API route. Check NEXT_PUBLIC_API_BASE_URL and verify your Next.js app is running."
      );
    }

    throw error;
  }

  const payload = await parseApiBody<T>(response);

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Backend request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return payload as T;
}
