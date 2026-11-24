import { env } from "cloudflare:workers";
import { getD1 } from "./store";

export type OrderNotificationType =
  | "order_received"
  | "payment_confirmed"
  | "order_shipped"
  | "order_cancelled";

type OrderRow = {
  id: string;
  customer_name: string;
  email: string;
  address: string;
  address_number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  subtotal_cents: number;
  shipping_cents: number;
  coupon_discount_cents: number;
  shipping_discount_cents: number;
  total_cents: number;
  superfrete_service_name: string | null;
  superfrete_delivery_days: number | null;
  superfrete_tracking_code: string | null;
};

type OrderItemRow = {
  product_name: string;
  variant_label: string | null;
  personalization_text: string | null;
  unit_price_cents: number;
  quantity: number;
};

const eventLabels: Record<OrderNotificationType, { subject: string; eyebrow: string; title: string }> = {
  order_received: {
    subject: "Recebemos seu pedido",
    eyebrow: "Pedido recebido",
    title: "Sua escolha foi registrada.",
  },
  payment_confirmed: {
    subject: "Pagamento confirmado",
    eyebrow: "Pagamento aprovado",
    title: "Seu pedido já está sendo preparado.",
  },
  order_shipped: {
    subject: "Seu pedido foi enviado",
    eyebrow: "A caminho",
    title: "Seu brilho está chegando.",
  },
  order_cancelled: {
    subject: "Pedido cancelado",
    eyebrow: "Atualização do pedido",
    title: "O pedido foi cancelado.",
  },
};

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function publicSiteUrl() {
  const configured = String(env.PUBLIC_SITE_URL ?? "https://elle-jew-loja.ellejew-brasil.workers.dev").trim();
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    return "https://elle-jew-loja.ellejew-brasil.workers.dev";
  }
}

function eventCopy(type: OrderNotificationType, order: OrderRow) {
  if (type === "order_received") {
    return "Seu pedido foi criado e está aguardando a confirmação do pagamento pelo Asaas. Assim que o pagamento for aprovado, enviaremos uma nova atualização.";
  }
  if (type === "payment_confirmed") {
    return `Pagamento confirmado. Vamos separar e conferir cada peça antes do envio${order.superfrete_delivery_days ? `. O prazo estimado da transportadora é de ${order.superfrete_delivery_days} dias úteis após a postagem` : ""}.`;
  }
  if (type === "order_shipped") {
    return order.superfrete_tracking_code
      ? `Seu pedido foi postado. Código de rastreio: ${order.superfrete_tracking_code}.`
      : "Seu pedido foi postado. O código de rastreio aparecerá na sua conta assim que for disponibilizado pela transportadora.";
  }
  return "O pedido foi cancelado. Se houve cobrança ou se você não reconhece esta atualização, fale conosco pelo WhatsApp.";
}

async function orderData(orderId: string) {
  const d1 = getD1();
  const order = await d1.prepare("SELECT id, customer_name, email, address, address_number, complement, neighborhood, city, state, cep, subtotal_cents, shipping_cents, coupon_discount_cents, shipping_discount_cents, total_cents, superfrete_service_name, superfrete_delivery_days, superfrete_tracking_code FROM orders WHERE id = ?")
    .bind(orderId)
    .first<OrderRow>();
  if (!order) throw new Error("Pedido não encontrado para notificação.");
  const items = await d1.prepare("SELECT product_name, variant_label, personalization_text, unit_price_cents, quantity FROM order_items WHERE order_id = ? ORDER BY id")
    .bind(orderId)
    .all<OrderItemRow>();
  return { order, items: items.results };
}

