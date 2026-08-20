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
      .prepare("SELECT oi.product_id, oi.product_name, oi.variant_id, oi.quantity, p.stock, p.variants, p.track_stock FROM order_items oi INNER JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")
      .bind(orderId)
      .all<{ product_id: string; product_name: string; variant_id: string | null; quantity: number; stock: number; variants: string; track_stock: number }>();
    if (!items.results.length) throw new Error("O pedido não possui itens válidos.");

    const grouped = new Map<string, { productId: string; productName: string; total: number; stock: number; variantsJson: string; trackStock: boolean; variantQuantities: Map<string, number> }>();
    for (const item of items.results) {
      const current = grouped.get(item.product_id) ?? { productId: item.product_id, productName: item.product_name, total: 0, stock: Number(item.stock), variantsJson: item.variants || "[]", trackStock: Boolean(Number(item.track_stock)), variantQuantities: new Map<string, number>() };
      current.total += Number(item.quantity);
      if (item.variant_id) current.variantQuantities.set(item.variant_id, (current.variantQuantities.get(item.variant_id) ?? 0) + Number(item.quantity));
      grouped.set(item.product_id, current);
    }

    const changes = [...grouped.values()].filter((item) => item.trackStock).map((item) => {
      let variants: Array<{ id: string; stock: number }> = [];
      try { variants = JSON.parse(item.variantsJson || "[]"); } catch { variants = []; }
      if (item.stock < item.total) throw new Error(`Estoque insuficiente para ${item.productName}.`);
      for (const [variantId, quantity] of item.variantQuantities) {
        const variant = variants.find((entry) => entry.id === variantId);
        if (!variant || Number(variant.stock) < quantity) throw new Error(`Estoque insuficiente para ${item.productName}.`);
        variant.stock = Number(variant.stock) - quantity;
      }
      return { ...item, updatedVariantsJson: JSON.stringify(variants) };
    });

    const claim = await d1
      .prepare("UPDATE orders SET status = ?, stock_committed = 1 WHERE id = ? AND stock_committed = 0")
      .bind(status, orderId)
      .run();
    if (Number(claim.meta.changes ?? 0) > 0) {
      const results = changes.length ? await d1.batch(
        changes.map((item) =>
          d1.prepare("UPDATE products SET stock = stock - ?, variants = ? WHERE id = ? AND stock >= ? AND variants = ?").bind(item.total, item.updatedVariantsJson, item.productId, item.total, item.variantsJson),
        ),
      ) : [];
      if (results.some((result) => Number(result.meta.changes ?? 0) !== 1)) {
        await d1.batch([
          ...changes.map((item, index) =>
            Number(results[index]?.meta.changes ?? 0) === 1
              ? d1.prepare("UPDATE products SET stock = stock + ?, variants = ? WHERE id = ? AND variants = ?").bind(item.total, item.variantsJson, item.productId, item.updatedVariantsJson)
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
        .prepare("SELECT oi.product_id, oi.variant_id, oi.quantity, p.variants, p.track_stock FROM order_items oi INNER JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")
        .bind(orderId)
        .all<{ product_id: string; variant_id: string | null; quantity: number; variants: string; track_stock: number }>();

      const grouped = new Map<string, { total: number; variantsJson: string; trackStock: boolean; variantQuantities: Map<string, number> }>();
      for (const item of items.results) {
        const current = grouped.get(item.product_id) ?? { total: 0, variantsJson: item.variants || "[]", trackStock: Boolean(Number(item.track_stock)), variantQuantities: new Map<string, number>() };
        current.total += Number(item.quantity);
        if (item.variant_id) current.variantQuantities.set(item.variant_id, (current.variantQuantities.get(item.variant_id) ?? 0) + Number(item.quantity));
        grouped.set(item.product_id, current);
      }
      const releases = [...grouped].filter(([, item]) => item.trackStock).map(([productId, item]) => {
          let variants: Array<{ id: string; stock: number }> = [];
          try { variants = JSON.parse(item.variantsJson || "[]"); } catch { variants = []; }
          for (const [variantId, quantity] of item.variantQuantities) {
            const variant = variants.find((entry) => entry.id === variantId);
            if (variant) variant.stock = Number(variant.stock) + quantity;
          }
          return d1.prepare("UPDATE products SET stock = stock + ?, variants = ? WHERE id = ?").bind(item.total, JSON.stringify(variants), productId);
        });
      if (releases.length) await d1.batch(releases);
    }
  } else {
    await d1.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  }

  return { from: existing.status, to: status };
}
