import { env } from "cloudflare:workers";
import { isValidCpf, lookupCep } from "./brazil";
import { calculateSuperFrete } from "./superfrete";

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

export function getD1() {
  if (!env.DB) {
    throw new Error("Banco de dados da loja indisponível.");
  }
  return env.DB;
}

export async function ensureStoreSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, parent_id TEXT, image TEXT, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON categories(active, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, material TEXT NOT NULL, image TEXT NOT NULL, badge TEXT, price_cents INTEGER NOT NULL, compare_at_cents INTEGER, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, active)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS product_categories (product_id TEXT NOT NULL, category_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(product_id, category_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_product_categories_category_product ON product_categories(category_id, product_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS homepage_banners (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', image TEXT NOT NULL, link_url TEXT, link_label TEXT, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_homepage_banners_active_sort ON homepage_banners(active, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS favorites (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_favorites_visitor_id ON favorites(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS cart_items (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_cart_items_visitor_id ON cart_items(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, cpf TEXT NOT NULL, cep TEXT NOT NULL, address TEXT NOT NULL, address_number TEXT NOT NULL, neighborhood TEXT NOT NULL DEFAULT '', complement TEXT, city TEXT NOT NULL, state TEXT NOT NULL, city_ibge_code TEXT, shipping_method TEXT NOT NULL, payment_method TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'aguardando_pagamento', stock_committed INTEGER NOT NULL DEFAULT 0, payment_provider TEXT, payment_preference_id TEXT, payment_id TEXT, payment_status TEXT, payment_checkout_url TEXT, payment_updated_at TEXT, superfrete_service_id TEXT, superfrete_service_name TEXT, superfrete_delivery_days INTEGER, superfrete_quote_price_cents INTEGER, superfrete_order_id TEXT, superfrete_protocol TEXT, superfrete_price_cents INTEGER, superfrete_status TEXT, superfrete_tracking_code TEXT, superfrete_label_url TEXT, superfrete_updated_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_created_at ON orders(visitor_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL, unit_price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_login_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_challenges_user_expires ON admin_login_challenges(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_expires ON admin_sessions(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS media_assets (key TEXT PRIMARY KEY, content_type TEXT NOT NULL, size INTEGER NOT NULL, original_name TEXT NOT NULL, uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS request_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 1, expires_at INTEGER NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expires_at ON request_rate_limits(expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS payment_webhook_events (event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order ON payment_webhook_events(order_id, created_at)"),
  ]);

  const categoryColumns = await d1.prepare("PRAGMA table_info(categories)").all<{ name: string }>();
  if (!categoryColumns.results.some((column) => column.name === "parent_id")) {
    await d1.prepare("ALTER TABLE categories ADD COLUMN parent_id TEXT").run();
  }
  if (!categoryColumns.results.some((column) => column.name === "image")) {
    await d1.prepare("ALTER TABLE categories ADD COLUMN image TEXT").run();
  }
  await d1.batch([
    d1.prepare("DROP INDEX IF EXISTS idx_categories_name"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_categories_parent_active_sort ON categories(parent_id, active, sort_order)"),
  ]);

  const productColumns = await d1.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  if (!productColumns.results.some((column) => column.name === "featured")) {
    await d1.prepare("ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0").run();
  }

  const orderColumns = await d1.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const existingOrderColumns = new Set(orderColumns.results.map((column) => column.name));
  const missingOrderColumns = [
    ["neighborhood", "ALTER TABLE orders ADD COLUMN neighborhood TEXT NOT NULL DEFAULT ''"],
    ["stock_committed", "ALTER TABLE orders ADD COLUMN stock_committed INTEGER NOT NULL DEFAULT 0"],
    ["payment_provider", "ALTER TABLE orders ADD COLUMN payment_provider TEXT"],
    ["payment_preference_id", "ALTER TABLE orders ADD COLUMN payment_preference_id TEXT"],
    ["payment_id", "ALTER TABLE orders ADD COLUMN payment_id TEXT"],
    ["payment_status", "ALTER TABLE orders ADD COLUMN payment_status TEXT"],
    ["payment_checkout_url", "ALTER TABLE orders ADD COLUMN payment_checkout_url TEXT"],
    ["payment_updated_at", "ALTER TABLE orders ADD COLUMN payment_updated_at TEXT"],
    ["city_ibge_code", "ALTER TABLE orders ADD COLUMN city_ibge_code TEXT"],
    ["superfrete_service_id", "ALTER TABLE orders ADD COLUMN superfrete_service_id TEXT"],
    ["superfrete_service_name", "ALTER TABLE orders ADD COLUMN superfrete_service_name TEXT"],
    ["superfrete_delivery_days", "ALTER TABLE orders ADD COLUMN superfrete_delivery_days INTEGER"],
    ["superfrete_quote_price_cents", "ALTER TABLE orders ADD COLUMN superfrete_quote_price_cents INTEGER"],
    ["superfrete_order_id", "ALTER TABLE orders ADD COLUMN superfrete_order_id TEXT"],
    ["superfrete_protocol", "ALTER TABLE orders ADD COLUMN superfrete_protocol TEXT"],
    ["superfrete_price_cents", "ALTER TABLE orders ADD COLUMN superfrete_price_cents INTEGER"],
    ["superfrete_status", "ALTER TABLE orders ADD COLUMN superfrete_status TEXT"],
    ["superfrete_tracking_code", "ALTER TABLE orders ADD COLUMN superfrete_tracking_code TEXT"],
    ["superfrete_label_url", "ALTER TABLE orders ADD COLUMN superfrete_label_url TEXT"],
    ["superfrete_updated_at", "ALTER TABLE orders ADD COLUMN superfrete_updated_at TEXT"],
  ] as const;
  for (const [column, statement] of missingOrderColumns) {
    if (!existingOrderColumns.has(column)) await d1.prepare(statement).run();
  }
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_payment_preference_id ON orders(payment_preference_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_superfrete_order_id ON orders(superfrete_order_id)"),
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

  await d1.prepare("INSERT OR IGNORE INTO categories (id, name, slug, active, sort_order) SELECT 'cat_' || lower(hex(randomblob(12))), category, lower(replace(category, ' ', '-')), 1, ROW_NUMBER() OVER (ORDER BY MIN(created_at), category) FROM products WHERE NOT EXISTS (SELECT 1 FROM product_categories) GROUP BY category").run();

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
    featured: Boolean(Number(row.featured)),
  };
}

export async function readStore(visitorId: string) {
  const d1 = getD1();
  const [productsResult, categoriesResult, productCategoriesResult, bannersResult, favoriteResult, cartResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock, featured FROM products WHERE active = 1 ORDER BY created_at, id").all(),
    d1.prepare("SELECT c.id, c.name, c.slug, c.parent_id, c.image FROM categories c WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT pc.product_id, pc.category_id FROM product_categories pc INNER JOIN categories c ON c.id = pc.category_id WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT id, title, subtitle, image, link_url, link_label FROM homepage_banners WHERE active = 1 ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT product_id FROM favorites WHERE visitor_id = ? ORDER BY created_at DESC").bind(visitorId).all(),
    d1.prepare("SELECT p.id, p.slug, p.name, p.category, p.description, p.material, p.image, p.badge, p.price_cents, p.compare_at_cents, p.stock, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1 ORDER BY c.updated_at DESC").bind(visitorId).all(),
  ]);

  const categoryIdsByProduct = new Map<string, string[]>();
  for (const row of productCategoriesResult.results as D1ResultRow[]) {
    const productId = String(row.product_id);
    categoryIdsByProduct.set(productId, [...(categoryIdsByProduct.get(productId) ?? []), String(row.category_id)]);
  }

  return {
    products: (productsResult.results as D1ResultRow[]).map((row) => ({
      ...normalizeProduct(row),
      categoryIds: categoryIdsByProduct.get(String(row.id)) ?? [],
    })),
    categories: (categoriesResult.results as D1ResultRow[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      parentId: row.parent_id ? String(row.parent_id) : null,
      image: row.image ? String(row.image) : null,
    })),
    banners: (bannersResult.results as D1ResultRow[]).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      subtitle: String(row.subtitle),
      image: String(row.image),
      linkUrl: row.link_url ? String(row.link_url) : null,
      linkLabel: row.link_label ? String(row.link_label) : null,
    })),
    favoriteIds: (favoriteResult.results as D1ResultRow[]).map((row) => String(row.product_id)),
    cart: (cartResult.results as D1ResultRow[]).map((row) => ({
      ...normalizeProduct(row),
      categoryIds: categoryIdsByProduct.get(String(row.id)) ?? [],
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
  neighborhood?: string;
  complement?: string;
  city?: string;
  state?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  coupon?: string;
};

export async function createOrder(visitorId: string, payload: CheckoutPayload) {
  const clean = (value: string | undefined, maximum: number) => {
    const normalized = value?.trim() ?? "";
    if (normalized.length > maximum) throw new Error("Um dos campos ultrapassou o tamanho permitido.");
    return normalized;
  };
  const customerName = clean(payload.customerName, 120);
  const email = clean(payload.email, 254).toLowerCase();
  const phone = clean(payload.phone, 30);
  const cpf = clean(payload.cpf, 20);
  const cep = clean(payload.cep, 12);
  const address = clean(payload.address, 180);
  const addressNumber = clean(payload.addressNumber, 30);
  const neighborhood = clean(payload.neighborhood, 100);
  const complement = clean(payload.complement, 100);
  const city = clean(payload.city, 100);
  const state = clean(payload.state, 2).toUpperCase();
  const required = [
    customerName,
    email,
    phone,
    cpf,
    cep,
    address,
    addressNumber,
    neighborhood,
    city,
    state,
  ];
  if (required.some((value) => !value)) throw new Error("Preencha todos os campos obrigatórios.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if ((phone.match(/\d/g) ?? []).length < 10) throw new Error("Informe um telefone válido.");
  if (!isValidCpf(cpf)) throw new Error("Informe um CPF válido.");
  if ((cep.match(/\d/g) ?? []).length !== 8) throw new Error("Informe um CEP válido.");
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("Informe um estado válido.");
  if (!payload.shippingMethod?.trim()) throw new Error("Selecione a entrega.");
  if (!['pix', 'card'].includes(payload.paymentMethod ?? '')) throw new Error("Selecione a forma de pagamento.");
  const verifiedAddress = await lookupCep(cep);
  if (verifiedAddress.city.toLocaleLowerCase("pt-BR") !== city.toLocaleLowerCase("pt-BR") || verifiedAddress.state !== state) {
    throw new Error("Cidade ou estado não correspondem ao CEP informado.");
  }

  const d1 = getD1();
  const cartResult = await d1.prepare("SELECT p.id, p.name, p.price_cents, p.stock, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1").bind(visitorId).all();
  const items = cartResult.results as D1ResultRow[];
  if (!items.length) throw new Error("Seu carrinho está vazio.");
  for (const item of items) {
    if (Number(item.quantity) > Number(item.stock)) throw new Error(`Estoque insuficiente para ${String(item.name)}.`);
  }

  const subtotalCents = items.reduce((sum, item) => sum + Number(item.price_cents) * Number(item.quantity), 0);
  const shippingOptions = await calculateSuperFrete(cep, subtotalCents);
  const selectedShipping = shippingOptions.find((option) => option.id === payload.shippingMethod);
  if (!selectedShipping) throw new Error("A modalidade de entrega selecionada não está mais disponível.");
  const coupon = payload.coupon?.trim().toUpperCase();
  const couponDiscountCents = coupon === "ELLE10" ? Math.round(subtotalCents * 0.1) : 0;
  const pixDiscountCents = payload.paymentMethod === "pix" ? Math.round((subtotalCents - couponDiscountCents) * 0.05) : 0;
  const discountCents = couponDiscountCents + pixDiscountCents;
  const shippingCents = subtotalCents >= 39900 ? 0 : selectedShipping.priceCents;
  const totalCents = subtotalCents - discountCents + shippingCents;
  const orderId = `ELJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const statements = [
    d1.prepare("INSERT INTO orders (id, visitor_id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city, state, city_ibge_code, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, total_cents, superfrete_service_id, superfrete_service_name, superfrete_delivery_days, superfrete_quote_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      orderId,
      visitorId,
      customerName,
      email,
      phone,
      cpf || null,
      cep,
      address,
      addressNumber,
      neighborhood,
      complement || null,
      city,
      state,
      verifiedAddress.cityIbgeCode,
      `superfrete:${selectedShipping.id}`,
      payload.paymentMethod,
      subtotalCents,
      shippingCents,
      discountCents,
      totalCents,
      selectedShipping.id,
      selectedShipping.name,
      selectedShipping.deliveryDays,
      selectedShipping.priceCents,
    ),
    ...items.map((item) =>
      d1.prepare("INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?)").bind(orderId, item.id, item.name, item.price_cents, item.quantity),
    ),
  ];
  await d1.batch(statements);

  return {
    id: orderId,
    totalCents,
    status: "aguardando_pagamento",
    paymentMethod: payload.paymentMethod,
  };
}

export async function clearVisitorCart(visitorId: string) {
  await getD1().prepare("DELETE FROM cart_items WHERE visitor_id = ?").bind(visitorId).run();
}