function emailBody(type: OrderNotificationType, order: OrderRow, items: OrderItemRow[]) {
  const label = eventLabels[type];
  const accountUrl = `${publicSiteUrl()}/conta`;
  const paymentLabel = type === "order_received"
    ? "Aguardando confirmação do Asaas"
    : type === "order_cancelled"
      ? "Cancelado"
      : "Confirmado pelo Asaas";
  const totalLabel = type === "payment_confirmed" || type === "order_shipped" ? "Total pago" : "Total do pedido";
  const baseShippingCents = Number(order.shipping_cents) + Number(order.shipping_discount_cents);
  const itemRows = items.map((item) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e4ded3"><strong>${html(item.product_name)}</strong>${item.variant_label ? `<br><span style="color:#6b7175;font-size:12px">${html(item.variant_label)}</span>` : ""}${item.personalization_text ? `<br><span style="color:#6b7175;font-size:12px">Gravação: ${html(item.personalization_text)}</span>` : ""}<br><span style="color:#6b7175;font-size:12px">${item.quantity} × ${html(money(item.unit_price_cents))}</span></td><td style="padding:12px 0;border-bottom:1px solid #e4ded3;text-align:right">${html(money(item.unit_price_cents * item.quantity))}</td></tr>`).join("");
  const itemText = items.map((item) => `- ${item.quantity}x ${item.product_name}${item.variant_label ? ` (${item.variant_label})` : ""}: ${money(item.unit_price_cents * item.quantity)}${item.personalization_text ? `\n  Gravação: ${item.personalization_text}` : ""}`).join("\n");
  const address = [order.address, order.address_number, order.complement, order.neighborhood, `${order.city}/${order.state}`, order.cep].filter(Boolean).join(", ");
  const trackingText = order.superfrete_tracking_code ? `\nRastreio: ${order.superfrete_tracking_code}` : "";
  const text = `${label.title}\n\n${eventCopy(type, order)}\n\nNúmero do pedido: ${order.id}\nPagamento: ${paymentLabel}\n\nItens\n${itemText}\n\nSubtotal: ${money(order.subtotal_cents)}${order.coupon_discount_cents ? `\nDesconto: -${money(order.coupon_discount_cents)}` : ""}\nFrete: ${baseShippingCents ? money(baseShippingCents) : "Grátis"}${order.shipping_discount_cents ? `\nDesconto no frete: -${money(order.shipping_discount_cents)}` : ""}\n${totalLabel}: ${money(order.total_cents)}\n\nEntrega: ${order.superfrete_service_name || "Transportadora selecionada"}\nEndereço de entrega: ${address}${trackingText}\n\nAcompanhe seu pedido em ${accountUrl}`;
  const summaryRows = `<tr><td style="padding-top:16px;color:#6b7175">Subtotal</td><td style="padding-top:16px;text-align:right">${html(money(order.subtotal_cents))}</td></tr>${order.coupon_discount_cents ? `<tr><td style="padding-top:8px;color:#6b7175">Desconto</td><td style="padding-top:8px;text-align:right;color:#2f6a48">-${html(money(order.coupon_discount_cents))}</td></tr>` : ""}<tr><td style="padding-top:8px;color:#6b7175">Frete</td><td style="padding-top:8px;text-align:right">${baseShippingCents ? html(money(baseShippingCents)) : "Grátis"}</td></tr>${order.shipping_discount_cents ? `<tr><td style="padding-top:8px;color:#6b7175">Desconto no frete</td><td style="padding-top:8px;text-align:right;color:#2f6a48">-${html(money(order.shipping_discount_cents))}</td></tr>` : ""}<tr><td style="padding-top:16px;border-top:1px solid #d8d0c3"><strong>${totalLabel}</strong></td><td style="padding-top:16px;border-top:1px solid #d8d0c3;text-align:right"><strong>${html(money(order.total_cents))}</strong></td></tr>`;
  const markup = `<div style="background:#f5f2ec;padding:28px 14px;color:#101a22;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;background:#fff;padding:36px"><p style="margin:0 0 12px;color:#b1883f;letter-spacing:.2em;text-transform:uppercase;font-size:11px">Elle Jew · ${html(label.eyebrow)}</p><h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.1;font-weight:400;margin:0 0 18px">${html(label.title)}</h1><p style="line-height:1.7;color:#46515a">Olá, ${html(order.customer_name.split(" ")[0])}. ${html(eventCopy(type, order))}</p><div style="margin:28px 0;padding:18px;background:#f7f5f1"><p style="margin:0 0 6px;color:#6b7175;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Número do pedido</p><strong style="font-size:18px">${html(order.id)}</strong><p style="margin:8px 0 0;color:#46515a;font-size:12px">${html(paymentLabel)}</p><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px">${itemRows}${summaryRows}</table></div><p style="font-size:13px;line-height:1.7"><strong>Entrega:</strong> ${html(order.superfrete_service_name || "Transportadora selecionada")}<br><strong>Endereço de entrega:</strong> ${html(address)}</p>${order.superfrete_tracking_code ? `<p style="font-size:13px"><strong>Rastreio:</strong> ${html(order.superfrete_tracking_code)}</p>` : ""}<a href="${html(accountUrl)}" style="display:block;margin-top:26px;padding:15px;background:#111f2a;color:#fff;text-decoration:none;text-align:center;letter-spacing:.12em;text-transform:uppercase;font-size:11px">Acompanhar meu pedido</a><p style="font-size:11px;color:#778087;margin-top:24px;line-height:1.6">Precisa de ajuda? Responda este e-mail ou fale pelo WhatsApp (16) 99293-9739.</p></div></div>`;
  return { subject: `${label.subject} · ${order.id}`, text, html: markup };
}

export async function deliverOrderNotification(orderId: string, type: OrderNotificationType) {
  const d1 = getD1();
  await d1.prepare("INSERT OR IGNORE INTO order_notification_events (order_id, event_type) VALUES (?, ?)").bind(orderId, type).run();
  const claim = await d1.prepare("UPDATE order_notification_events SET status = 'sending', attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND event_type = ? AND sent_at IS NULL AND (status != 'sending' OR locked_at IS NULL OR locked_at < datetime('now', '-5 minutes'))")
    .bind(orderId, type)
    .run();
  if (Number(claim.meta.changes ?? 0) === 0) return false;

  try {
    const fromEmail = env.ORDER_FROM_EMAIL || env.ADMIN_FROM_EMAIL;
    if (!env.RESEND_API_KEY || !fromEmail) {
      throw new Error("O envio de e-mail transacional ainda não foi configurado.");
    }
    const { order, items } = await orderData(orderId);
    const body = emailBody(type, order, items);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `ellejew-${orderId}-${type}`.slice(0, 256),
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [order.email],
        reply_to: "contato@ellejew.com.br",
        ...body,
      }),
    }).finally(() => clearTimeout(timeout));
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Resend recusou a notificação (${response.status}).`);
    let providerId = "";
    try { providerId = String((JSON.parse(responseText) as { id?: unknown }).id ?? ""); } catch { providerId = ""; }
    await d1.prepare("UPDATE order_notification_events SET status = 'sent', provider_id = ?, last_error = NULL, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND event_type = ?")
      .bind(providerId || null, orderId, type)
      .run();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 400) : "Falha desconhecida no envio.";
    await d1.prepare("UPDATE order_notification_events SET status = 'pending', last_error = ?, locked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND event_type = ?")
      .bind(message, orderId, type)
      .run();
    throw error;
  }
}

export async function retryPendingOrderNotifications(limit = 20) {
  const pending = await getD1().prepare("SELECT order_id, event_type FROM order_notification_events WHERE sent_at IS NULL AND attempts < 8 AND (status != 'sending' OR locked_at IS NULL OR locked_at < datetime('now', '-5 minutes')) ORDER BY updated_at LIMIT ?")
    .bind(limit)
    .all<{ order_id: string; event_type: OrderNotificationType }>();
  for (const item of pending.results) {
    try {
      await deliverOrderNotification(item.order_id, item.event_type);
    } catch (error) {
      console.error("Order email retry failed", { orderId: item.order_id, eventType: item.event_type, error: error instanceof Error ? error.message : "unknown" });
    }
  }
}
