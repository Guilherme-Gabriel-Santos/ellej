import { getD1 } from "./store";
import { deliverOrderNotification, type OrderNotificationType } from "./order-email";

const orderStatuses = [
  "aguardando_pagamento",
  "pago",
  "em_separacao",
  "enviado",
  "concluido",
  "cancelado",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

const paidStatuses = new Set<OrderStatus>(["pago", "em_separacao", "enviado", "concluido"]);
/** Pedidos aguardando pagamento também seguram estoque (reserva feita na criação). */
const stockHoldingStatuses = new Set<OrderStatus>(["aguardando_pagamento", ...paidStatuses]);

export function isOrderStatus(status: string): status is OrderStatus {
  return orderStatuses.includes(status as OrderStatus);
}

export class OrderStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderStockError";
  }
}

type StockRow = { product_id: string; product_name: string; variant_id: string | null; quantity: number; stock: number; variants: string; track_stock: number; multi_options_enabled: number };

type StockChange = { productId: string; total: number; variantsJson: string; updatedVariantsJson: string };

async function orderStockChanges(orderId: string, direction: "reserve" | "release"): Promise<StockChange[]> {
  const d1 = getD1();
  const items = await d1
    .prepare("SELECT oi.product_id, oi.product_name, oi.variant_id, oi.quantity, p.stock, p.variants, p.track_stock, p.multi_options_enabled FROM order_items oi INNER JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")
    .bind(orderId)
    .all<StockRow>();
  if (direction === "reserve" && !items.results.length) throw new OrderStockError("O pedido não possui itens válidos.");

  const grouped = new Map<string, { productName: string; total: number; stock: number; variantsJson: string; trackStock: boolean; multiOptions: boolean; variantQuantities: Map<string, number> }>();
  for (const item of items.results) {
    const current = grouped.get(item.product_id) ?? {
      productName: item.product_name,
      total: 0,
      stock: Number(item.stock),
      variantsJson: item.variants || "[]",
      trackStock: Boolean(Number(item.track_stock)),
      multiOptions: Boolean(Number(item.multi_options_enabled)),
      variantQuantities: new Map<string, number>(),
    };
    current.total += Number(item.quantity);
    // Produtos com múltiplas opções guardam a seleção (JSON) em variant_id; o estoque é do produto.
    if (item.variant_id && !current.multiOptions) current.variantQuantities.set(item.variant_id, (current.variantQuantities.get(item.variant_id) ?? 0) + Number(item.quantity));
    grouped.set(item.product_id, current);
  }

  return [...grouped].filter(([, item]) => item.trackStock).map(([productId, item]) => {
    let variants: Array<{ id: string; stock: number }> = [];
    try { variants = JSON.parse(item.variantsJson || "[]"); } catch { variants = []; }
    if (!Array.isArray(variants)) variants = [];
    if (direction === "reserve" && item.stock < item.total) throw new OrderStockError(`Estoque insuficiente para ${item.productName}.`);
    for (const [variantId, quantity] of item.variantQuantities) {
      const variant = variants.find((entry) => entry.id === variantId);
      if (direction === "reserve") {
        if (!variant || Number(variant.stock) < quantity) throw new OrderStockError(`Estoque insuficiente para ${item.productName}.`);
        variant.stock = Number(variant.stock) - quantity;
      } else if (variant) {
        variant.stock = Number(variant.stock) + quantity;
      }
    }
    return { productId, total: item.total, variantsJson: item.variantsJson, updatedVariantsJson: JSON.stringify(variants) };
  });
}

/**
 * Reserva o estoque do pedido de forma atômica (claim em stock_committed + UPDATE condicional).
 * Lança OrderStockError quando não há estoque suficiente; nada fica reservado nesse caso.
 */
export async function reserveOrderStock(orderId: string) {
  const d1 = getD1();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const changes = await orderStockChanges(orderId, "reserve");
    const claim = await d1.prepare("UPDATE orders SET stock_committed = 1 WHERE id = ? AND stock_committed = 0").bind(orderId).run();
    if (Number(claim.meta.changes ?? 0) === 0) return;
    const results = changes.length ? await d1.batch(
      changes.map((item) =>
        d1.prepare("UPDATE products SET stock = stock - ?, variants = ? WHERE id = ? AND stock >= ? AND variants = ?").bind(item.total, item.updatedVariantsJson, item.productId, item.total, item.variantsJson),
      ),
    ) : [];
    if (results.every((result) => Number(result.meta.changes ?? 0) === 1)) return;
    // Outro pedido mexeu no mesmo produto entre a leitura e a escrita: desfaz o que aplicou e tenta de novo.
    await d1.batch([
      ...changes.map((item, index) =>
        Number(results[index]?.meta.changes ?? 0) === 1
          ? d1.prepare("UPDATE products SET stock = stock + ?, variants = ? WHERE id = ? AND variants = ?").bind(item.total, item.variantsJson, item.productId, item.updatedVariantsJson)
          : d1.prepare("SELECT 1"),
      ),
      d1.prepare("UPDATE orders SET stock_committed = 0 WHERE id = ?").bind(orderId),
    ]);
  }
  throw new OrderStockError("O estoque mudou durante a finalização. Tente novamente.");
}

