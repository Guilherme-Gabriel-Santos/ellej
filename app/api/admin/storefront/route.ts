import { clearSessionCookie, getAdminSession, requireAdminSession } from "../../../../lib/admin-auth";
import { reorderStorefrontProducts } from "../../../../lib/admin-store";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../../lib/security";

function response(data: unknown, status = 200, cookie?: string, retryAfter?: number) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(data), { status, headers });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora.";
}

export async function GET(request: Request) {
  try {
    const session = await getAdminSession(request);
    return response(session
      ? { authenticated: true, admin: { email: session.email } }
      : { authenticated: false });
  } catch (error) {
    return response({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    await enforceRateLimit(request, "admin.storefront", 60, 60 * 60);
    const session = await requireAdminSession(request);
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return response({ error: "Formato da solicitação inválido." }, 400);
    }
    if (payload.action !== "reorderProducts") return response({ error: "Ação inválida." }, 400);
    const orderedIds = await reorderStorefrontProducts(session, payload.orderedIds);
    return response({ ok: true, orderedIds });
  } catch (error) {
    if (error instanceof RateLimitError) return response({ error: error.message }, 429, undefined, error.retryAfter);
    const message = errorMessage(error);
    if (message === "UNAUTHORIZED") return response({ error: "Sua sessão administrativa expirou. Entre novamente no painel." }, 401, clearSessionCookie(request));
    return response({ error: message }, 400);
  }
}
