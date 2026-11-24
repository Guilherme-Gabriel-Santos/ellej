import { env } from "cloudflare:workers";

export type TurnstileAction = "customer_login" | "customer_register" | "password_reset_request" | "launch_waitlist";

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const verificationError = "Não foi possível confirmar a verificação de segurança. Tente novamente.";

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function expectedHostnames() {
  return new Set(
    String(env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function turnstileSiteKey() {
  return String(env.TURNSTILE_SITE_KEY ?? "").trim();
}

export async function verifyTurnstile(request: Request, token: unknown, expectedAction: TurnstileAction) {
  if (isLocalRequest(request) && process.env.NODE_ENV !== "production") return;

  const secret = String(env.TURNSTILE_SECRET ?? "").trim();
  const responseToken = typeof token === "string" ? token.trim() : "";
  const requestHostname = new URL(request.url).hostname.toLowerCase();
  const hostnames = expectedHostnames();
  if (!secret || !responseToken || responseToken.length > 2048 || !hostnames.has(requestHostname)) {
    throw new Error(verificationError);
  }

  const body = new URLSearchParams({
    secret,
    response: responseToken,
  });
  const clientIp = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "")
    .split(",")[0]
    .trim();
  if (clientIp) body.set("remoteip", clientIp);

  let result: SiteverifyResponse;
  try {
    const verification = await fetch(siteverifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!verification.ok) throw new Error(`Siteverify respondeu ${verification.status}`);
    result = await verification.json() as SiteverifyResponse;
  } catch {
    throw new Error(verificationError);
  }

  if (
    result.success !== true ||
    result.action !== expectedAction ||
    String(result.hostname ?? "").toLowerCase() !== requestHostname ||
    !hostnames.has(String(result.hostname ?? "").toLowerCase())
  ) {
    throw new Error(verificationError);
  }
}