/** Devolve ao estoque o que o pedido reservou. Idempotente. */
export async function releaseOrderStock(orderId: string) {
  const d1 = getD1();
  const release = await d1.prepare("UPDATE orders SET stock_committed = 0 WHERE id = ? AND stock_committed = 1").bind(orderId).run();
  if (Number(release.meta.changes ?? 0) === 0) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const changes = await orderStockChanges(orderId, "release");
    if (!changes.length) return;
    const results = await d1.batch(
      changes.map((item) => d1.prepare("UPDATE products SET stock = stock + ?, variants = ? WHERE id = ? AND variants = ?").bind(item.total, item.updatedVariantsJson, item.productId, item.variantsJson)),
    );
    const failed = changes.filter((_, index) => Number(results[index]?.meta.changes ?? 0) !== 1);
    if (!failed.length) return;
    // Reaplica só o que falhou (variants mudou no meio). Os que já voltaram não podem voltar de novo.
    const applied = new Set(changes.filter((_, index) => Number(results[index]?.meta.changes ?? 0) === 1).map((item) => item.productId));
    if (applied.size) {
      const remaining = await orderStockChanges(orderId, "release");
      const retry = await d1.batch(remaining.filter((item) => !applied.has(item.productId)).map((item) =>
        d1.prepare("UPDATE products SET stock = stock + ?, variants = ? WHERE id = ? AND variants = ?").bind(item.total, item.updatedVariantsJson, item.productId, item.variantsJson)));
      if (retry.every((result) => Number(result.meta.changes ?? 0) === 1)) return;
    }
  }
  console.error("Stock release needs manual review", { orderId });
}

export class CouponReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponReservationError";
  }
}

