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
  beginPasskeyLogin,
  beginPasskeyRegistration,
  deleteAdminPasskey,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  hasAdminPasskeys,
  listAdminPasskeys,
} from "../../../lib/admin-passkeys";
import {
  createCategory,
  createBanner,
  createCoupon,
  createProduct,
  createReview,
  deleteBanner,
  deleteCategory,
  deleteCoupon,
  deleteReview,
  readAdminDashboard,
  reorderProducts,
  reorderCategories,
  reorderBanners,
  reorderReviews,
  setBannerActive,
  setCategoryActive,
  setCouponActive,
  setProductActive,
  setReviewActive,
  updateAllCategoryImage,
  updateCategory,
  updateCoupon,
  updateBanner,
  updateOrderStatus,
  updateProduct,
  updateReview,
  saveLaunchTeasers,
  sendLaunchTest,
} from "../../../lib/admin-store";
import { assertJsonRequest, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { createSuperFreteShipment, paySuperFreteShipment, printSuperFreteShipment, refreshSuperFreteShipment } from "../../../lib/superfrete";
import { env } from "cloudflare:workers";
import { clearStorePreviewCookie, createStorePreviewCookie } from "../../../lib/store-preview";

function response(data: unknown, status = 200, cookie?: string | string[], retryAfter?: number) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const value of typeof cookie === "string" ? [cookie] : (cookie ?? [])) headers.append("Set-Cookie", value);
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(data), { status, headers });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora.";
}

async function adminPayload(userId: string, email: string) {
  return {
    authenticated: true,
    admin: { email, passkeys: await listAdminPasskeys(userId) },
    dashboard: await readAdminDashboard(),
  };
}

export async function GET(request: Request) {
  try {
    const session = await getAdminSession(request);
    const setup = await getAdminSetupState();
    if (!session) return response({ authenticated: false, passkeyLoginAvailable: await hasAdminPasskeys(), ...setup });
    return response(await adminPayload(session.userId, session.email));
  } catch (error) {
    return response({ error: errorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return response({ error: "Formato da solicitação inválido." }, 400);
    }
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
      const login = await beginAdminLogin(String(payload.email ?? ""), String(payload.password ?? ""), allowLocalCode);
      if (login.authenticated) {
        return response(
          await adminPayload(login.userId, login.email),
          200,
          setSessionCookie(request, login.token),
        );
      }
      return response({ ok: true, ...login });
    }
    if (action === "verify") {
      await enforceRateLimit(request, "admin.verify", 15, 15 * 60);
      const verified = await verifyAdminCode(String(payload.challengeId ?? ""), String(payload.code ?? ""));
      return response(
        await adminPayload(verified.userId, verified.email),
        200,
        setSessionCookie(request, verified.token),
      );
    }
    if (action === "beginPasskeyLogin") {
      await enforceRateLimit(request, "admin.passkey.begin", 10, 15 * 60);
      return response(await beginPasskeyLogin(request));
    }
    if (action === "finishPasskeyLogin") {
      await enforceRateLimit(request, "admin.passkey.finish", 15, 15 * 60);
      const login = await finishPasskeyLogin(request, String(payload.challengeId ?? ""), payload.response);
      return response(
        await adminPayload(login.userId, login.email),
        200,
        setSessionCookie(request, login.token),
      );
    }
    if (action === "logout") {
      await enforceRateLimit(request, "admin.session", 60, 60);
      const session = await getAdminSession(request);
      await logoutAdmin(session);
      return response({ ok: true }, 200, [clearSessionCookie(request), clearStorePreviewCookie()]);
    }

    await enforceRateLimit(request, "admin.mutation", 60, 60);
    const session = await requireAdminSession(request);
    if (action === "enableStorePreview") {
      return response(
        { ok: true, previewUrl: "/", expiresInMinutes: 30 },
        200,
        await createStorePreviewCookie(String(env.AUTH_SECRET ?? "")),
      );
    }
    else if (action === "beginPasskeyRegistration") {
      return response(await beginPasskeyRegistration(request, session));
    }
    else if (action === "finishPasskeyRegistration") {
      const passkeys = await finishPasskeyRegistration(request, session, String(payload.challengeId ?? ""), payload.response, payload.label);
      return response({ ok: true, passkeys });
    }
    else if (action === "deletePasskey") {
      const passkeys = await deleteAdminPasskey(session, String(payload.credentialId ?? ""));
      return response({ ok: true, passkeys });
    }
    else if (action === "createProduct") {
      const productId = await createProduct(session, payload.product as Record<string, unknown>);
      return response({ ok: true, productId }, 201);
    }
    else if (action === "updateProduct") {
      const productId = await updateProduct(session, payload.product as Record<string, unknown>);
      return response({ ok: true, productId });
    }
    else if (action === "setProductActive") await setProductActive(session, String(payload.productId ?? ""), Boolean(payload.active));
    else if (action === "reorderProducts") await reorderProducts(session, payload.orderedIds);
    else if (action === "createCategory") await createCategory(session, payload.category as Record<string, unknown>);
    else if (action === "updateCategory") await updateCategory(session, payload.category as Record<string, unknown>);
    else if (action === "setCategoryActive") await setCategoryActive(session, String(payload.categoryId ?? ""), Boolean(payload.active));
    else if (action === "reorderCategories") await reorderCategories(session, payload.orderedIds);
    else if (action === "deleteCategory") await deleteCategory(session, String(payload.categoryId ?? ""));
    else if (action === "updateAllCategoryImage") await updateAllCategoryImage(session, payload.image);
    else if (action === "createBanner") await createBanner(session, payload.banner as Record<string, unknown>);
    else if (action === "updateBanner") await updateBanner(session, payload.banner as Record<string, unknown>);
    else if (action === "setBannerActive") await setBannerActive(session, String(payload.bannerId ?? ""), Boolean(payload.active));
    else if (action === "reorderBanners") await reorderBanners(session, payload.orderedIds);
    else if (action === "deleteBanner") await deleteBanner(session, String(payload.bannerId ?? ""));
    else if (action === "createCoupon") await createCoupon(session, payload.coupon as Record<string, unknown>);
    else if (action === "updateCoupon") await updateCoupon(session, payload.coupon as Record<string, unknown>);
    else if (action === "setCouponActive") await setCouponActive(session, String(payload.couponId ?? ""), Boolean(payload.active));
    else if (action === "deleteCoupon") await deleteCoupon(session, String(payload.couponId ?? ""));
    else if (action === "createReview") await createReview(session, payload.review as Record<string, unknown>);
    else if (action === "updateReview") await updateReview(session, payload.review as Record<string, unknown>);
    else if (action === "setReviewActive") await setReviewActive(session, String(payload.reviewId ?? ""), Boolean(payload.active));
    else if (action === "reorderReviews") await reorderReviews(session, payload.orderedIds);
    else if (action === "deleteReview") await deleteReview(session, String(payload.reviewId ?? ""));
    else if (action === "saveLaunchTeasers") await saveLaunchTeasers(session, payload.productIds);
    else if (action === "sendLaunchTest") await sendLaunchTest(session);
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
