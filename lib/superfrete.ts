import { env } from "cloudflare:workers";

const API_BASE = "https://api.superfrete.com";
const SERVICES = "1,2,17,31";

export const SUPERFRETE_PACKAGE = {
  weight: 0.3,
  height: 6,
  width: 18,
  length: 18,
} as const;

const ORIGIN = {
  name: "ElleJew",
  address: "Avenida Professor João Fiúsa",
  complement: "Fiusa One",
  number: "1515",
  district: "Jardim Botânico",
  city: "Ribeirão Preto",
  state_abbr: "SP",
  postal_code: "14024250",
} as const;

function d1() {
  if (!env.DB) throw new Error("Banco de dados da loja indisponível.");
  return env.DB;
}

type ApiError = { message?: string; error?: string | { message?: string }; errors?: Record<string, string[]> };
type CalculatorResponse = {
  id?: number | string;
  name?: string;
  price?: number | string;
  delivery_time?: number | string;
  custom_delivery_time?: number | string | null;
  packages?: Array<{
    dimensions?: { height?: number | string; width?: number | string; length?: number | string };
    weight?: number | string;
  }>;
  has_error?: boolean;
  error?: unknown;
};

export type ShippingOption = {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number;
};

function checkoutShippingPrice(realPriceCents: number) {
  const configured = Number(env.SHIPPING_TEST_PRICE_CENTS);
  return Number.isInteger(configured) && configured >= 0 ? configured : realPriceCents;
}

function token() {
  const value = env.SUPERFRETE_API_TOKEN?.trim();
  if (!value) throw new Error("O SuperFrete ainda não está configurado.");
  return value;
}

function apiMessage(body: ApiError | null, status: number) {
  if (typeof body?.error === "string" && body.error.trim()) return body.error;
  if (body?.error && typeof body.error === "object" && body.error.message) return body.error.message;
  if (body?.message?.trim()) return body.message;
  const firstValidation = body?.errors ? Object.values(body.errors).flat().find(Boolean) : null;
  return firstValidation ?? `O SuperFrete recusou a solicitação (${status}).`;
}

async function superFreteRequest<T>(path: string, method: "GET" | "POST", payload?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "ElleJew/1.0",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as T | ApiError | null;
    if (!response.ok) throw new Error(apiMessage(body as ApiError | null, response.status));
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("O SuperFrete demorou para responder. Tente novamente.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function postalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) throw new Error("Informe um CEP válido para calcular o frete.");
  return digits;
}

export async function calculateSuperFrete(destinationCep: string, insuranceValueCents = 0) {
  const response = await superFreteRequest<CalculatorResponse[]>("/api/v0/calculator", "POST", {
    from: { postal_code: ORIGIN.postal_code },
    to: { postal_code: postalCode(destinationCep) },
    services: SERVICES,
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: Math.max(0, insuranceValueCents) / 100,
      use_insurance_value: false,
    },
    products: [{ quantity: 1, ...SUPERFRETE_PACKAGE }],
  });

  const options = (Array.isArray(response) ? response : [])
    .filter((item) => !item.has_error && item.error == null)
    .map((item): ShippingOption | null => {
      const id = String(item.id ?? "");
      const price = Number(item.price);
      const deliveryDays = Number(item.custom_delivery_time ?? item.delivery_time);
      if (!id || !item.name || !Number.isFinite(price) || price < 0 || !Number.isFinite(deliveryDays)) return null;
      return { id, name: String(item.name), priceCents: checkoutShippingPrice(Math.round(price * 100)), deliveryDays: Math.max(1, Math.trunc(deliveryDays)) };
    })
    .filter((item): item is ShippingOption => item !== null)
    .sort((a, b) => a.priceCents - b.priceCents || a.deliveryDays - b.deliveryDays);

  if (!options.length) throw new Error("Não encontramos uma modalidade de entrega para esse CEP.");
  return options;
}

type ShipmentOrder = {
  id: string;
  customer_name: string;
  email: string;
  cpf: string;
  cep: string;
  address: string;
  address_number: string;
  neighborhood: string;
  complement: string | null;
  city: string;
  state: string;
  status: string;
  subtotal_cents: number;
  superfrete_service_id: string;
  superfrete_order_id: string | null;
};

async function shipmentOrder(orderId: string) {
  const order = await d1().prepare("SELECT id, customer_name, email, cpf, cep, address, address_number, neighborhood, complement, city, state, status, subtotal_cents, superfrete_service_id, superfrete_order_id FROM orders WHERE id = ?").bind(orderId).first<ShipmentOrder>();
  if (!order) throw new Error("Pedido não encontrado.");
  if (!["pago", "em_separacao", "enviado", "concluido"].includes(order.status)) throw new Error("A etiqueta só pode ser preparada após a confirmação do pagamento.");
  return order;
}

