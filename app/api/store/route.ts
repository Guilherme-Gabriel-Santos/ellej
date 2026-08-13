import {
  createOrder,
  ensureStoreSchema,
  readStore,
  subscribe,
  toggleFavorite,
  updateCart,
} from "../../../lib/store";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { createAsaasCheckout } from "../../../lib/asaas";
import { lookupCep } from "../../../lib/brazil";
import { calculateSuperFrete, SUPERFRETE_PACKAGE } from "../../../lib/superfrete";

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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora. Tente novamente.";
}

export async function GET(request: Request) {
  const visitor = visitorFrom(request);
  try {
    await ensureStoreSchema();
    return json(await readStore(visitor.id), visitor);
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
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "favorite") {
      await enforceRateLimit(request, "store.favorite", 90, 60, visitor.id);
      const store = await toggleFavorite(visitor.id, String(payload.productId ?? ""));
      return json({ store }, visitor);
    }
    if (action === "cart") {
      await enforceRateLimit(request, "store.cart", 90, 60, visitor.id);
      const store = await updateCart(visitor.id, String(payload.productId ?? ""), Number(payload.quantity ?? 0));
      return json({ store }, visitor);
    }
    if (action === "subscribe") {
      await enforceRateLimit(request, "store.subscribe", 5, 60 * 60, visitor.id);
      await subscribe(String(payload.email ?? ""));
      return json({ ok: true }, visitor, 201);
    }
    if (action === "lookupCep") {
      await enforceRateLimit(request, "store.cep", 30, 60, visitor.id);
      return json({ address: await lookupCep(payload.cep) }, visitor);
    }
    if (action === "shippingQuote") {
      await enforceRateLimit(request, "store.shipping", 20, 60, visitor.id);
      const store = await readStore(visitor.id);
      const subtotalCents = store.cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
      if (!subtotalCents) throw new Error("Seu carrinho está vazio.");
      const options = await calculateSuperFrete(String(payload.cep ?? ""), subtotalCents);
      return json({ options, freeShippingThresholdCents: 39900, package: SUPERFRETE_PACKAGE }, visitor);
    }
    if (action === "checkout") {
      await enforceRateLimit(request, "store.checkout.ip", 30, 60 * 60);
      await enforceRateLimit(request, "store.checkout", 8, 60 * 60, visitor.id);
      const order = await createOrder(visitor.id, payload);
      const payment = await createAsaasCheckout(request, order.id);
      const store = await readStore(visitor.id);
      return json({ order: { ...order, checkoutUrl: payment.checkoutUrl }, store }, visitor, 201);
    }
    return json({ error: "Ação inválida." }, visitor, 400);
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message }, visitor, 429, error.retryAfter);
    return json({ error: messageFrom(error) }, visitor, 400);
  }
}
