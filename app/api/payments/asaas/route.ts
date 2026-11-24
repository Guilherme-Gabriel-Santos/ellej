import { processAsaasWebhook, validateAsaasWebhook } from "../../../../lib/asaas";
import { ensureStoreSchema } from "../../../../lib/store";

export async function POST(request: Request) {
  try {
    if (!validateAsaasWebhook(request)) return new Response("Invalid authentication", { status: 401 });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 64_000) return new Response("Payload too large", { status: 413 });
    const body = await request.text();
    if (body.length > 64_000) return new Response("Payload too large", { status: 413 });
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    await ensureStoreSchema();
    await processAsaasWebhook(payload);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Asaas webhook failed", { error: error instanceof Error ? error.message : "unknown" });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
