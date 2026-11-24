import { env } from "cloudflare:workers";

export async function GET() {
  const pixelId = String(env.META_PIXEL_ID ?? "").trim();
  const enabled = /^\d{8,20}$/.test(pixelId);
  return Response.json(
    enabled ? { enabled: true, pixelId } : { enabled: false },
    { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } },
  );
}
