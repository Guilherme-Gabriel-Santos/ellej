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
  createCategory,
  createBanner,
  createProduct,
  deleteBanner,
  deleteCategory,
  readAdminDashboard,
  reorderCategories,
  reorderBanners,
  setBannerActive,
  setCategoryActive,
  setProductActive,
  updateCategory,
  updateBanner,
  updateOrderStatus,
  updateProduct,
} from "../../../lib/admin-store";
import { assertJsonRequest, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { createSuperFreteShipment, paySuperFreteShipment, printSuperFreteShipment, refreshSuperFreteShipment } from "../../../lib/superfrete";

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
    assertJsonRequest(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const localHost = ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
    const allowLocalCode = localHost && process.env.NODE_ENV !== "production";

    if (action === "setup") {
      await enforceRateLimit(request, "admin.setup", 5, 60 * 60);
      await setupAdmin(String(payload.email ?? ""), String(payload.password ?? ""), String(payload.setupKey ?? ""));
      return response({ ok: true }, 201);
    }
    if (action === "login") {
      await enforceRateLimit(request, "admin.login", 10, 15 * 60);
      const challenge = await beginAdminLogin(String(payload.email ?? ""), String(payload.password ?? ""), allowLocalCode);
      return response({ ok: true, ...challenge });
    }
    if (action === "verify") {
      await enforceRateLimit(request, "admin.verify", 15, 15 * 60);
      const verified = await verifyAdminCode(String(payload.challengeId ?? ""), String(payload.code ?? ""));
      return response(
        { authenticated: true, admin: { email: verified.email }, dashboard: await readAdminDashboard() },
        200,
        setSessionCookie(request, verified.token),
      );
    }
    if (action === "logout") {
      await enforceRateLimit(request, "admin.session", 60, 60);
      const session = await getAdminSession(request);
      await logoutAdmin(session);
      return response({ ok: true }, 200, clearSessionCookie(request));
    }

    await enforceRateLimit(request, "admin.mutation", 60, 60);
    const session = await requireAdminSession(request);
    if (action === "createProduct") await createProduct(session, payload.product as Record<string, unknown>);
    else if (action === "updateProduct") await updateProduct(session, payload.product as Record<string, unknown>);
    else if (action === "setProductActive") await setProductActive(session, String(payload.productId ?? ""), Boolean(payload.active));
    else if (action === "createCategory") await createCategory(session, payload.category as Record<string, unknown>);
    else if (action === "updateCategory") await updateCategory(session, payload.category as Record<string, unknown>);
    else if (action === "setCategoryActive") await setCategoryActive(session, String(payload.categoryId ?? ""), Boolean(payload.active));
    else if (action === "reorderCategories") await reorderCategories(session, payload.orderedIds);
    else if (action === "deleteCategory") await deleteCategory(session, String(payload.categoryId ?? ""));
    else if (action === "createBanner") await createBanner(session, payload.banner as Record<string, unknown>);
    else if (action === "updateBanner") await updateBanner(session, payload.banner as Record<string, unknown>);
    else if (action === "setBannerActive") await setBannerActive(session, String(payload.bannerId ?? ""), Boolean(payload.active));
    else if (action === "reorderBanners") await reorderBanners(session, payload.orderedIds);
    else if (action === "deleteBanner") await deleteBanner(session, String(payload.bannerId ?? ""));
    else if (action === "updateOrderStatus") await updateOrderStatus(session, String(payload.orderId ?? ""), String(payload.status ?? ""));
    else if (action === "createSuperFreteShipment") await createSuperFreteShipment(String(payload.orderId ?? ""));
    else if (action === "paySuperFreteShipment") await paySuperFreteShipment(String(payload.orderId ?? ""));
    else if (action === "refreshSuperFreteShipment") await refreshSuperFreteShipment(String(payload.orderId ?? ""));
    else if (action === "printSuperFreteShipment") {
      const labelUrl = await printSuperFreteShipment(String(payload.orderId ?? ""));
      return response({ ok: true, labelUrl, dashboard: await readAdminDashboard() });
    }
    else if (action === "changePassword") {
      await changeAdminPassword(session, String(payload.currentPassword ?? ""), String(payload.nextPassword ?? ""));
      return response({ ok: true, signedOut: true }, 200, clearSessionCookie(request));
    } else return response({ error: "Ação inválida." }, 400);

    return response({ ok: true, dashboard: await readAdminDashboard() });
  } catch (error) {
    if (error instanceof RateLimitError) return response({ error: error.message }, 429, undefined, error.retryAfter);
    const message = errorMessage(error);
    if (message === "UNAUTHORIZED") return response({ error: "Sua sessão expirou. Entre novamente." }, 401, clearSessionCookie(request));
    return response({ error: message }, 400);
  }
}
