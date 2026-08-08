import {
  createOrder,
  ensureStoreSchema,
  readStore,
  subscribe,
  toggleFavorite,
  updateCart,
} from "../../../lib/store";

const visitorCookie = "ellejew_visitor";

function visitorFrom(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${visitorCookie}=([^;]+)`));
  const current = match?.[1] ? decodeURIComponent(match[1]) : null;
  return current && /^[a-zA-Z0-9-]{10,80}$/.test(current)
    ? { id: current, fresh: false }
    : { id: crypto.randomUUID(), fresh: true };
}

function json(data: unknown, visitor: { id: string; fresh: boolean }, status = 200) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
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
    await ensureStoreSchema();
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "favorite") {
      const store = await toggleFavorite(visitor.id, String(payload.productId ?? ""));
      return json({ store }, visitor);
    }
    if (action === "cart") {
      const store = await updateCart(visitor.id, String(payload.productId ?? ""), Number(payload.quantity ?? 0));
      return json({ store }, visitor);
    }
    if (action === "subscribe") {
      await subscribe(String(payload.email ?? ""));
      return json({ ok: true }, visitor, 201);
    }
    if (action === "checkout") {
      const order = await createOrder(visitor.id, payload);
      const store = await readStore(visitor.id);
      return json({ order, store }, visitor, 201);
    }
    return json({ error: "Ação inválida." }, visitor, 400);
  } catch (error) {
    return json({ error: messageFrom(error) }, visitor, 400);
  }
}
