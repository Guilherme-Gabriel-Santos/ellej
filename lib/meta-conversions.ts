import { env } from "cloudflare:workers";
import { getD1 } from "./store";

const encoder = new TextEncoder();

type PurchaseRow = {
  id: string;
  email: string;
  phone: string;
  customer_id: string | null;
  total_cents: number;
  marketing_consent: number;
  meta_purchase_sent_at: string | null;
};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function graphVersion() {
  const version = String(env.META_GRAPH_API_VERSION ?? "").trim();
  return /^v\d{1,2}\.\d$/.test(version) ? version : null;
}

export async function deliverMetaPurchase(orderId: string) {
  const pixelId = String(env.META_PIXEL_ID ?? "").trim();
  const accessToken = String(env.META_CAPI_ACCESS_TOKEN ?? "").trim();
  const version = graphVersion();
  if (!/^\d{8,20}$/.test(pixelId) || accessToken.length < 20 || !version) return false;

  const d1 = getD1();
  const order = await d1.prepare("SELECT id, email, phone, customer_id, total_cents, marketing_consent, meta_purchase_sent_at FROM orders WHERE id = ? AND status IN ('pago', 'em_separacao', 'enviado', 'concluido')")
    .bind(orderId)
    .first<PurchaseRow>();
  if (!order || !Number(order.marketing_consent) || order.meta_purchase_sent_at) return false;
  const itemRows = await d1.prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY id")
    .bind(orderId)
    .all<{ product_id: string; quantity: number }>();
  const phone = order.phone.replace(/\D/g, "");
  const userData: Record<string, string[]> = { em: [await sha256(order.email)] };
  if (phone.length >= 10) userData.ph = [await sha256(phone.startsWith("55") ? phone : `55${phone}`)];
  if (order.customer_id) userData.external_id = [await sha256(order.customer_id)];

  const response = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: accessToken,
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase_${order.id}`,
        action_source: "website",
        event_source_url: `${String(env.PUBLIC_SITE_URL ?? "https://ellejew.com.br").replace(/\/$/, "")}/conta`,
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: Number(order.total_cents) / 100,
          order_id: order.id,
          content_type: "product",
          content_ids: itemRows.results.map((item) => item.product_id),
          contents: itemRows.results.map((item) => ({ id: item.product_id, quantity: Number(item.quantity) })),
        },
      }],
    }),
  });
  if (!response.ok) {
    console.error("Meta CAPI purchase failed", { orderId, status: response.status });
    throw new Error(`Meta recusou o evento de compra (${response.status}).`);
  }
  await d1.prepare("UPDATE orders SET meta_purchase_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND meta_purchase_sent_at IS NULL")
    .bind(order.id)
    .run();
  return true;
}

export async function retryPendingMetaPurchases(limit = 20) {
  const rows = await getD1().prepare("SELECT id FROM orders WHERE marketing_consent = 1 AND meta_purchase_sent_at IS NULL AND status IN ('pago', 'em_separacao', 'enviado', 'concluido') ORDER BY payment_updated_at LIMIT ?")
    .bind(limit)
    .all<{ id: string }>();
  for (const row of rows.results) {
    try {
      await deliverMetaPurchase(row.id);
    } catch (error) {
      console.error("Meta CAPI retry failed", { orderId: row.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
}
