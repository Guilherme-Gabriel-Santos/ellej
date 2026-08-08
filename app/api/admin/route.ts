import {
  assertSameOrigin,
  beginAdminLogin,
  changeAdminPassword,
  clearSessionCookie,
  getAdminSession,
  getAdminSetupState,
  logoutAdmin,
  requireAdminSession,
  setSessionCookie,
  setupAdmin,
  verifyAdminCode,
} from "../../../lib/admin-auth";
import {
  createProduct,
  readAdminDashboard,
  setProductActive,
  updateOrderStatus,
  updateProduct,
} from "../../../lib/admin-store";

function response(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora.";
}

export async function GET(request: Request) {
  try {
    const session = await getAdminSession(request);
    const setup = await getAdminSetupState();
    if (!session) return response({ authenticated: false, ...setup });
    return response({ authenticated: true, admin: { email: session.email }, dashboard: await readAdminDashboard() });
  } catch (error) {
    return response({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const localHost = ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
    const allowLocalCode = localHost && process.env.NODE_ENV !== "production";

    if (action === "setup") {
      await setupAdmin(String(payload.email ?? ""), String(payload.password ?? ""), String(payload.setupKey ?? ""));
      return response({ ok: true }, 201);
    }
    if (action === "login") {
      const challenge = await beginAdminLogin(String(payload.email ?? ""), String(payload.password ?? ""), allowLocalCode);
      return response({ ok: true, ...challenge });
    }
    if (action === "verify") {
      const verified = await verifyAdminCode(String(payload.challengeId ?? ""), String(payload.code ?? ""));
      return response(
        { authenticated: true, admin: { email: verified.email }, dashboard: await readAdminDashboard() },
        200,
        setSessionCookie(request, verified.token),
      );
    }
    if (action === "logout") {
      const session = await getAdminSession(request);
      await logoutAdmin(session);
      return response({ ok: true }, 200, clearSessionCookie(request));
    }

    const session = await requireAdminSession(request);
    if (action === "createProduct") await createProduct(session, payload.product as Record<string, unknown>);
    else if (action === "updateProduct") await updateProduct(session, payload.product as Record<string, unknown>);
    else if (action === "setProductActive") await setProductActive(session, String(payload.productId ?? ""), Boolean(payload.active));
    else if (action === "updateOrderStatus") await updateOrderStatus(session, String(payload.orderId ?? ""), String(payload.status ?? ""));
    else if (action === "changePassword") {
      await changeAdminPassword(session, String(payload.currentPassword ?? ""), String(payload.nextPassword ?? ""));
      return response({ ok: true, signedOut: true }, 200, clearSessionCookie(request));
    } else return response({ error: "Ação inválida." }, 400);

    return response({ ok: true, dashboard: await readAdminDashboard() });
  } catch (error) {
    const message = errorMessage(error);
    if (message === "UNAUTHORIZED") return response({ error: "Sua sessão expirou. Entre novamente." }, 401, clearSessionCookie(request));
    return response({ error: message }, 400);
  }
}
