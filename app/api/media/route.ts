import { env } from "cloudflare:workers";

const allowedKey = /^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm|mov)$/;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!allowedKey.test(key) || !env.MEDIA) {
    return new Response("Arquivo não encontrado.", { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  const object = await env.MEDIA.get(key, rangeHeader ? { range: request.headers } : undefined);
  if (!object) return new Response("Arquivo não encontrado.", { status: 404 });

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  object.writeHttpMetadata(headers);

  // Vídeos precisam de resposta parcial (206) para tocar e permitir avançar no player.
  if (rangeHeader && object.range) {
    const range = object.range;
    const offset = range.suffix === undefined ? range.offset ?? 0 : object.size - range.suffix;
    const length = range.suffix === undefined ? range.length ?? object.size - offset : range.suffix;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
