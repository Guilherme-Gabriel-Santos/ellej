import { getD1 } from "./store";
import { writeAudit, type AdminSession } from "./admin-auth";

type Row = Record<string, unknown>;

const orderStatuses = [
  "aguardando_pagamento",
  "pago",
  "em_separacao",
  "enviado",
  "concluido",
  "cancelado",
] as const;

function textValue(value: unknown, field: string, maxLength: number, required = true) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new Error(`Preencha ${field}.`);
  if (normalized.length > maxLength) throw new Error(`${field} ultrapassou o tamanho permitido.`);
  return normalized;
}

function integerValue(value: unknown, field: string, minimum = 0, maximum = 10_000_000) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(`${field} está inválido.`);
  }
  return normalized;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || `joia-${Date.now().toString(36)}`;
}

function normalizeProduct(row: Row) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description),
    material: String(row.material),
    image: String(row.image),
    badge: row.badge ? String(row.badge) : "",
    priceCents: Number(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    stock: Number(row.stock),
    active: Boolean(Number(row.active)),
    createdAt: String(row.created_at),
  };
}

export async function readAdminDashboard() {
  const d1 = getD1();
  const [productsResult, ordersResult, itemsResult, subscribersResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock, active, created_at FROM products ORDER BY active DESC, created_at DESC, name").all(),
    d1.prepare("SELECT id, customer_name, email, phone, cpf, cep, address, address_number, complement, city, state, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, total_cents, status, created_at FROM orders ORDER BY created_at DESC LIMIT 100").all(),
    d1.prepare("SELECT id, order_id, product_id, product_name, unit_price_cents, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 100) ORDER BY id").all(),
    d1.prepare("SELECT COUNT(*) AS total FROM subscribers").first<{ total: number }>(),
  ]);

  const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
  for (const row of itemsResult.results as Row[]) {
    const orderId = String(row.order_id);
    const current = itemsByOrder.get(orderId) ?? [];
    current.push({
      id: Number(row.id),
      productId: String(row.product_id),
      productName: String(row.product_name),
      unitPriceCents: Number(row.unit_price_cents),
      quantity: Number(row.quantity),
    });
    itemsByOrder.set(orderId, current);
  }

  const products = (productsResult.results as Row[]).map(normalizeProduct);
  const orders = (ordersResult.results as Row[]).map((row) => ({
    id: String(row.id),
    customerName: String(row.customer_name),
    email: String(row.email),
    phone: String(row.phone),
    cpf: row.cpf ? String(row.cpf) : "",
    cep: String(row.cep),
    address: String(row.address),
    addressNumber: String(row.address_number),
    complement: row.complement ? String(row.complement) : "",
    city: String(row.city),
    state: String(row.state),
    shippingMethod: String(row.shipping_method),
    paymentMethod: String(row.payment_method),
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    discountCents: Number(row.discount_cents),
    totalCents: Number(row.total_cents),
    status: String(row.status),
    createdAt: String(row.created_at),
    items: itemsByOrder.get(String(row.id)) ?? [],
  }));

  const paidStatuses = new Set(["pago", "em_separacao", "enviado", "concluido"]);
  return {
    products,
    orders,
    stats: {
      activeProducts: products.filter((product) => product.active).length,
      lowStock: products.filter((product) => product.active && product.stock <= 3).length,
      pendingOrders: orders.filter((order) => order.status === "aguardando_pagamento").length,
      paidRevenueCents: orders.filter((order) => paidStatuses.has(order.status)).reduce((sum, order) => sum + order.totalCents, 0),
      subscribers: Number(subscribersResult?.total ?? 0),
    },
  };
}

type ProductPayload = Record<string, unknown>;

function validateProduct(payload: ProductPayload) {
  const name = textValue(payload.name, "o nome", 120);
  const category = textValue(payload.category, "a categoria", 60);
  const description = textValue(payload.description, "a descrição", 900);
  const material = textValue(payload.material, "o material", 160);
  const image = textValue(payload.image, "uma foto", 600);
  if (!image.startsWith("/api/media?key=") && !image.startsWith("/brand/") && !/^https:\/\//i.test(image)) {
    throw new Error("Envie uma foto válida do produto.");
  }
  const priceCents = integerValue(payload.priceCents, "O preço", 1, 100_000_000);
  const compareAtCents = payload.compareAtCents === null || payload.compareAtCents === "" || payload.compareAtCents === undefined
    ? null
    : integerValue(payload.compareAtCents, "O preço anterior", 1, 100_000_000);
  if (compareAtCents !== null && compareAtCents <= priceCents) {
    throw new Error("O preço anterior precisa ser maior que o preço atual.");
  }
  return {
    name,
    category,
    description,
    material,
    image,
    badge: textValue(payload.badge, "o selo", 50, false) || null,
    priceCents,
    compareAtCents,
    stock: integerValue(payload.stock, "O estoque", 0, 100_000),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
  };
}

async function availableSlug(name: string, excludedId?: string) {
  const d1 = getD1();
  const base = slugify(name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const row = await d1
      .prepare("SELECT id FROM products WHERE slug = ? AND (? IS NULL OR id != ?)")
      .bind(slug, excludedId ?? null, excludedId ?? null)
      .first<{ id: string }>();
    if (!row) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createProduct(session: AdminSession, payload: ProductPayload) {
  const product = validateProduct(payload);
  const id = `prd_${crypto.randomUUID()}`;
  const slug = await availableSlug(product.name);
  await getD1()
    .prepare("INSERT INTO products (id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, slug, product.name, product.category, product.description, product.material, product.image, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active)
    .run();
  await writeAudit(session.userId, "product.created", "product", id, { name: product.name });
  return id;
}

export async function updateProduct(session: AdminSession, payload: ProductPayload) {
  const id = textValue(payload.id, "o produto", 80);
  const existing = await getD1().prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("Produto não encontrado.");
  const product = validateProduct(payload);
  const slug = await availableSlug(product.name, id);
  await getD1()
    .prepare("UPDATE products SET slug = ?, name = ?, category = ?, description = ?, material = ?, image = ?, badge = ?, price_cents = ?, compare_at_cents = ?, stock = ?, active = ? WHERE id = ?")
    .bind(slug, product.name, product.category, product.description, product.material, product.image, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active, id)
    .run();
  await writeAudit(session.userId, "product.updated", "product", id, { name: product.name });
}

export async function setProductActive(session: AdminSession, productId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE products SET active = ? WHERE id = ?").bind(active ? 1 : 0, productId).run();
  if (!result.success) throw new Error("Não foi possível atualizar o produto.");
  await writeAudit(session.userId, active ? "product.activated" : "product.archived", "product", productId);
}

export async function updateOrderStatus(session: AdminSession, orderId: string, status: string) {
  if (!orderStatuses.includes(status as (typeof orderStatuses)[number])) throw new Error("Situação do pedido inválida.");
  const existing = await getD1().prepare("SELECT id, status FROM orders WHERE id = ?").bind(orderId).first<{ id: string; status: string }>();
  if (!existing) throw new Error("Pedido não encontrado.");
  await getD1().prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  await writeAudit(session.userId, "order.status_changed", "order", orderId, { from: existing.status, to: status });
}
