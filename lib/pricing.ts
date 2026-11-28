export const MAX_CARD_INSTALLMENTS = 6;
export const MIN_CARD_INSTALLMENT_CENTS = 500;

export function installmentPlan(totalCents: number) {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const count = Math.max(1, Math.min(MAX_CARD_INSTALLMENTS, Math.floor(safeTotal / MIN_CARD_INSTALLMENT_CENTS)));
  return { count, installmentCents: Math.ceil(safeTotal / count) };
}

export const MAX_PRODUCT_DISCOUNT_PERCENT = 90;

/** Desconto percentual do produto (definido no painel). Sempre arredonda para o centavo mais próximo e nunca zera o preço. */
export function normalizeDiscountPercent(value: unknown) {
  return Math.max(0, Math.min(MAX_PRODUCT_DISCOUNT_PERCENT, Math.trunc(Number(value) || 0)));
}

export function applyProductDiscount(cents: number, percent: unknown) {
  const safeCents = Math.max(0, Math.round(Number(cents) || 0));
  const safePercent = normalizeDiscountPercent(percent);
  if (!safePercent || !safeCents) return safeCents;
  return Math.max(1, Math.round(safeCents * (100 - safePercent) / 100));
}
