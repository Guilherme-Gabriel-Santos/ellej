import { env } from "cloudflare:workers";
import { clearVisitorCart, getD1 } from "./store";
import { transitionOrderStatus } from "./order-status";

const encoder = new TextEncoder();
const ASAAS_MINIMUM_CHECKOUT_CENTS = 500;
const ASAAS_REQUEST_TIMEOUT_MS = 25_000;

type PaymentOrder = {
  id: string;
  visitor_id: string;
  customer_name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  address: string;
  address_number: string;
  neighborhood: string;
  complement: string | null;
  city_ibge_code: string | null;
  payment_method: string;
  total_cents: number;
  status: string;
};

type AsaasCheckoutEvent = {
  id?: unknown;
  event?: unknown;
  checkout?: {
    id?: unknown;
    externalReference?: unknown;
    status?: unknown;
    items?: Array<{ quantity?: unknown; value?: unknown }>;
  };
};

function apiKey() {
  if (!env.ASAAS_API_KEY) throw new Error("O pagamento online ainda não foi ativado.");
  return env.ASAAS_API_KEY;
}

function isSandbox() {
  return env.ASAAS_ENVIRONMENT !== "production";
}

function apiBaseUrl() {
  return isSandbox() ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

function checkoutUrl(checkoutId: string, returnedLink: unknown) {
  const fallback = `${isSandbox() ? "https://sandbox.asaas.com" : "https://asaas.com"}/checkoutSession/show?id=${encodeURIComponent(checkoutId)}`;
  const url = new URL(String(returnedLink || fallback));
  const allowed = url.hostname === "asaas.com" || url.hostname.endsWith(".asaas.com");
  if (url.protocol !== "https:" || !allowed) throw new Error("O Asaas retornou um endereço inválido.");
  return url.toString();
}

async function providerRequest(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASAAS_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        access_token: apiKey(),
        "Content-Type": "application/json",
        "User-Agent": "ElleJew/1.0 (contato@ellejew.com.br)",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("O Asaas demorou para responder. Tente novamente em alguns instantes.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !data) {
    const errors = Array.isArray(data?.errors) ? data.errors as Array<{ description?: unknown }> : [];
    const detail = errors.map((error) => String(error.description ?? "")).find(Boolean);
    throw new Error(detail || "Não foi possível iniciar o pagamento no Asaas.");
  }
  return data;
}

export async function createAsaasCheckout(request: Request, orderId: string) {
  const d1 = getD1();
  const order = await d1
    .prepare("SELECT id, visitor_id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city_ibge_code, payment_method, total_cents, status FROM orders WHERE id = ? AND status = 'aguardando_pagamento'")
    .bind(orderId)
    .first<PaymentOrder>();
  if (!order) throw new Error("Pedido indisponível para pagamento.");
  if (!order.city_ibge_code || !/^\d{7}$/.test(order.city_ibge_code)) throw new Error("Não foi possível validar a cidade do endereço.");

  const origin = new URL(request.url).origin;
  const isCard = order.payment_method === "card";
  const callbackOrder = encodeURIComponent(order.id);
  try {
    if (Number(order.total_cents) < ASAAS_MINIMUM_CHECKOUT_CENTS) {
      throw new Error("Para testar o pagamento no Asaas, o total do pedido precisa ser de pelo menos R$ 5,00.");
    }
    const installmentCount = Math.min(6, Math.floor(Number(order.total_cents) / ASAAS_MINIMUM_CHECKOUT_CENTS));
    const allowInstallments = isCard && installmentCount >= 2;
    const checkout = await providerRequest("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes: [isCard ? "CREDIT_CARD" : "PIX"],
        chargeTypes: allowInstallments ? ["DETACHED", "INSTALLMENT"] : ["DETACHED"],
        ...(allowInstallments ? { installment: { maxInstallmentCount: installmentCount } } : {}),
        minutesToExpire: 60,
        externalReference: order.id,
        callback: {
          successUrl: `${origin}/?payment=success&order=${callbackOrder}`,
          cancelUrl: `${origin}/?payment=failure&order=${callbackOrder}`,
          expiredUrl: `${origin}/?payment=expired&order=${callbackOrder}`,
        },
        items: [{
          name: `Pedido ${order.id}`,
          description: "Joias Elle Jew e entrega",
          quantity: 1,
          value: Number(order.total_cents) / 100,
        }],
        customerData: {
          name: order.customer_name,
          cpfCnpj: order.cpf.replace(/\D/g, ""),
          email: order.email,
          phone: order.phone.replace(/\D/g, ""),
          address: order.address,
          addressNumber: order.address_number,
          ...(order.complement ? { complement: order.complement } : {}),
          postalCode: order.cep.replace(/\D/g, ""),
          province: order.neighborhood,
          city: Number(order.city_ibge_code),
        },
      }),
    });
    const checkoutId = String(checkout.id ?? "");
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(checkoutId)) throw new Error("O Asaas não confirmou o checkout.");
    const link = checkoutUrl(checkoutId, checkout.link);
    await d1
      .prepare("UPDATE orders SET payment_provider = 'asaas', payment_preference_id = ?, payment_status = 'ACTIVE', payment_checkout_url = ?, payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(checkoutId, link, order.id)
      .run();
    return { checkoutUrl: link };
  } catch (error) {
    await d1
      .prepare("UPDATE orders SET status = 'cancelado', payment_provider = 'asaas', payment_status = 'CHECKOUT_ERROR', payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(order.id)
      .run();
    throw error;
  }
}

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export function validateAsaasWebhook(request: Request) {
  if (!env.ASAAS_WEBHOOK_TOKEN || env.ASAAS_WEBHOOK_TOKEN.length < 32) return false;
  return secureEqual(request.headers.get("asaas-access-token") ?? "", env.ASAAS_WEBHOOK_TOKEN);
}

