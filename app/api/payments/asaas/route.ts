import { processAsaasWebhook, validateAsaasWebhook } from "../../../../lib/asaas";
import { ensureStoreSchema } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    if (!validateAsaasWebhook(request)) return new Response("Invalid authentication", { status: 401 });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 64_000) return new Response("Payload too large", { status: 413 });
    const body = await request.text();
    if (body.length > 64_000) return new Response("Payload too large", { status: 413 });
    const payload = JSON.parse(body) as Record<string, unknown>;
    await ensureStoreSchema();
    await processAsaasWebhook(payload);
    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Webhook processing failed", { status: 500 });
  }
}
