const DEFAULT_BACKEND_URL = "http://localhost:8000";

function normalizeBackendBaseUrl(raw: string): string {
  let value = raw;

  // Common copy/paste issues from dashboards and terminals.
  value = value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  // If the user provided only a host (no scheme), pick a sensible default.
  if (!/^https?:\/\//i.test(value)) {
    const looksLocal =
      /^localhost(?::\d+)?$/i.test(value) ||
      /^127\.0\.0\.1(?::\d+)?$/.test(value) ||
      /^0\.0\.0\.0(?::\d+)?$/.test(value) ||
      /^10\./.test(value) ||
      /^192\.168\./.test(value) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);

    value = `${looksLocal ? "http" : "https"}://${value}`;
  }

  const url = new URL(value);

  // Ensure we always store an origin only (no path/query/hash).
  return url.origin.replace(/\/+$/, "");
}

export function getBackendBaseUrl(): string {
  // Prefer a server-only env var if you add it in Cloudflare dashboard.
  const url =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    DEFAULT_BACKEND_URL;

  return normalizeBackendBaseUrl(url);
}

export function buildBackendUrl(pathname: string): string {
  const base = getBackendBaseUrl();
  const baseUrl = new URL(base);
  return new URL(pathname.replace(/^\/+/, "/"), baseUrl).toString();
}

export function passthroughHeaders(from: Headers): Headers {
  const headers = new Headers();

  // Allowlist common useful headers.
  const allow = new Set([
    "content-type",
    "content-disposition",
    "content-length",
    "etag",
    "last-modified",
    "accept-ranges",
    "cache-control",
    "x-code-file-path",
    "x-success",
    "x-query",
    "x-request-id",
  ]);

  for (const [key, value] of from.entries()) {
    const lower = key.toLowerCase();
    if (allow.has(lower)) headers.set(key, value);
  }

  // Avoid caching dynamic backend responses by default.
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");

  return headers;
}
