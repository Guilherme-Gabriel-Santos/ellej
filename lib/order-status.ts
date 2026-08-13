import { getD1 } from "./store";

const orderStatuses = [
  "aguardando_pagamento",
  "pago",
  "em_separacao",
  "enviado",
  "concluido",
  "cancelado",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export function isOrderStatus(status: string): status is OrderStatus {
  return orderStatuses.includes(status as OrderStatus);
}

export async function transitionOrderStatus(orderId: string, status: OrderStatus) {
  const d1 = getD1();
  const existing = await d1
    .prepare("SELECT id, status, stock_committed FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ id: string; status: string; stock_committed: number }>();
  if (!existing) throw new Error("Pedido não encontrado.");

  const paidStatuses = new Set<OrderStatus>(["pago", "em_separacao", "enviado", "concluido"]);
  const shouldCommit = paidStatuses.has(status);
  const isCommitted = Boolean(Number(existing.stock_committed));

  if (shouldCommit && !isCommitted) {
    const items = await d1
      .prepare("SELECT oi.product_id, oi.product_name, oi.quantity, p.stock FROM order_items oi INNER JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")
      .bind(orderId)
      .all<{ product_id: string; product_name: string; quantity: number; stock: number }>();
    if (!items.results.length) throw new Error("O pedido não possui itens válidos.");
    const unavailable = items.results.find((item) => Number(item.stock) < Number(item.quantity));
    if (unavailable) throw new Error(`Estoque insuficiente para ${unavailable.product_name}.`);

    const claim = await d1
      .prepare("UPDATE orders SET status = ?, stock_committed = 1 WHERE id = ? AND stock_committed = 0")
      .bind(status, orderId)
      .run();
    if (Number(claim.meta.changes ?? 0) > 0) {
      const results = await d1.batch(
        items.results.map((item) =>
          d1.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?").bind(item.quantity, item.product_id, item.quantity),
        ),
      );
      if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
        await d1.batch([
          ...items.results.map((item, index) =>
            Number(results[index]?.meta.changes ?? 0) === 1
              ? d1.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(item.quantity, item.product_id)
              : d1.prepare("SELECT 1"),
          ),
          d1.prepare("UPDATE orders SET status = ?, stock_committed = 0 WHERE id = ?").bind(existing.status, orderId),
        ]);
        throw new Error("O estoque mudou durante a atualização. Tente novamente.");
      }
    }
  } else if (!shouldCommit && isCommitted) {
    const release = await d1
      .prepare("UPDATE orders SET status = ?, stock_committed = 0 WHERE id = ? AND stock_committed = 1")
      .bind(status, orderId)
      .run();
    if (Number(release.meta.changes ?? 0) > 0) {
      const items = await d1
        .prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?")
        .bind(orderId)
        .all<{ product_id: string; quantity: number }>();
      await d1.batch(
        items.results.map((item) =>
          d1.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(item.quantity, item.product_id),
        ),
      );
    }
  } else {
    await d1.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  }

  return { from: existing.status, to: status };
}
