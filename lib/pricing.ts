export const MAX_CARD_INSTALLMENTS = 10;
export const MIN_CARD_INSTALLMENT_CENTS = 500;

export function installmentPlan(totalCents: number) {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const count = Math.max(1, Math.min(MAX_CARD_INSTALLMENTS, Math.floor(safeTotal / MIN_CARD_INSTALLMENT_CENTS)));
  return { count, installmentCents: Math.ceil(safeTotal / count) };
}