function checkoutTotalCents(items: AsaasCheckoutEvent["checkout"] extends infer C ? C extends { items?: infer I } ? I : never : never) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const quantity = Number(item.quantity);
    const value = Number(item.value);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(value) || value <= 0) return null;
    total += Math.round(value * 100) * quantity;
  }
  return total;
}

export async function processAsaasWebhook(payload: AsaasCheckoutEvent) {
  const eventId = String(payload.id ?? "");
  const event = String(payload.event ?? "");
  const checkoutId = String(payload.checkout?.id ?? "");
  if (!/^[a-zA-Z0-9_&-]{8,160}$/.test(eventId) || !/^[a-zA-Z0-9-]{10,100}$/.test(checkoutId)) {
    throw new Error("Evento inválido.");
  }
  if (!["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED", "CHECKOUT_CREATED"].includes(event)) return;

  const d1 = getD1();
  const duplicate = await d1.prepare("SELECT event_id FROM payment_webhook_events WHERE event_id = ?").bind(eventId).first();
  if (duplicate) return;

  const order = await d1
    .prepare("SELECT id, visitor_id, total_cents, status FROM orders WHERE payment_provider = 'asaas' AND payment_preference_id = ?")
    .bind(checkoutId)
    .first<{ id: string; visitor_id: string; total_cents: number; status: string }>();
  if (!order) throw new Error("Checkout desconhecido.");
  const externalReference = payload.checkout?.externalReference;
  if (externalReference != null && String(externalReference) !== order.id) throw new Error("Referência do pedido divergente.");

  if (event === "CHECKOUT_PAID") {
    const receivedTotal = checkoutTotalCents(payload.checkout?.items);
    if (receivedTotal === null || receivedTotal !== Number(order.total_cents)) throw new Error("Valor do checkout divergente.");
    await transitionOrderStatus(order.id, "pago");
    await clearVisitorCart(order.visitor_id);
  } else if (["CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"].includes(event) && order.status === "aguardando_pagamento") {
    await transitionOrderStatus(order.id, "cancelado");
  }

  await d1.batch([
    d1.prepare("UPDATE orders SET payment_id = CASE WHEN ? = 'CHECKOUT_PAID' THEN ? ELSE payment_id END, payment_status = ?, payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(event, checkoutId, String(payload.checkout?.status ?? event), order.id),
    d1.prepare("INSERT OR IGNORE INTO payment_webhook_events (event_id, provider, event_type, order_id) VALUES (?, 'asaas', ?, ?)")
      .bind(eventId, event, order.id),
  ]);
}
