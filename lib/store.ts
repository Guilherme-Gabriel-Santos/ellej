import { env } from "cloudflare:workers";

type D1ResultRow = Record<string, unknown>;

const productSeeds = [
  {
    id: "choker-coracoes",
    slug: "choker-5-coracoes",
    name: "Choker 5 Corações",
    category: "Colares",
    description: "Cinco corações lapidados em uma corrente delicada para iluminar o colo sem perder a elegância.",
    material: "Prata 925 • Zircônias premium",
    image: "/brand/choker-coracoes.webp",
    badge: "Mais desejado",
    priceCents: 55000,
    compareAtCents: null,
    stock: 3,
  },
  {
    id: "colar-ponto-luz",
    slug: "colar-ponto-luz",
    name: "Colar Ponto Luz",
    category: "Colares",
    description: "A peça essencial: brilho limpo, cravação precisa e presença delicada para acompanhar todos os dias.",
    material: "Prata 925 • Zircônia cristal",
    image: "/brand/colar-ponto-luz.webp",
    badge: "Best-seller",
    priceCents: 28500,
    compareAtCents: null,
    stock: 6,
  },
  {
    id: "conjunto-kunzita",
    slug: "conjunto-kunzita",
    name: "Conjunto Kunzita",
    category: "Conjuntos",
    description: "Kunzita rosa em lapidação clássica, criada para trazer cor com sofisticação e leveza.",
    material: "Prata 925 • Kunzita criada",
    image: "/brand/conjunto-kunzita.webp",
    badge: "Edição limitada",
    priceCents: 29800,
    compareAtCents: null,
    stock: 4,
  },
  {
    id: "conjunto-ametista",
    slug: "conjunto-ametista",
    name: "Conjunto Ametista",
    category: "Conjuntos",
    description: "O violeta profundo da ametista encontra o brilho frio da prata em um desenho atemporal.",
    material: "Prata 925 • Ametista criada",
    image: "/brand/conjunto-ametista.webp",
    badge: "Novo",
    priceCents: 29800,
    compareAtCents: null,
    stock: 5,
  },
  {
    id: "ear-cuff-medio",
    slug: "ear-cuff-medio",
    name: "Ear Cuff Médio",
    category: "Brincos",
    description: "Uma linha ascendente de brilho que transforma a orelha sem exigir segundo furo.",
    material: "Prata 925 • Zircônias premium",
    image: "/brand/ear-cuff.webp",
    badge: "Últimas peças",
    priceCents: 19900,
    compareAtCents: 23500,
    stock: 2,
  },
];

function getD1() {
  if (!env.DB) {
    throw new Error("Banco de dados da loja indisponível.");
  }
  return env.DB;
}

export async function ensureStoreSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, material TEXT NOT NULL, image TEXT NOT NULL, badge TEXT, price_cents INTEGER NOT NULL, compare_at_cents INTEGER, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, active)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS favorites (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_favorites_visitor_id ON favorites(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS cart_items (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_cart_items_visitor_id ON cart_items(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, cpf TEXT, cep TEXT NOT NULL, address TEXT NOT NULL, address_number TEXT NOT NULL, complement TEXT, city TEXT NOT NULL, state TEXT NOT NULL, shipping_method TEXT NOT NULL, payment_method TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'aguardando_pagamento', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_created_at ON orders(visitor_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL, unit_price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"),
  ]);

  await d1.batch(
    productSeeds.map((product) =>
      d1
        .prepare("INSERT OR IGNORE INTO products (id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)")
        .bind(
          product.id,
          product.slug,
          product.name,
          product.category,
          product.description,
          product.material,
          product.image,
          product.badge,
          product.priceCents,
          product.compareAtCents,
          product.stock,
        ),
    ),
  );

  await d1.prepare("PRAGMA optimize").run();
}

function normalizeProduct(row: D1ResultRow) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description),
    material: String(row.material),
    image: String(row.image),
    badge: row.badge ? String(row.badge) : null,
    priceCents: Number(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    stock: Number(row.stock),
  };
}

export async function readStore(visitorId: string) {
  const d1 = getD1();
  const [productsResult, favoriteResult, cartResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock FROM products WHERE active = 1 ORDER BY created_at, id").all(),
    d1.prepare("SELECT product_id FROM favorites WHERE visitor_id = ? ORDER BY created_at DESC").bind(visitorId).all(),
    d1.prepare("SELECT p.id, p.slug, p.name, p.category, p.description, p.material, p.image, p.badge, p.price_cents, p.compare_at_cents, p.stock, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1 ORDER BY c.updated_at DESC").bind(visitorId).all(),
  ]);

  return {
    products: (productsResult.results as D1ResultRow[]).map(normalizeProduct),
    favoriteIds: (favoriteResult.results as D1ResultRow[]).map((row) => String(row.product_id)),
    cart: (cartResult.results as D1ResultRow[]).map((row) => ({
      ...normalizeProduct(row),
      quantity: Number(row.quantity),
    })),
  };
}