export async function createSuperFreteShipment(orderId: string) {
  const database = d1();
  const order = await shipmentOrder(orderId);
  if (order.superfrete_order_id) return refreshSuperFreteShipment(orderId);

  const items = await database.prepare("SELECT product_name, unit_price_cents, quantity FROM order_items WHERE order_id = ? ORDER BY id").bind(orderId).all<{ product_name: string; unit_price_cents: number; quantity: number }>();
  if (!items.results.length) throw new Error("O pedido não possui itens para envio.");

  const quotes = await calculateSuperFrete(order.cep, Number(order.subtotal_cents));
  const quote = quotes.find((item) => item.id === String(order.superfrete_service_id));
  if (!quote) throw new Error("A modalidade selecionada não está mais disponível para esse CEP.");

  const result = await superFreteRequest<{ id: string; protocol?: string; price?: number | string; status?: string }>("/api/v0/cart", "POST", {
    from: ORIGIN,
    to: {
      name: order.customer_name,
      address: order.address,
      complement: order.complement ?? "",
      number: order.address_number,
      district: order.neighborhood,
      city: order.city,
      state_abbr: order.state,
      postal_code: postalCode(order.cep),
      document: order.cpf.replace(/\D/g, ""),
    },
    email: order.email,
    service: Number(order.superfrete_service_id),
    products: items.results.map((item) => ({
      name: item.product_name.slice(0, 80),
      quantity: String(item.quantity),
      unitary_value: (Number(item.unit_price_cents) / 100).toFixed(2),
    })),
    volumes: SUPERFRETE_PACKAGE,
    options: {
      insurance_value: Number((Number(order.subtotal_cents) / 100).toFixed(2)),
      receipt: false,
      own_hand: false,
      non_commercial: false,
      tags: [{ tag: order.id.slice(0, 50), url: "https://elle-jew-loja.ellejew-brasil.workers.dev/admin" }],
    },
    platform: "Elle Jew",
  });

  if (!result?.id) throw new Error("O SuperFrete não retornou a identificação da etiqueta.");
  await database.prepare("UPDATE orders SET superfrete_order_id = ?, superfrete_protocol = ?, superfrete_price_cents = ?, superfrete_status = ?, superfrete_updated_at = CURRENT_TIMESTAMP WHERE id = ? AND superfrete_order_id IS NULL")
    .bind(String(result.id), result.protocol ? String(result.protocol) : null, Math.round(Number(result.price ?? quote.priceCents / 100) * 100), String(result.status ?? "pending"), orderId)
    .run();
  return refreshSuperFreteShipment(orderId);
}

export async function refreshSuperFreteShipment(orderId: string) {
  const database = d1();
  const order = await database.prepare("SELECT superfrete_order_id FROM orders WHERE id = ?").bind(orderId).first<{ superfrete_order_id: string | null }>();
  if (!order?.superfrete_order_id) throw new Error("A etiqueta ainda não foi enviada ao SuperFrete.");
  const info = await superFreteRequest<{ status?: string; tracking?: string; tracking_code?: string }>(`/api/v0/order/info/${encodeURIComponent(order.superfrete_order_id)}`, "GET");
  await database.prepare("UPDATE orders SET superfrete_status = ?, superfrete_tracking_code = COALESCE(?, superfrete_tracking_code), superfrete_updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(String(info.status ?? "pending"), info.tracking_code ? String(info.tracking_code) : info.tracking ? String(info.tracking) : null, orderId)
    .run();
  return info;
}

export async function paySuperFreteShipment(orderId: string) {
  const database = d1();
  const order = await shipmentOrder(orderId);
  if (!order.superfrete_order_id) throw new Error("Envie a etiqueta ao SuperFrete antes de pagar.");
  await superFreteRequest("/api/v0/checkout", "POST", { orders: [order.superfrete_order_id] });
  await database.prepare("UPDATE orders SET superfrete_status = 'processing', superfrete_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(orderId).run();
  return refreshSuperFreteShipment(orderId);
}

export async function printSuperFreteShipment(orderId: string) {
  const database = d1();
  const order = await database.prepare("SELECT superfrete_order_id FROM orders WHERE id = ?").bind(orderId).first<{ superfrete_order_id: string | null }>();
  if (!order?.superfrete_order_id) throw new Error("A etiqueta ainda não foi criada.");
  const result = await superFreteRequest<{ url?: string }>("/api/v0/tag/print", "POST", { orders: [order.superfrete_order_id] });
  if (!result.url || !result.url.startsWith("https://")) throw new Error("A etiqueta ainda não está disponível para impressão.");
  await database.prepare("UPDATE orders SET superfrete_label_url = ?, superfrete_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(result.url, orderId).run();
  return result.url;
}
