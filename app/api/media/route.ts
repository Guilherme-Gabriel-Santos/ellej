import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key) || !env.MEDIA) {
    return new Response("Imagem não encontrada.", { status: 404 });
  }
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Imagem não encontrada.", { status: 404 });
  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
