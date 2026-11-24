import { env } from "cloudflare:workers";
import { clearPurchasedCartItems, getD1 } from "./store";
import { transitionOrderStatus } from "./order-status";
import { installmentPlan } from "./pricing";
import { deliverMetaPurchase } from "./meta-conversions";

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

type AsaasApiError = {
  code?: unknown;
  description?: unknown;
};

class AsaasApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hasJsonResponse: boolean,
  ) {
    super(message);
    this.name = "AsaasApiRequestError";
  }
}

function configuredEnvironment() {
  const value = String(env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase();
  if (["production", "prod", "producao", "produção"].includes(value)) return "production" as const;
  if (["sandbox", "hmlg", "homologacao", "homologação"].includes(value)) return "sandbox" as const;
  throw new Error("O ambiente do Asaas está inválido. Configure como production ou sandbox.");
}

function keyEnvironment(value: string) {
  if (value.startsWith("$aact_prod_")) return "production" as const;
  if (value.startsWith("$aact_hmlg_")) return "sandbox" as const;
  return "legacy" as const;
}

function apiKey() {
  const value = String(env.ASAAS_API_KEY ?? "").trim();
  if (!value) throw new Error("O pagamento online ainda não foi ativado.");
  if (value.length < 20 || /\s/.test(value)) throw new Error("A chave configurada não possui um formato válido do Asaas.");
  const environment = keyEnvironment(value);
  if (environment !== "legacy" && environment !== configuredEnvironment()) {
    throw new Error(`A chave do Asaas é de ${environment === "production" ? "produção" : "sandbox"}, mas o ambiente configurado é diferente.`);
  }
  return value;
}

function isSandbox() {
  return configuredEnvironment() === "sandbox";
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
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
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
    const responseText = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      data = null;
    }
    if (!response.ok || !data) {
      const errors = Array.isArray(data?.errors) ? data.errors as AsaasApiError[] : [];
      const detail = errors.map((error) => String(error.description ?? "")).find(Boolean);
      const responsePreview = data ? "" : responseText.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 240);
      console.error("Asaas API request failed", {
        path,
        status: response.status,
        environment: configuredEnvironment(),
        keyEnvironment: keyEnvironment(apiKey()),
        requestId: response.headers.get("asaas-request-id") ?? response.headers.get("x-request-id") ?? "",
        errorCodes: errors.map((error) => String(error.code ?? "")).filter(Boolean),
        hasJsonResponse: Boolean(data),
        contentType: response.headers.get("content-type") ?? "",
        responsePreview,
      });
      const fallback = response.status === 401
        ? "A autenticação do pagamento não foi aceita pelo Asaas."
        : response.status === 403
          ? "O Asaas bloqueou a conexão por uma regra de segurança."
          : "Não foi possível iniciar o pagamento no Asaas.";
      throw new AsaasApiRequestError(detail || fallback, response.status, Boolean(data));
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("O Asaas demorou para responder. Tente novamente em alguns instantes.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetrySimplerCheckout(error: unknown) {
  return error instanceof AsaasApiRequestError && error.status === 400 && !error.hasJsonResponse;
}

export async function createAsaasCheckout(request: Request, orderId: string) {
  const d1 = getD1();
  const order = await d1
    .prepare("SELECT id, visitor_id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city_ibge_code, payment_method, total_cents FROM orders WHERE id = ? AND status = 'aguardando_pagamento'")
    .bind(orderId)
    .first<PaymentOrder>();
  if (!order) throw new Error("Pedido indisponível para pagamento.");
  if (!order.city_ibge_code || !/^\d{7}$/.test(order.city_ibge_code)) throw new Error("Não foi possível validar a cidade do endereço.");
  if (Number(order.total_cents) < ASAAS_MINIMUM_CHECKOUT_CENTS) {
    throw new Error("Para pagar pelo Asaas, o total do pedido precisa ser de pelo menos R$ 5,00.");
  }

  const origin = new URL(request.url).origin;
  const callbackOrder = encodeURIComponent(order.id);
  const installmentCount = installmentPlan(Number(order.total_cents)).count;
  const billingTypes: Array<"PIX" | "CREDIT_CARD"> = order.payment_method === "pix"
    ? ["PIX"]
    : order.payment_method === "credit_card" ? ["CREDIT_CARD"] : ["PIX", "CREDIT_CARD"];
  const allowInstallments = billingTypes.includes("CREDIT_CARD") && installmentCount >= 2;

  try {
    const commonCheckout = {
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
    };
    const createCheckout = (billingTypes: Array<"PIX" | "CREDIT_CARD">, installments: boolean) => providerRequest("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes,
        chargeTypes: installments ? ["DETACHED", "INSTALLMENT"] : ["DETACHED"],
        ...(installments ? { installment: { maxInstallmentCount: installmentCount } } : {}),
        ...commonCheckout,
      }),
    });

    let checkout: Record<string, unknown>;
    try {
      checkout = await createCheckout(billingTypes, allowInstallments);
    } catch (error) {
      if (!shouldRetrySimplerCheckout(error)) throw error;
      try {
        checkout = await createCheckout(billingTypes, false);
        console.warn("Asaas checkout fallback used", { mode: billingTypes.join("_and_").toLowerCase() + "_without_installments" });
      } catch (fallbackError) {
        if (!shouldRetrySimplerCheckout(fallbackError)) throw fallbackError;
        throw fallbackError;
      }
    }
    const checkoutId = String(checkout.id ?? "");
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(checkoutId)) throw new Error("O Asaas não confirmou o checkout.");
    const link = checkoutUrl(checkoutId, checkout.link);
    await d1.prepare("UPDATE orders SET payment_provider = 'asaas', payment_preference_id = ?, payment_status = 'ACTIVE', payment_checkout_url = ?, payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(checkoutId, link, order.id)
      .run();
    return { checkoutUrl: link };
  } catch (error) {
    await d1.prepare("UPDATE orders SET payment_provider = 'asaas' WHERE id = ?").bind(order.id).run();
    await transitionOrderStatus(order.id, "cancelado", { expectedFrom: ["aguardando_pagamento"], paymentStatus: "CHECKOUT_ERROR", notify: false }).catch((cancelError) => {
      console.error("Failed to release order after checkout error", { orderId: order.id, error: cancelError instanceof Error ? cancelError.message : "unknown" });
    });
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

function checkoutTotalCents(items: Array<{ quantity?: unknown; value?: unknown }> | undefined) {
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

const handledEvents = new Set(["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED", "CHECKOUT_CREATED"]);

/**
 * Processa o webhook do Asaas. Regras de negócio nunca geram erro (o Asaas pausaria a fila);
 * só falhas de infraestrutura propagam, para que o evento seja reenviado.
 */
export async function processAsaasWebhook(payload: AsaasCheckoutEvent) {
  const eventId = String(payload.id ?? "");
  const event = String(payload.event ?? "");
  if (!handledEvents.has(event)) return;
  const checkoutId = String(payload.checkout?.id ?? "");
  if (!/^[a-zA-Z0-9_&-]{8,160}$/.test(eventId) || !/^[a-zA-Z0-9-]{10,100}$/.test(checkoutId)) {
    console.warn("Asaas webhook ignored: invalid identifiers", { event });
    return;
  }

  const d1 = getD1();
  const order = await d1.prepare("SELECT id, visitor_id, total_cents, status, payment_status FROM orders WHERE payment_provider = 'asaas' AND payment_preference_id = ?")
    .bind(checkoutId)
    .first<{ id: string; visitor_id: string; total_cents: number; status: string; payment_status: string | null }>();
  if (!order) {
    console.warn("Asaas webhook ignored: unknown checkout", { event, checkoutId });
    return;
  }
  const externalReference = payload.checkout?.externalReference;
  if (externalReference != null && String(externalReference) !== order.id) {
    console.error("Asaas webhook ignored: external reference mismatch", { event, orderId: order.id });
    return;
  }

  // Deduplicação atômica: só um processamento por event_id, mesmo com entregas simultâneas.
  const claim = await d1.prepare("INSERT OR IGNORE INTO payment_webhook_events (event_id, provider, event_type, order_id) VALUES (?, 'asaas', ?, ?)")
    .bind(eventId, event, order.id)
    .run();
  if (Number(claim.meta.changes ?? 0) === 0) return;

  try {
    if (event === "CHECKOUT_PAID") {
      const receivedTotal = checkoutTotalCents(payload.checkout?.items);
      if (receivedTotal === null || receivedTotal !== Number(order.total_cents)) {
        console.error("Asaas paid amount mismatch", { orderId: order.id, receivedTotal, expected: Number(order.total_cents) });
        await d1.prepare("UPDATE orders SET payment_status = 'AMOUNT_MISMATCH', payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(order.id).run();
        return;
      }
      const canceledByTimeout = order.status === "cancelado" && ["CHECKOUT_EXPIRED", "CHECKOUT_CANCELED", "EXPIRED", "CANCELED"].includes(String(order.payment_status ?? ""));
      if (order.status === "aguardando_pagamento" || canceledByTimeout) {
        await transitionOrderStatus(order.id, "pago", {
          expectedFrom: ["aguardando_pagamento", "cancelado"],
          allowStockShortfall: true,
          paymentStatus: String(payload.checkout?.status ?? event),
        });
        await d1.prepare("UPDATE orders SET payment_id = COALESCE(?, payment_id, ?) WHERE id = ?").bind(paymentIdFrom(payload), checkoutId, order.id).run();
        await clearPurchasedCartItems(order.visitor_id, order.id);
        try {
          await deliverMetaPurchase(order.id);
        } catch (error) {
          console.error("Meta purchase delivery failed", { orderId: order.id, error: error instanceof Error ? error.message : "unknown" });
        }
      } else if (order.status === "cancelado") {
        // Cancelado manualmente pelo admin (ex.: suspeita de fraude): não reativa; sinaliza para estorno/análise.
        console.error("Payment received for manually canceled order", { orderId: order.id });
        await d1.prepare("UPDATE orders SET payment_status = 'PAID_AFTER_CANCEL', payment_id = COALESCE(?, payment_id, ?), payment_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentIdFrom(payload), checkoutId, order.id).run();
      }
      // Pedidos já pagos/enviados/concluídos: nada a fazer (sem regressão de status).
    } else if (event === "CHECKOUT_CANCELED" || event === "CHECKOUT_EXPIRED") {
      await transitionOrderStatus(order.id, "cancelado", { expectedFrom: ["aguardando_pagamento"], paymentStatus: event });
    }
  } catch (error) {
    // Falha de infraestrutura: libera o event_id para o reenvio do Asaas processar de novo.
    await d1.prepare("DELETE FROM payment_webhook_events WHERE event_id = ?").bind(eventId).run().catch(() => undefined);
    throw error;
  }
}

function paymentIdFrom(payload: AsaasCheckoutEvent) {
  const raw = payload as Record<string, unknown> & { payment?: { id?: unknown }; checkout?: { payments?: Array<{ id?: unknown }> } };
  const candidate = String(raw.payment?.id ?? raw.checkout?.payments?.[0]?.id ?? "");
  return /^[a-zA-Z0-9_-]{6,100}$/.test(candidate) ? candidate : null;
}
