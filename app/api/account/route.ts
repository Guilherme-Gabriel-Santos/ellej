import {
  beginCustomerPasswordReset,
  beginCustomerRegistration,
  clearCustomerSessionCookie,
  customerSummary,
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  readCustomerAccount,
  resetCustomerPassword,
  setCustomerSessionCookie,
  verifyCustomerRegistration,
} from "../../../lib/customer-auth";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { turnstileSiteKey, verifyTurnstile } from "../../../lib/turnstile";

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
  return error instanceof Error ? error.message : "Não foi possível concluir agora. Tente novamente.";
}

function localCodeAllowed(request: Request) {
  const hostname = new URL(request.url).hostname;
  return ["localhost", "127.0.0.1"].includes(hostname) && process.env.NODE_ENV !== "production";
}

export async function GET(request: Request) {
  try {
    const session = await getCustomerSession(request);
    if (!session) return response({ account: null, orders: [], turnstileSiteKey: turnstileSiteKey() });
    return response({ ...await readCustomerAccount(session), turnstileSiteKey: turnstileSiteKey() });
  } catch (error) {
    return response({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request, 16 * 1024);
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return response({ error: "Formato da solicitação inválido." }, 400);
    }
    const action = String(payload.action ?? "");
    const email = String(payload.email ?? "").trim().toLowerCase();
    const allowLocalCode = localCodeAllowed(request);

    if (action === "register") {
      await enforceRateLimit(request, "customer.register", 4, 60 * 60, email);
      await verifyTurnstile(request, payload.turnstileToken, "customer_register");
      const challenge = await beginCustomerRegistration(
        String(payload.name ?? ""),
        email,
        String(payload.phone ?? ""),
        String(payload.password ?? ""),
        allowLocalCode,
      );
      return response({ ok: true, ...challenge }, 201);
    }
    if (action === "verify") {
      await enforceRateLimit(request, "customer.verify", 10, 15 * 60, String(payload.challengeId ?? ""));
      const verified = await verifyCustomerRegistration(String(payload.challengeId ?? ""), String(payload.code ?? ""));
      return response({ ok: true, account: verified.account }, 200, setCustomerSessionCookie(request, verified.token));
    }
    if (action === "login") {
      await enforceRateLimit(request, "customer.login", 10, 15 * 60, email);
      await verifyTurnstile(request, payload.turnstileToken, "customer_login");
      const login = await loginCustomer(email, String(payload.password ?? ""));
      return response({ ok: true, account: login.account }, 200, setCustomerSessionCookie(request, login.token));
    }
    if (action === "forgotPassword") {
      await enforceRateLimit(request, "customer.password.request", 4, 60 * 60, email);
      await verifyTurnstile(request, payload.turnstileToken, "password_reset_request");
      const reset = await beginCustomerPasswordReset(email, allowLocalCode);
      return response({ ok: true, message: "Se o e-mail estiver cadastrado, enviaremos um código.", ...reset });
    }
    if (action === "resetPassword") {
      await enforceRateLimit(request, "customer.password.reset", 10, 15 * 60, String(payload.challengeId ?? ""));
      const reset = await resetCustomerPassword(String(payload.challengeId ?? ""), String(payload.code ?? ""), String(payload.password ?? ""));
      return response({ ok: true, account: reset.account }, 200, setCustomerSessionCookie(request, reset.token));
    }
    if (action === "logout") {
      await enforceRateLimit(request, "customer.session", 30, 60);
      const session = await getCustomerSession(request);
      await logoutCustomer(session);
      return response({ ok: true, account: customerSummary(null) }, 200, clearCustomerSessionCookie(request));
    }
    return response({ error: "Ação inválida." }, 400);
  } catch (error) {
    if (error instanceof RateLimitError) return response({ error: error.message }, 429, undefined, error.retryAfter);
    return response({ error: errorMessage(error) }, 400);
  }
}
