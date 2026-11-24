import { env } from "cloudflare:workers";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { MIN_VIP_TOKEN_LENGTH, vipCookieHeader, vipPasswordMatches } from "../../../lib/vip-access";

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

/** Senha do grupo VIP: libera o cookie de acesso antecipado. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request, 1024);
    await enforceRateLimit(request, "vip.access.ip", 10, 15 * 60);
    const token = String(env.VIP_ACCESS_TOKEN ?? "");
    if (token.length < MIN_VIP_TOKEN_LENGTH || !String(env.VIP_PASSWORD ?? "").trim()) {
      return json({ error: "O acesso VIP ainda não está disponível." }, 503);
    }
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Formato da solicitação inválido." }, 400);
    }
    if (!(await vipPasswordMatches(payload.password, env.VIP_PASSWORD))) {
      return json({ error: "Senha incorreta. Confira a senha enviada no grupo VIP." }, 401);
    }
    return json({ ok: true }, 200, { "Set-Cookie": await vipCookieHeader(token, env.LAUNCH_AT) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return json({ error: "Muitas tentativas. Espere alguns minutos e tente de novo." }, 429, { "Retry-After": String(error.retryAfter) });
    }
    const message = error instanceof Error ? error.message : "";
    const safe = /Origem|Formato|muito grande/i.test(message) ? message : "Não foi possível verificar agora. Tente novamente.";
    if (safe !== message) console.error("VIP access failed", { error: message });
    return json({ error: safe }, 400);
  }
}
