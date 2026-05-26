import { FETCH_RETRY, REQUEST_TIMEOUT_MS } from "@seitai-legal-watch/core";

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < FETCH_RETRY; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SeitaiLegalWatch/0.1; +https://github.com)",
          Accept: "application/json, application/xml, text/xml, text/html, */*",
          "Accept-Language": "ja,en;q=0.9",
          "Accept-Encoding": "identity",
          ...(init?.headers ?? {}),
        },
      });
      if (RETRYABLE_HTTP_STATUS.has(res.status) && i < FETCH_RETRY - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}
