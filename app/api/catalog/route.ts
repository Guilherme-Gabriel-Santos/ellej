import { ensureStoreSchema, readPublicCatalog } from "../../../lib/store";

const catalogCacheSeconds = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/api/catalog`, { method: "GET" });
  const cache = await caches.open("ellejew-public-catalog-v3");

  try {
    const cached = await cache.match(cacheKey);
    // Cache API responses have immutable headers; return a fresh response so
    // the framework can safely attach its own headers around the route.
    if (cached) return new Response(cached.body, cached);

    await ensureStoreSchema();
    const catalog = await readPublicCatalog();
    const response = new Response(JSON.stringify(catalog), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${catalogCacheSeconds}, s-maxage=${catalogCacheSeconds}, stale-while-revalidate=300`,
      },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return Response.json({ error: "Não foi possível carregar o catálogo agora." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
