type CouponRow = {
  id: string;
  code: string;
  name: string;
  discount_type: string;
  discount_value: number;
  free_shipping: number;
  applies_to: string;
  minimum_subtotal_cents: number;
  maximum_discount_cents: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_customer_limit: number | null;
  starts_at: string | null;
  expires_at: string | null;
  active: number;
};

export type CouponCartItem = {
  id: string;
  priceCents: number;
  quantity: number;
};

export type AppliedCoupon = {
  id: string;
  code: string;
  name: string;
  productDiscountCents: number;
  shippingDiscountCents: number;
  totalDiscountCents: number;
};

export function normalizeCouponCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function validDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("A validade deste cupom está inválida.");
  return timestamp;
}

export async function applyCoupon(
  d1: D1Database,
  codeInput: unknown,
  items: CouponCartItem[],
  shippingCents: number,
  customerId: string | null = null,
): Promise<AppliedCoupon | null> {
  const code = normalizeCouponCode(codeInput);
  if (!code) return null;

  const coupon = await d1
    .prepare("SELECT id, code, name, discount_type, discount_value, free_shipping, applies_to, minimum_subtotal_cents, maximum_discount_cents, usage_limit, usage_count, per_customer_limit, starts_at, expires_at, active FROM coupons WHERE code = ? COLLATE NOCASE")
    .bind(code)
    .first<CouponRow>();
  if (!coupon || !Number(coupon.active)) throw new Error("Cupom inválido ou indisponível.");

  const now = Date.now();
  const startsAt = validDate(coupon.starts_at);
  const expiresAt = validDate(coupon.expires_at);
  // Mensagem única para "ainda não começou" e "inválido": não revela cupons agendados (ex.: Black Friday).
  if (startsAt !== null && now < startsAt) throw new Error("Cupom inválido ou indisponível.");
  if (expiresAt !== null && now > expiresAt) throw new Error("Cupom inválido ou indisponível.");
  if (coupon.usage_limit !== null && Number(coupon.usage_count) >= Number(coupon.usage_limit)) {
    throw new Error("Este cupom atingiu o limite de utilizações.");
  }
  if (coupon.per_customer_limit !== null && customerId) {
    const used = await d1.prepare("SELECT COUNT(*) AS total FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ?").bind(coupon.id, customerId).first<{ total: number }>();
    if (Number(used?.total ?? 0) >= Number(coupon.per_customer_limit)) throw new Error("Você já utilizou este cupom.");
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  if (subtotalCents < Number(coupon.minimum_subtotal_cents)) {
    const minimum = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(coupon.minimum_subtotal_cents) / 100);
    throw new Error(`Este cupom exige uma compra mínima de ${minimum}.`);
  }

  let eligibleIds: Set<string> | null = null;
  if (coupon.applies_to === "selected") {
    const result = await d1.prepare("SELECT product_id FROM coupon_products WHERE coupon_id = ?").bind(coupon.id).all<{ product_id: string }>();
    eligibleIds = new Set(result.results.map((row) => row.product_id));
  }
  const eligibleSubtotalCents = items.reduce(
    (sum, item) => sum + (eligibleIds === null || eligibleIds.has(item.id) ? item.priceCents * item.quantity : 0),
    0,
  );
  if (eligibleIds !== null && eligibleSubtotalCents <= 0) {
    throw new Error("Este cupom não se aplica aos produtos do carrinho.");
  }

  let productDiscountCents = 0;
  if (coupon.discount_type === "percentage") {
    productDiscountCents = Math.round(eligibleSubtotalCents * Number(coupon.discount_value) / 100);
  } else if (coupon.discount_type === "fixed") {
    productDiscountCents = Math.min(eligibleSubtotalCents, Number(coupon.discount_value));
  }
  if (coupon.maximum_discount_cents !== null) {
    productDiscountCents = Math.min(productDiscountCents, Number(coupon.maximum_discount_cents));
  }
  productDiscountCents = Math.max(0, Math.min(productDiscountCents, eligibleSubtotalCents));
  const shippingDiscountCents = Number(coupon.free_shipping) ? Math.max(0, shippingCents) : 0;

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    productDiscountCents,
    shippingDiscountCents,
    totalDiscountCents: productDiscountCents + shippingDiscountCents,
  };
}
