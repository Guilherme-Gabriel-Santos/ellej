import {
  createOrder,
  cartHasFreeShipping,
  ensureStoreSchema,
  packageForCart,
  previewCoupon,
  publicStore,
  readStore,
  readStoreVisitorState,
  subscribe,
  toggleFavorite,
  updateCart,
} from "../../../lib/store";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { createAsaasCheckout } from "../../../lib/asaas";
import { lookupCep } from "../../../lib/brazil";
import { calculateSuperFrete } from "../../../lib/superfrete";
import { customerSummary, getCustomerSession } from "../../../lib/customer-auth";
import { deliverOrderNotification } from "../../../lib/order-email";

const visitorCookie = "ellejew_visitor";

function visitorFrom(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${visitorCookie}=([^;]+)`));
  const current = match?.[1] ? decodeURIComponent(match[1]) : null;
  return current && /^[a-zA-Z0-9-]{10,80}$/.test(current)
    ? { id: current, fresh: false }
    : { id: crypto.randomUUID(), fresh: true };
}

function json(data: unknown, visitor: { id: string; fresh: boolean }, status = 200, retryAfter?: number) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  if (visitor.fresh) {
    headers.append(
      "Set-Cookie",
      `${visitorCookie}=${encodeURIComponent(visitor.id)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`,
    );
  }
  return new Response(JSON.stringify(data), { status, headers });
}

const genericError = "Não foi possível concluir agora. Tente novamente.";

function messageFrom(error: unknown) {
  if (!(error instanceof Error)) return genericError;
  // Erros de infraestrutura (D1/SQLite, runtime) não devem chegar à cliente.
  if (/D1_|SQLITE|no such (table|column)|internal error|network connection lost|fetch failed|TypeError|undefined|null/i.test(error.message) || error.name === "TypeError") {
    console.error("Store request failed", { error: error.message });
    return genericError;
  }
  return error.message;
}

export async function GET(request: Request) {
  const visitor = visitorFrom(request);
  try {
    await ensureStoreSchema();
    const url = new URL(request.url);
    if (url.searchParams.get("state") === "1") {
      const [state, session] = await Promise.all([readStoreVisitorState(visitor.id), getCustomerSession(request)]);
      return json({ ...state, account: customerSummary(session) }, visitor);
    }
    const productSlug = url.searchParams.get("product") ?? "";
    const [store, session] = await Promise.all([readStore(visitor.id, productSlug), getCustomerSession(request)]);
    return json({ ...publicStore(store), account: customerSummary(session) }, visitor);
  } catch (error) {
    return json({ error: messageFrom(error) }, visitor, 500);
  }
}

export async function POST(request: Request) {
  const visitor = visitorFrom(request);
  try {
    assertSameOrigin(request);
    assertJsonRequest(request);
    await ensureStoreSchema();
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Formato da solicitação inválido." }, visitor, 400);
    }
    const action = String(payload.action ?? "");
    const session = await getCustomerSession(request);

    if (action === "favorite") {
      await enforceRateLimit(request, "store.favorite.ip", 300, 60);
      await enforceRateLimit(request, "store.favorite", 90, 60, visitor.id);
      const store = await toggleFavorite(visitor.id, String(payload.productId ?? ""));
      return json({ store: { ...publicStore(store), account: customerSummary(session) } }, visitor);
    }
    if (action === "cart") {
      await enforceRateLimit(request, "store.cart.ip", 300, 60);
      await enforceRateLimit(request, "store.cart", 90, 60, visitor.id);
      const store = await updateCart(visitor.id, String(payload.productId ?? ""), Number(payload.quantity ?? 0), String(payload.variantId ?? ""), String(payload.personalizationText ?? ""), typeof payload.previousPersonalizationText === "string" ? payload.previousPersonalizationText : undefined);
      return json({ store: { ...publicStore(store), account: customerSummary(session) } }, visitor);
    }
    if (action === "subscribe") {
      await enforceRateLimit(request, "store.subscribe.ip", 20, 60 * 60);
      await enforceRateLimit(request, "store.subscribe", 5, 60 * 60, visitor.id);
      await subscribe(String(payload.email ?? ""));
      return json({ ok: true }, visitor, 201);
    }
    if (action === "lookupCep") {
      await enforceRateLimit(request, "store.cep.ip", 120, 60 * 60);
      await enforceRateLimit(request, "store.cep", 30, 60, visitor.id);
      return json({ address: await lookupCep(payload.cep) }, visitor);
    }
    if (action === "shippingQuote") {
      await enforceRateLimit(request, "store.shipping.ip", 80, 60 * 60);
      await enforceRateLimit(request, "store.shipping", 20, 60, visitor.id);
      const store = await readStore(visitor.id);
      const subtotalCents = store.cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
      if (!subtotalCents) throw new Error("Seu carrinho está vazio.");
      const shippingPackage = packageForCart(store.cart);
      const options = await calculateSuperFrete(String(payload.cep ?? ""), subtotalCents, shippingPackage);
      return json({ options, freeShippingThresholdCents: 39900, freeShipping: cartHasFreeShipping(store.cart), package: shippingPackage }, visitor);
    }
    if (action === "validateCoupon") {
      await enforceRateLimit(request, "store.coupon.ip", 60, 60 * 60);
      await enforceRateLimit(request, "store.coupon", 30, 60, visitor.id);
      return json({ coupon: await previewCoupon(visitor.id, payload, session?.userId ?? null) }, visitor);
    }
    if (action === "checkout") {
      if (!session) return json({ error: "Entre na sua conta para continuar ao pagamento." }, visitor, 401);
      await enforceRateLimit(request, "store.checkout.ip", 30, 60 * 60);
      await enforceRateLimit(request, "store.checkout", 8, 60 * 60, visitor.id);
      const order = await createOrder(visitor.id, payload, session);
      const payment = await createAsaasCheckout(request, order.id);
      try {
        await deliverOrderNotification(order.id, "order_received");
      } catch (error) {
        console.error("Order received email failed", { orderId: order.id, error: error instanceof Error ? error.message : "unknown" });
      }
      const store = await readStore(visitor.id);
      return json({ order: { ...order, checkoutUrl: payment.checkoutUrl }, store: { ...publicStore(store), account: customerSummary(session) } }, visitor, 201);
    }
    return json({ error: "Ação inválida." }, visitor, 400);
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message }, visitor, 429, error.retryAfter);
    return json({ error: messageFrom(error) }, visitor, 400);
  }
}