async function refreshCouponUsage(couponId: string) {
  await getD1().prepare("UPDATE coupons SET usage_count = (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = coupons.id), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(couponId).run();
}

/** Reserva um uso do cupom respeitando o limite total e o limite por cliente, em uma única instrução atômica. */
export async function reserveCouponUse(couponId: string, orderId: string, customerId: string) {
  const d1 = getD1();
  const result = await d1.prepare(`INSERT OR IGNORE INTO coupon_redemptions (coupon_id, order_id, customer_id)
    SELECT c.id, ?, ? FROM coupons c
    WHERE c.id = ? AND c.active = 1
      AND (c.usage_limit IS NULL OR (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) < c.usage_limit)
      AND (c.per_customer_limit IS NULL OR (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id AND r.customer_id = ?) < c.per_customer_limit)`)
    .bind(orderId, customerId, couponId, customerId)
    .run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new CouponReservationError("Este cupom atingiu o limite de utilizações.");
  await refreshCouponUsage(couponId);
}

async function releaseCouponUse(orderId: string) {
  const d1 = getD1();
  const redemption = await d1.prepare("SELECT coupon_id FROM coupon_redemptions WHERE order_id = ?").bind(orderId).first<{ coupon_id: string }>();
  if (!redemption) return;
  await d1.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").bind(orderId).run();
  await refreshCouponUsage(redemption.coupon_id);
}

/** Pedidos antigos (antes da reserva) ou pagos após expirar: registra o uso sem bloquear quem já pagou. */
async function ensureCouponRecorded(orderId: string, couponCode: string | null, customerId: string | null) {
  if (!couponCode) return;
  const d1 = getD1();
  const inserted = await d1.prepare("INSERT OR IGNORE INTO coupon_redemptions (coupon_id, order_id, customer_id) SELECT id, ?, ? FROM coupons WHERE code = ? COLLATE NOCASE")
    .bind(orderId, customerId, couponCode)
    .run();
  if (Number(inserted.meta.changes ?? 0) > 0) {
    await d1.prepare("UPDATE coupons SET usage_count = (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = coupons.id), updated_at = CURRENT_TIMESTAMP WHERE code = ? COLLATE NOCASE").bind(couponCode).run();
  }
}

type TransitionOptions = {
  /** Só altera se o status atual for um destes (proteção contra corrida e regressão). */
  expectedFrom?: OrderStatus[];
  /** Pagamento confirmado pelo gateway: nunca falha por falta de estoque; marca stock_issue para o admin resolver. */
  allowStockShortfall?: boolean;
  /** Atualiza payment_status junto com a mudança de status. */
  paymentStatus?: string;
  /** false para não enviar e-mail à cliente (ex.: falha ao abrir o checkout). */
  notify?: boolean;
};

export async function transitionOrderStatus(orderId: string, status: OrderStatus, options: TransitionOptions = {}) {
  const d1 = getD1();
  const existing = await d1
    .prepare("SELECT id, status, stock_committed, coupon_code, customer_id FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ id: string; status: string; stock_committed: number; coupon_code: string | null; customer_id: string | null }>();
  if (!existing) throw new Error("Pedido não encontrado.");
  const from = existing.status as OrderStatus;
  if (options.expectedFrom && !options.expectedFrom.includes(from)) return { from, to: from, changed: false };

  // Claim atômico do status: se outro processo mudou o pedido no meio, não fazemos nada.
  const claim = await d1
    .prepare("UPDATE orders SET status = ?, payment_status = COALESCE(?, payment_status), payment_updated_at = CASE WHEN ? IS NULL THEN payment_updated_at ELSE CURRENT_TIMESTAMP END WHERE id = ? AND status = ?")
    .bind(status, options.paymentStatus ?? null, options.paymentStatus ?? null, orderId, from)
    .run();
  if (Number(claim.meta.changes ?? 0) === 0) {
    if (options.expectedFrom) return { from, to: from, changed: false };
    throw new Error("O pedido foi alterado ao mesmo tempo. Atualize a página e tente novamente.");
  }

  if (stockHoldingStatuses.has(status) && !Number(existing.stock_committed)) {
    try {
      await reserveOrderStock(orderId);
    } catch (error) {
      if (!(error instanceof OrderStockError)) throw error;
      if (options.allowStockShortfall) {
        await d1.prepare("UPDATE orders SET stock_issue = 1 WHERE id = ?").bind(orderId).run();
        console.error("Paid order without stock", { orderId, reason: error.message });
      } else {
        await d1.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = ?").bind(from, orderId, status).run();
        throw error;
      }
    }
  } else if (!stockHoldingStatuses.has(status)) {
    await releaseOrderStock(orderId);
  }

  if (paidStatuses.has(status)) await ensureCouponRecorded(orderId, existing.coupon_code, existing.customer_id);
  if (status === "cancelado") await releaseCouponUse(orderId);

  const notificationByStatus: Partial<Record<OrderStatus, OrderNotificationType>> = {
    pago: "payment_confirmed",
    enviado: "order_shipped",
    cancelado: "order_cancelled",
  };
  const notification = notificationByStatus[status];
  if (notification && from !== status && options.notify !== false) {
    try {
      await deliverOrderNotification(orderId, notification);
    } catch (error) {
      console.error("Order status email failed", { orderId, status, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  return { from, to: status, changed: from !== status };
}

/** Cancela checkouts Asaas pendentes cuja janela de pagamento de 60 minutos venceu, devolvendo estoque e cupom. */
export async function expireUnpaidPendingOrders(limit = 100) {
  const d1 = getD1();
  const due = await d1
    .prepare("SELECT id FROM orders WHERE status = 'aguardando_pagamento' AND payment_provider = 'asaas' AND julianday(COALESCE(payment_updated_at, created_at)) <= julianday('now', '-1 hour') AND NOT EXISTS (SELECT 1 FROM payment_webhook_events e WHERE e.order_id = orders.id AND e.event_type = 'CHECKOUT_PAID') ORDER BY created_at LIMIT ?")
    .bind(Math.max(1, Math.min(500, Math.floor(limit))))
    .all<{ id: string }>();

  let canceled = 0;
  for (const order of due.results) {
    try {
      const result = await transitionOrderStatus(order.id, "cancelado", { expectedFrom: ["aguardando_pagamento"], paymentStatus: "CHECKOUT_EXPIRED" });
      if (result.changed) canceled += 1;
    } catch (error) {
      console.error("Expired order cancellation failed", { orderId: order.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return canceled;
}
