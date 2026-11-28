import { env } from "cloudflare:workers";

const allowedKey = /^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm|mov)$/;

// Larguras das versões reduzidas (WebP) geradas por scripts/generate-media-variants.mjs.
// A foto original nunca é alterada: se a versão reduzida não existir, serve a original.
const variantWidths = new Set([480, 960]);

function mediaVariantKey(key: string, width: number) {
  return `variants/${key.replace(/\.[a-z0-9]+$/, "")}-w${width}.webp`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key = params.get("key") ?? "";
  if (!allowedKey.test(key) || !env.MEDIA) {
    return new Response("Arquivo não encontrado.", { status: 404 });
  }

  const width = Number(params.get("w") || 0);
  if (variantWidths.has(width) && /\.(jpg|png|webp)$/.test(key)) {
    const variant = await env.MEDIA.get(mediaVariantKey(key, width));
    if (variant) {
      const headers = new Headers({
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/webp",
        ETag: variant.httpEtag,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(variant.size),
      });
      return new Response(variant.body, { headers });
    }
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