export async function toggleFavorite(visitorId: string, productId: string) {
  const d1 = getD1();
  const existing = await d1.prepare("SELECT 1 AS found FROM favorites WHERE visitor_id = ? AND product_id = ?").bind(visitorId, productId).first();
  if (existing) {
    await d1.prepare("DELETE FROM favorites WHERE visitor_id = ? AND product_id = ?").bind(visitorId, productId).run();
  } else {
    await d1.prepare("INSERT OR IGNORE INTO favorites (visitor_id, product_id) VALUES (?, ?)").bind(visitorId, productId).run();
  }
  return readStore(visitorId);
}

export async function updateCart(visitorId: string, productId: string, quantity: number) {
  const d1 = getD1();
  const product = await d1.prepare("SELECT stock FROM products WHERE id = ? AND active = 1").bind(productId).first<{ stock: number }>();
  if (!product) throw new Error("Produto não encontrado.");
  const safeQuantity = Math.max(0, Math.min(Math.trunc(quantity), Number(product.stock)));
  if (safeQuantity === 0) {
    await d1.prepare("DELETE FROM cart_items WHERE visitor_id = ? AND product_id = ?").bind(visitorId, productId).run();
  } else {
    await d1.prepare("INSERT INTO cart_items (visitor_id, product_id, quantity, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(visitor_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP").bind(visitorId, productId, safeQuantity).run();
  }
  return readStore(visitorId);
}

export async function subscribe(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Informe um e-mail válido.");
  await getD1().prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").bind(normalized).run();
}

type CheckoutPayload = {
  customerName?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  cep?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  city?: string;
  state?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  coupon?: string;
};

export async function createOrder(visitorId: string, payload: CheckoutPayload) {
  const required = [
    payload.customerName,
    payload.email,
    payload.phone,
    payload.cep,
    payload.address,
    payload.addressNumber,
    payload.city,
    payload.state,
  ];
  if (required.some((value) => !value?.trim())) throw new Error("Preencha todos os campos obrigatórios.");
  if (!/^\S+@\S+\.\S+$/.test(payload.email!.trim())) throw new Error("Informe um e-mail válido.");
  if ((payload.phone!.match(/\d/g) ?? []).length < 10) throw new Error("Informe um telefone válido.");
  if ((payload.cep!.match(/\d/g) ?? []).length !== 8) throw new Error("Informe um CEP válido.");
  if (!['standard', 'express'].includes(payload.shippingMethod ?? '')) throw new Error("Selecione a entrega.");
  if (!['pix', 'card'].includes(payload.paymentMethod ?? '')) throw new Error("Selecione a forma de pagamento.");

  const d1 = getD1();
  const cartResult = await d1.prepare("SELECT p.id, p.name, p.price_cents, p.stock, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1").bind(visitorId).all();
  const items = cartResult.results as D1ResultRow[];
  if (!items.length) throw new Error("Seu carrinho está vazio.");
  for (const item of items) {
    if (Number(item.quantity) > Number(item.stock)) throw new Error(`Estoque insuficiente para ${String(item.name)}.`);
  }

  const subtotalCents = items.reduce((sum, item) => sum + Number(item.price_cents) * Number(item.quantity), 0);
  const coupon = payload.coupon?.trim().toUpperCase();
  const couponDiscountCents = coupon === "ELLE10" ? Math.round(subtotalCents * 0.1) : 0;
  const pixDiscountCents = payload.paymentMethod === "pix" ? Math.round((subtotalCents - couponDiscountCents) * 0.05) : 0;
  const discountCents = couponDiscountCents + pixDiscountCents;
  const shippingCents = payload.shippingMethod === "express" && subtotalCents < 39900 ? 2490 : 0;
  const totalCents = subtotalCents - discountCents + shippingCents;
  const orderId = `ELJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const statements = [
    d1.prepare("INSERT INTO orders (id, visitor_id, customer_name, email, phone, cpf, cep, address, address_number, complement, city, state, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      orderId,
      visitorId,
      payload.customerName!.trim(),
      payload.email!.trim().toLowerCase(),
      payload.phone!.trim(),
      payload.cpf?.trim() || null,
      payload.cep!.trim(),
      payload.address!.trim(),
      payload.addressNumber!.trim(),
      payload.complement?.trim() || null,
      payload.city!.trim(),
      payload.state!.trim().toUpperCase(),
      payload.shippingMethod,
      payload.paymentMethod,
      subtotalCents,
      shippingCents,
      discountCents,
      totalCents,
    ),
    ...items.flatMap((item) => [
      d1.prepare("INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?)").bind(orderId, item.id, item.name, item.price_cents, item.quantity),
      d1.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?").bind(item.quantity, item.id, item.quantity),
    ]),
    d1.prepare("DELETE FROM cart_items WHERE visitor_id = ?").bind(visitorId),
  ];
  await d1.batch(statements);

  return {
    id: orderId,
    totalCents,
    status: "aguardando_pagamento",
    paymentMethod: payload.paymentMethod,
  };
}
