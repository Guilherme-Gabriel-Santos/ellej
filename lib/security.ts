import { env } from "cloudflare:workers";
import { ensureStoreSchema, getD1 } from "./store";

const encoder = new TextEncoder();

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super("Muitas tentativas. Aguarde um pouco e tente novamente.");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function anonymousClientKey(request: Request, fallback = "anonymous") {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  const identity = fallback === "anonymous" ? address : `${address}:${fallback}`;
  const secret = env.AUTH_SECRET ?? "local-development-only";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${secret}:${identity}`));
  return bytesToHex(new Uint8Array(digest));
}

export function assertSameOrigin(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== url.origin) throw new Error("Origem da solicitação inválida.");
    return;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new Error("Origem da solicitação inválida.");
  }
  if (!local && !fetchSite) throw new Error("Origem da solicitação ausente.");
}

export function assertJsonRequest(request: Request, maximumBytes = 32 * 1024) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new Error("Formato da solicitação inválido.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maximumBytes) throw new Error("Solicitação muito grande.");
}

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  fallbackKey?: string,
) {
  await ensureStoreSchema();
  const client = await anonymousClientKey(request, fallbackKey);
  const key = `${scope}:${client}`;
  const now = Date.now();
  const expiresAt = now + windowSeconds * 1000;
  const d1 = getD1();
  await d1
    .prepare(
      "INSERT INTO request_rate_limits (key, count, expires_at) VALUES (?, 1, ?) " +
        "ON CONFLICT(key) DO UPDATE SET " +
        "count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END, " +
        "expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END",
    )
    .bind(key, expiresAt, now, now)
    .run();
  const row = await d1
    .prepare("SELECT count, expires_at FROM request_rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; expires_at: number }>();
  if (Number(row?.count ?? 0) > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((Number(row?.expires_at ?? expiresAt) - now) / 1000)));
  }
}
