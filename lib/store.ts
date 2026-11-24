import { env } from "cloudflare:workers";
import { isValidCpf, lookupCep } from "./brazil";
import { applyCoupon } from "./coupons";
import { reserveCouponUse, reserveOrderStock } from "./order-status";
import { calculateSuperFrete, shippingPackageFromItems } from "./superfrete";

type D1ResultRow = Record<string, unknown>;

type ProductVariant = {
  id: string;
  size: string;
  color: string;
  material: string;
  sku: string;
  priceCents: number;
  stock: number;
  active: boolean;
};

type ProductOption = { id: string; label: string; addedPriceCents: number; active: boolean };
type ProductOptionGroup = { id: string; name: string; options: ProductOption[]; selectionMode?: "manual" | "personalizationLength" };

function parseOptionGroups(value: unknown): ProductOptionGroup[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function personalizationLetterCount(value: string) {
  return value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

// Gravação aceita letras, números, espaço e . ' - & (sem emojis/símbolos que escapariam da cobrança por letra).
const personalizationAllowed = /^[\p{L}\p{M}\p{N} .'&-]*$/u;
function assertPersonalizationCharacters(value: string) {
  if (!personalizationAllowed.test(value)) throw new Error("A gravação aceita apenas letras, números, espaço e os sinais . ' - &.");
}

function optionForPersonalizationLength(group: ProductOptionGroup, value: string) {
  const count = personalizationLetterCount(value);
  if (!count) return null;
  return group.options.find((option) => {
    if (!option.active) return false;
    const range = option.label.match(/(\d+)\s*(?:-|–|—|a|até)\s*(\d+)/i);
    return Boolean(range && count >= Number(range[1]) && count <= Number(range[2]));
  }) ?? null;
}

function resolveMultiOptionSelection(value: string, groups: ProductOptionGroup[], personalizationText = "") {
  let selected: Record<string, string> = {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    selected = parsed as Record<string, string>;
  } catch { throw new Error("Escolha uma alternativa em cada grupo de opções."); }
  const manualGroups = groups.filter((group) => group.selectionMode !== "personalizationLength");
  if (manualGroups.some((group) => !selected[group.id]) || Object.keys(selected).some((id) => !groups.some((group) => group.id === id))) {
    throw new Error("Escolha uma alternativa em cada grupo de opções.");
  }
  const canonical: Record<string, string> = {};
  let addedPriceCents = 0;
  const labels: string[] = [];
  for (const group of groups) {
    const option = group.selectionMode === "personalizationLength"
      ? optionForPersonalizationLength(group, personalizationText)
      : group.options.find((item) => item.id === selected[group.id] && item.active) ?? null;
    if (group.selectionMode === "personalizationLength" && !option) {
      throw new Error(`Digite um nome cuja quantidade de letras corresponda a uma faixa disponível em ${group.name}.`);
    }
    if (!option) throw new Error(`Escolha uma opção disponível em ${group.name}.`);
    canonical[group.id] = option.id;
    addedPriceCents += option.addedPriceCents;
    labels.push(`${group.name}: ${option.label}`);
  }
  return { variantId: JSON.stringify(canonical), variantLabel: labels.join(" • "), addedPriceCents, selections: canonical };
}

function validatePersonalizationRange(groups: ProductOptionGroup[], selections: Record<string, string>, value: string) {
  for (const group of groups) {
    if (!/letras?|caracteres?/i.test(group.name)) continue;
    const option = group.options.find((item) => item.id === selections[group.id] && item.active);
    const range = option?.label.match(/(\d+)\s*(?:-|–|—|a|até)\s*(\d+)/i);
    if (!range || !option) continue;
    const minimum = Number(range[1]);
    const maximum = Number(range[2]);
    const letterCount = personalizationLetterCount(value);
    if (letterCount < minimum || letterCount > maximum) {
      throw new Error(`A opção “${option.label}” aceita de ${minimum} a ${maximum} letras.`);
    }
  }
}

type CatalogData = {
  costCents?: number;
  sku?: string;
  barcode?: string;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  mpn?: string;
  ageGroup?: string;
  gender?: string;
  tags?: string;
  brand?: string;
  seoTitle?: string;
  seoDescription?: string;
};

function parseObject(value: unknown): CatalogData {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseVariants(value: unknown): ProductVariant[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function variantLabel(variant: ProductVariant) {
  return [variant.size, variant.color, variant.material].filter(Boolean).join(" • ") || variant.sku || "Variação";
}

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

async function ensureStoreSchemaInternal() {
  const d1 = getD1();
  // Production migrations are applied before deployment. Once the latest
  // migration is recorded, avoid running schema inspection and DDL on requests.
  try {
    const latestMigration = await d1.prepare("SELECT 1 AS ready FROM d1_migrations WHERE name = ? LIMIT 1")
      .bind("0023_launch_waitlist.sql")
      .first<{ ready: number }>();
    if (latestMigration) return;
  } catch {
    // Keep the compatibility bootstrap for local databases without migration history.
  }
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, parent_id TEXT, image TEXT, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON categories(active, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, material TEXT NOT NULL, image TEXT NOT NULL, video TEXT, media TEXT NOT NULL DEFAULT '[]', catalog_data TEXT NOT NULL DEFAULT '{}', variants TEXT NOT NULL DEFAULT '[]', multi_options_enabled INTEGER NOT NULL DEFAULT 0, option_groups TEXT NOT NULL DEFAULT '[]', visibility TEXT NOT NULL DEFAULT 'visible', track_stock INTEGER NOT NULL DEFAULT 1, price_visible INTEGER NOT NULL DEFAULT 1, free_shipping INTEGER NOT NULL DEFAULT 0, pix_discount_enabled INTEGER NOT NULL DEFAULT 0, pix_discount_percent INTEGER NOT NULL DEFAULT 0, personalization_enabled INTEGER NOT NULL DEFAULT 0, personalization_max_chars INTEGER NOT NULL DEFAULT 20, badge TEXT, price_cents INTEGER NOT NULL, compare_at_cents INTEGER, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, active)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_products_storefront_sort ON products(active, visibility, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS product_categories (product_id TEXT NOT NULL, category_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(product_id, category_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_product_categories_category_product ON product_categories(category_id, product_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS homepage_banners (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', image TEXT NOT NULL, link_url TEXT, link_label TEXT, focal_x INTEGER NOT NULL DEFAULT 50, focal_y INTEGER NOT NULL DEFAULT 24, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_homepage_banners_active_sort ON homepage_banners(active, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS homepage_reviews (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL DEFAULT 5, body TEXT NOT NULL, product_name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_homepage_reviews_active_sort ON homepage_reviews(active, sort_order)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS favorites (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_favorites_visitor_id ON favorites(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS cart_items (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '', personalization_text TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id, variant_id, personalization_text))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_cart_items_visitor_id ON cart_items(visitor_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, customer_id TEXT, customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, cpf TEXT NOT NULL, cep TEXT NOT NULL, address TEXT NOT NULL, address_number TEXT NOT NULL, neighborhood TEXT NOT NULL DEFAULT '', complement TEXT, city TEXT NOT NULL, state TEXT NOT NULL, city_ibge_code TEXT, shipping_method TEXT NOT NULL, payment_method TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, pix_discount_cents INTEGER NOT NULL DEFAULT 0, coupon_code TEXT, coupon_discount_cents INTEGER NOT NULL DEFAULT 0, shipping_discount_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'aguardando_pagamento', stock_committed INTEGER NOT NULL DEFAULT 0, payment_provider TEXT, payment_preference_id TEXT, payment_id TEXT, payment_status TEXT, payment_checkout_url TEXT, payment_updated_at TEXT, marketing_consent INTEGER NOT NULL DEFAULT 0, meta_purchase_sent_at TEXT, superfrete_service_id TEXT, superfrete_service_name TEXT, superfrete_delivery_days INTEGER, superfrete_quote_price_cents INTEGER, superfrete_order_id TEXT, superfrete_protocol TEXT, superfrete_price_cents INTEGER, superfrete_status TEXT, superfrete_tracking_code TEXT, superfrete_label_url TEXT, superfrete_updated_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_visitor_id_created_at ON orders(visitor_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT, variant_label TEXT, personalization_text TEXT NOT NULL DEFAULT '', product_name TEXT NOT NULL, unit_price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS launch_waitlist (id TEXT PRIMARY KEY, email TEXT NOT NULL, consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmation_sent_at TEXT, notified_at TEXT, notify_claimed_at INTEGER, notify_attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, unsubscribed_at TEXT)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_launch_waitlist_email ON launch_waitlist(email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_launch_waitlist_pending ON launch_waitlist(notified_at, unsubscribed_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_login_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_challenges_user_expires ON admin_login_challenges(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_expires ON admin_sessions(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS customer_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified_at TEXT, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users(email)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS customer_email_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_customer_challenges_user_kind_expires ON customer_email_challenges(user_id, kind, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS customer_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_customer_sessions_user_expires ON customer_sessions(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_passkeys (credential_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, webauthn_user_id TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]', label TEXT NOT NULL DEFAULT 'Face ID', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at TEXT)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_passkeys_user_created ON admin_passkeys(user_id, created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_passkey_challenges (id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, challenge TEXT NOT NULL, webauthn_user_id TEXT, origin TEXT NOT NULL, rp_id TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_passkey_challenges_user_expires ON admin_passkey_challenges(user_id, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS media_assets (key TEXT PRIMARY KEY, content_type TEXT NOT NULL, size INTEGER NOT NULL, original_name TEXT NOT NULL, uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS request_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 1, expires_at INTEGER NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expires_at ON request_rate_limits(expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS payment_webhook_events (event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order ON payment_webhook_events(order_id, created_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS order_notification_events (order_id TEXT NOT NULL, event_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, last_error TEXT, locked_at TEXT, sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(order_id, event_type))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_order_notification_events_pending ON order_notification_events(status, sent_at, updated_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS coupons (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', discount_type TEXT NOT NULL DEFAULT 'none', discount_value INTEGER NOT NULL DEFAULT 0, free_shipping INTEGER NOT NULL DEFAULT 0, applies_to TEXT NOT NULL DEFAULT 'all', minimum_subtotal_cents INTEGER NOT NULL DEFAULT 0, maximum_discount_cents INTEGER, usage_limit INTEGER, usage_count INTEGER NOT NULL DEFAULT 0, starts_at TEXT, expires_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_coupons_active_dates ON coupons(active, starts_at, expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS coupon_products (coupon_id TEXT NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY(coupon_id, product_id))"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_coupon_products_product ON coupon_products(product_id, coupon_id)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS coupon_redemptions (coupon_id TEXT NOT NULL, order_id TEXT NOT NULL, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(coupon_id, order_id))"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions(order_id)"),
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
  const existingProductColumns = new Set(productColumns.results.map((column) => column.name));
  const missingProductColumns = [
    ["featured", "ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0"],
    ["video", "ALTER TABLE products ADD COLUMN video TEXT"],
    ["media", "ALTER TABLE products ADD COLUMN media TEXT NOT NULL DEFAULT '[]'"],
    ["catalog_data", "ALTER TABLE products ADD COLUMN catalog_data TEXT NOT NULL DEFAULT '{}'"],
    ["variants", "ALTER TABLE products ADD COLUMN variants TEXT NOT NULL DEFAULT '[]'"],
    ["multi_options_enabled", "ALTER TABLE products ADD COLUMN multi_options_enabled INTEGER NOT NULL DEFAULT 0"],
    ["option_groups", "ALTER TABLE products ADD COLUMN option_groups TEXT NOT NULL DEFAULT '[]'"],
    ["visibility", "ALTER TABLE products ADD COLUMN visibility TEXT NOT NULL DEFAULT 'visible'"],
    ["track_stock", "ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 1"],
    ["price_visible", "ALTER TABLE products ADD COLUMN price_visible INTEGER NOT NULL DEFAULT 1"],
    ["free_shipping", "ALTER TABLE products ADD COLUMN free_shipping INTEGER NOT NULL DEFAULT 0"],
    ["personalization_enabled", "ALTER TABLE products ADD COLUMN personalization_enabled INTEGER NOT NULL DEFAULT 0"],
    ["personalization_max_chars", "ALTER TABLE products ADD COLUMN personalization_max_chars INTEGER NOT NULL DEFAULT 20"],
    ["pix_discount_enabled", "ALTER TABLE products ADD COLUMN pix_discount_enabled INTEGER NOT NULL DEFAULT 0"],
    ["pix_discount_percent", "ALTER TABLE products ADD COLUMN pix_discount_percent INTEGER NOT NULL DEFAULT 0"],
  ] as const;
  for (const [column, statement] of missingProductColumns) {
    if (!existingProductColumns.has(column)) await d1.prepare(statement).run();
  }
  await d1.prepare("UPDATE products SET description = replace(replace(replace(replace(description, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano'), material = replace(replace(replace(replace(material, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano'), catalog_data = replace(replace(replace(replace(catalog_data, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano')").run();

  const cartColumns = await d1.prepare("PRAGMA table_info(cart_items)").all<{ name: string }>();
  if (!cartColumns.results.some((column) => column.name === "variant_id")) {
    await d1.batch([
      d1.prepare("CREATE TABLE cart_items_new (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id, variant_id))"),
      d1.prepare("INSERT INTO cart_items_new (visitor_id, product_id, variant_id, quantity, updated_at) SELECT visitor_id, product_id, '', quantity, updated_at FROM cart_items"),
      d1.prepare("DROP TABLE cart_items"),
      d1.prepare("ALTER TABLE cart_items_new RENAME TO cart_items"),
      d1.prepare("CREATE INDEX idx_cart_items_visitor_id ON cart_items(visitor_id)"),
    ]);
  }
  const currentCartColumns = await d1.prepare("PRAGMA table_info(cart_items)").all<{ name: string; pk: number }>();
  const personalizationColumn = currentCartColumns.results.find((column) => column.name === "personalization_text");
  if (!personalizationColumn || !Number(personalizationColumn.pk)) {
    const hasPersonalizationText = Boolean(personalizationColumn);
    await d1.batch([
      d1.prepare("DROP TABLE IF EXISTS cart_items_personalization_new"),
      d1.prepare("CREATE TABLE cart_items_personalization_new (visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '', personalization_text TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(visitor_id, product_id, variant_id, personalization_text))"),
      d1.prepare(`INSERT INTO cart_items_personalization_new (visitor_id, product_id, variant_id, personalization_text, quantity, updated_at) SELECT visitor_id, product_id, variant_id, ${hasPersonalizationText ? "personalization_text" : "''"}, quantity, updated_at FROM cart_items`),
      d1.prepare("DROP TABLE cart_items"),
      d1.prepare("ALTER TABLE cart_items_personalization_new RENAME TO cart_items"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_cart_items_visitor_id ON cart_items(visitor_id)"),
    ]);
  }

  const orderItemColumns = await d1.prepare("PRAGMA table_info(order_items)").all<{ name: string }>();
  const existingOrderItemColumns = new Set(orderItemColumns.results.map((column) => column.name));
  if (!existingOrderItemColumns.has("variant_id")) await d1.prepare("ALTER TABLE order_items ADD COLUMN variant_id TEXT").run();
  if (!existingOrderItemColumns.has("variant_label")) await d1.prepare("ALTER TABLE order_items ADD COLUMN variant_label TEXT").run();
  if (!existingOrderItemColumns.has("personalization_text")) await d1.prepare("ALTER TABLE order_items ADD COLUMN personalization_text TEXT NOT NULL DEFAULT ''").run();

  const orderColumns = await d1.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const existingOrderColumns = new Set(orderColumns.results.map((column) => column.name));
  const missingOrderColumns = [
    ["customer_id", "ALTER TABLE orders ADD COLUMN customer_id TEXT"],
    ["neighborhood", "ALTER TABLE orders ADD COLUMN neighborhood TEXT NOT NULL DEFAULT ''"],
    ["stock_committed", "ALTER TABLE orders ADD COLUMN stock_committed INTEGER NOT NULL DEFAULT 0"],
    ["payment_provider", "ALTER TABLE orders ADD COLUMN payment_provider TEXT"],
    ["payment_preference_id", "ALTER TABLE orders ADD COLUMN payment_preference_id TEXT"],
    ["payment_id", "ALTER TABLE orders ADD COLUMN payment_id TEXT"],
    ["payment_status", "ALTER TABLE orders ADD COLUMN payment_status TEXT"],
    ["payment_checkout_url", "ALTER TABLE orders ADD COLUMN payment_checkout_url TEXT"],
    ["payment_updated_at", "ALTER TABLE orders ADD COLUMN payment_updated_at TEXT"],
    ["marketing_consent", "ALTER TABLE orders ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0"],
    ["meta_purchase_sent_at", "ALTER TABLE orders ADD COLUMN meta_purchase_sent_at TEXT"],
    ["coupon_code", "ALTER TABLE orders ADD COLUMN coupon_code TEXT"],
    ["pix_discount_cents", "ALTER TABLE orders ADD COLUMN pix_discount_cents INTEGER NOT NULL DEFAULT 0"],
    ["coupon_discount_cents", "ALTER TABLE orders ADD COLUMN coupon_discount_cents INTEGER NOT NULL DEFAULT 0"],
    ["shipping_discount_cents", "ALTER TABLE orders ADD COLUMN shipping_discount_cents INTEGER NOT NULL DEFAULT 0"],
    ["stock_issue", "ALTER TABLE orders ADD COLUMN stock_issue INTEGER NOT NULL DEFAULT 0"],
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
  const couponColumns = await d1.prepare("PRAGMA table_info(coupons)").all<{ name: string }>();
  if (!couponColumns.results.some((column) => column.name === "per_customer_limit")) await d1.prepare("ALTER TABLE coupons ADD COLUMN per_customer_limit INTEGER").run();
  const redemptionColumns = await d1.prepare("PRAGMA table_info(coupon_redemptions)").all<{ name: string }>();
  if (!redemptionColumns.results.some((column) => column.name === "customer_id")) await d1.prepare("ALTER TABLE coupon_redemptions ADD COLUMN customer_id TEXT").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions(coupon_id, customer_id)").run();
  await d1.batch([
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_orders_customer_id_created_at ON orders(customer_id, created_at)"),
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

let storeSchemaPromise: Promise<void> | null = null;

export function ensureStoreSchema() {
  if (!storeSchemaPromise) {
    storeSchemaPromise = ensureStoreSchemaInternal().catch((error) => {
      storeSchemaPromise = null;
      throw error;
    });
  }
  return storeSchemaPromise;
}

function normalizeProduct(row: D1ResultRow, includeCatalogData = false) {
  let media: Array<{ type: "image" | "video"; url: string }> = [];
  try { media = JSON.parse(String(row.media ?? "[]")); } catch { media = []; }
  if (!media.length && row.image) media = [{ type: "image", url: String(row.image) }];
  if (row.video && !media.some((item) => item.url === String(row.video))) media.push({ type: "video", url: String(row.video) });
  const priceVisible = Boolean(Number(row.price_visible ?? 1));
  const variants = parseVariants(row.variants).map((variant) => (priceVisible ? variant : { ...variant, priceCents: 0 }));
  const trackStock = Boolean(Number(row.track_stock ?? 1));
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description),
    material: String(row.material),
    image: String(row.image),
    video: row.video ? String(row.video) : "",
    media,
    ...(includeCatalogData ? { catalogData: parseObject(row.catalog_data) } : {}),
    variants,
    multiOptionsEnabled: Boolean(Number(row.multi_options_enabled ?? 0)),
    optionGroups: parseOptionGroups(row.option_groups),
    visibility: String(row.visibility ?? "visible"),
    trackStock,
    priceVisible,
    freeShipping: Boolean(Number(row.free_shipping ?? 0)),
    pixDiscountEnabled: Boolean(Number(row.pix_discount_enabled ?? 0)),
    pixDiscountPercent: Number(row.pix_discount_percent ?? 0),
    personalizationEnabled: Boolean(Number(row.personalization_enabled ?? 0)),
    personalizationMaxChars: Number(row.personalization_max_chars ?? 20),
    badge: row.badge ? String(row.badge) : null,
    // Produto "sob consulta" não expõe preço na API.
    priceCents: priceVisible ? Number(row.price_cents) : 0,
    compareAtCents: !priceVisible || row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    stock: trackStock ? Number(row.stock) : 999_999,
    featured: Boolean(Number(row.featured)),
  };
}

export async function readStore(visitorId: string, requestedSlug = "") {
  const d1 = getD1();
  const normalizedSlug = requestedSlug.trim().slice(0, 160);
  const productsStatement = normalizedSlug
    ? d1.prepare("SELECT id, slug, name, category, description, material, image, video, media, catalog_data, variants, multi_options_enabled, option_groups, visibility, track_stock, price_visible, free_shipping, pix_discount_enabled, pix_discount_percent, personalization_enabled, personalization_max_chars, badge, price_cents, compare_at_cents, stock, featured FROM products WHERE active = 1 AND (visibility = 'visible' OR (visibility = 'unlisted' AND slug = ?)) ORDER BY sort_order, created_at, id").bind(normalizedSlug)
    : d1.prepare("SELECT id, slug, name, category, description, material, image, video, media, catalog_data, variants, multi_options_enabled, option_groups, visibility, track_stock, price_visible, free_shipping, pix_discount_enabled, pix_discount_percent, personalization_enabled, personalization_max_chars, badge, price_cents, compare_at_cents, stock, featured FROM products WHERE active = 1 AND visibility = 'visible' ORDER BY sort_order, created_at, id");
  const [productsResult, categoriesResult, productCategoriesResult, bannersResult, reviewsResult, favoriteResult, cartResult, allCategoryImageResult] = await Promise.all([
    productsStatement.all(),
    // Mesmas regras de /api/catalog: a categoria Black Friday não pode aparecer e sumir ao recarregar a sacola.
    d1.prepare("SELECT c.id, c.name, c.slug, c.parent_id, c.image FROM categories c WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT pc.product_id, pc.category_id FROM product_categories pc INNER JOIN categories c ON c.id = pc.category_id WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT id, title, subtitle, image, link_url, link_label, focal_x, focal_y FROM homepage_banners WHERE active = 1 ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT id, customer_name, location, rating, body, product_name FROM homepage_reviews WHERE active = 1 ORDER BY sort_order, created_at, id LIMIT 4").all(),
    d1.prepare("SELECT product_id FROM favorites WHERE visitor_id = ? ORDER BY created_at DESC").bind(visitorId).all(),
    d1.prepare("SELECT p.id, p.slug, p.name, p.category, p.description, p.material, p.image, p.video, p.media, p.catalog_data, p.variants, p.multi_options_enabled, p.option_groups, p.visibility, p.track_stock, p.price_visible, p.free_shipping, p.pix_discount_enabled, p.pix_discount_percent, p.personalization_enabled, p.personalization_max_chars, p.badge, p.price_cents, p.compare_at_cents, p.stock, p.featured, c.variant_id, c.personalization_text, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1 ORDER BY c.updated_at DESC").bind(visitorId).all(),
    d1.prepare("SELECT value FROM site_settings WHERE key = 'all_category_image'").first<{ value: string }>(),
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
      focalX: Number(row.focal_x ?? 50),
      focalY: Number(row.focal_y ?? 24),
    })),
    reviews: (reviewsResult.results as D1ResultRow[]).map((row) => ({
      id: String(row.id),
      customerName: String(row.customer_name),
      location: String(row.location ?? ""),
      rating: Math.max(0, Math.min(5, Number(row.rating))),
      body: String(row.body),
      productName: String(row.product_name ?? ""),
    })),
    favoriteIds: (favoriteResult.results as D1ResultRow[]).map((row) => String(row.product_id)),
    cart: (cartResult.results as D1ResultRow[]).map((row) => {
      const product = normalizeProduct(row, true);
      const variantId = String(row.variant_id ?? "");
      const variant = product.variants.find((item) => item.id === variantId);
      let multiOption: ReturnType<typeof resolveMultiOptionSelection> | null = null;
      if (product.multiOptionsEnabled) {
        try { multiOption = resolveMultiOptionSelection(variantId, product.optionGroups, String(row.personalization_text ?? "")); } catch { /* Keep stale cart entries removable after product options change. */ }
      }
      return {
        ...product,
        priceCents: multiOption ? product.priceCents + multiOption.addedPriceCents : variant?.priceCents || product.priceCents,
        stock: product.trackStock ? (variant ? variant.stock : product.stock) : 999_999,
        categoryIds: categoryIdsByProduct.get(String(row.id)) ?? [],
        variantId,
        variantLabel: multiOption?.variantLabel ?? (product.multiOptionsEnabled || (variantId && !variant) ? "Opções desatualizadas — remova e escolha novamente" : variant ? variantLabel(variant) : ""),
        personalizationText: String(row.personalization_text ?? ""),
        quantity: Number(row.quantity),
      };
    }),
    allCategoryImage: allCategoryImageResult?.value ? String(allCategoryImageResult.value) : null,
  };
}

export async function readStoreVisitorState(visitorId: string) {
  const d1 = getD1();
  const [favoriteResult, cartResult] = await Promise.all([
    d1.prepare("SELECT product_id FROM favorites WHERE visitor_id = ? ORDER BY created_at DESC").bind(visitorId).all(),
    d1.prepare("SELECT p.id, p.slug, p.name, p.category, p.description, p.material, p.image, p.video, p.media, p.catalog_data, p.variants, p.multi_options_enabled, p.option_groups, p.visibility, p.track_stock, p.price_visible, p.free_shipping, p.pix_discount_enabled, p.pix_discount_percent, p.personalization_enabled, p.personalization_max_chars, p.badge, p.price_cents, p.compare_at_cents, p.stock, p.featured, c.variant_id, c.personalization_text, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1 ORDER BY c.updated_at DESC").bind(visitorId).all(),
  ]);

  return {
    favoriteIds: (favoriteResult.results as D1ResultRow[]).map((row) => String(row.product_id)),
    cart: (cartResult.results as D1ResultRow[]).map((row) => {
      const product = normalizeProduct(row);
      const variantId = String(row.variant_id ?? "");
      const variant = product.variants.find((item) => item.id === variantId);
      let multiOption: ReturnType<typeof resolveMultiOptionSelection> | null = null;
      if (product.multiOptionsEnabled) {
        try { multiOption = resolveMultiOptionSelection(variantId, product.optionGroups, String(row.personalization_text ?? "")); } catch { /* Keep stale cart entries removable after product options change. */ }
      }
      return {
        ...product,
        priceCents: multiOption ? product.priceCents + multiOption.addedPriceCents : variant?.priceCents || product.priceCents,
        stock: product.trackStock ? (variant ? variant.stock : product.stock) : 999_999,
        categoryIds: [],
        variantId,
        variantLabel: multiOption?.variantLabel ?? (product.multiOptionsEnabled || (variantId && !variant) ? "Opções desatualizadas — remova e escolha novamente" : variant ? variantLabel(variant) : ""),
        personalizationText: String(row.personalization_text ?? ""),
        quantity: Number(row.quantity),
      };
    }),
  };
}

export async function readPublicCatalog() {
  const d1 = getD1();
  const [productsResult, categoriesResult, productCategoriesResult, bannersResult, reviewsResult, allCategoryImageResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, video, media, variants, multi_options_enabled, option_groups, visibility, track_stock, price_visible, free_shipping, pix_discount_enabled, pix_discount_percent, personalization_enabled, personalization_max_chars, badge, price_cents, compare_at_cents, stock, featured FROM products WHERE active = 1 AND visibility = 'visible' ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT c.id, c.name, c.slug, c.parent_id, c.image FROM categories c WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT pc.product_id, pc.category_id FROM product_categories pc INNER JOIN categories c ON c.id = pc.category_id WHERE c.active = 1 AND (c.parent_id IS NULL OR EXISTS (SELECT 1 FROM categories parent WHERE parent.id = c.parent_id AND parent.active = 1)) ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT id, title, subtitle, image, link_url, link_label, focal_x, focal_y FROM homepage_banners WHERE active = 1 ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT id, customer_name, location, rating, body, product_name FROM homepage_reviews WHERE active = 1 ORDER BY sort_order, created_at, id LIMIT 4").all(),
    d1.prepare("SELECT value FROM site_settings WHERE key = 'all_category_image'").first<{ value: string }>(),
  ]);
  const categoryIdsByProduct = new Map<string, string[]>();
  for (const row of productCategoriesResult.results as D1ResultRow[]) {
    const productId = String(row.product_id);
    categoryIdsByProduct.set(productId, [...(categoryIdsByProduct.get(productId) ?? []), String(row.category_id)]);
  }
  return {
    products: (productsResult.results as D1ResultRow[]).map((row) => ({ ...normalizeProduct(row), categoryIds: categoryIdsByProduct.get(String(row.id)) ?? [] })),
    categories: (categoriesResult.results as D1ResultRow[]).map((row) => ({ id: String(row.id), name: String(row.name), slug: String(row.slug), parentId: row.parent_id ? String(row.parent_id) : null, image: row.image ? String(row.image) : null })),
    banners: (bannersResult.results as D1ResultRow[]).map((row) => ({ id: String(row.id), title: String(row.title), subtitle: String(row.subtitle), image: String(row.image), linkUrl: row.link_url ? String(row.link_url) : null, linkLabel: row.link_label ? String(row.link_label) : null, focalX: Number(row.focal_x ?? 50), focalY: Number(row.focal_y ?? 24) })),
    reviews: (reviewsResult.results as D1ResultRow[]).map((row) => ({ id: String(row.id), customerName: String(row.customer_name), location: String(row.location ?? ""), rating: Math.max(0, Math.min(5, Number(row.rating))), body: String(row.body), productName: String(row.product_name ?? "") })),
    favoriteIds: [] as string[],
    cart: [] as never[],
    allCategoryImage: allCategoryImageResult?.value ? String(allCategoryImageResult.value) : null,
  };
}

export function publicStore(store: Awaited<ReturnType<typeof readStore>>) {
  const publicProduct = <T extends { catalogData?: unknown }>(product: T) => {
    const { catalogData: _internalCatalogData, ...safeProduct } = product;
    void _internalCatalogData;
    return safeProduct;
  };
  return {
    ...store,
    products: store.products.map(publicProduct),
    cart: store.cart.map(publicProduct),
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

export async function updateCart(visitorId: string, productId: string, quantity: number, variantId = "", personalizationText = "", previousPersonalizationText?: string) {
  const d1 = getD1();
  const product = await d1.prepare("SELECT stock, variants, multi_options_enabled, option_groups, track_stock, price_visible, personalization_enabled, personalization_max_chars FROM products WHERE id = ? AND active = 1 AND visibility != 'hidden'").bind(productId).first<{ stock: number; variants: string; multi_options_enabled: number; option_groups: string; track_stock: number; price_visible: number; personalization_enabled: number; personalization_max_chars: number }>();
  if (!product) throw new Error("Produto não encontrado.");
  if (!Number(product.price_visible)) throw new Error("Este produto está disponível somente sob consulta.");
  const multiOptionsEnabled = Boolean(Number(product.multi_options_enabled));
  const safePersonalizationText = personalizationText.trim();
  const safePreviousPersonalizationText = previousPersonalizationText?.trim();
  if (safePersonalizationText.length > 80) throw new Error("O nome para gravação pode ter até 80 caracteres.");
  if (quantity > 0) assertPersonalizationCharacters(safePersonalizationText);
  if (!Number(product.personalization_enabled) && safePersonalizationText) throw new Error("Este produto não aceita personalização.");
  if (multiOptionsEnabled && Number(product.personalization_enabled) && quantity > 0 && !safePersonalizationText) throw new Error("Informe o nome para personalizar esta peça.");
  if (safePersonalizationText.length > Number(product.personalization_max_chars ?? 20)) throw new Error(`A gravação permite até ${Number(product.personalization_max_chars ?? 20)} caracteres.`);
  if (safePreviousPersonalizationText && safePreviousPersonalizationText.length > Number(product.personalization_max_chars ?? 20)) throw new Error("O nome de gravação anterior não é válido.");
  const rawVariantId = variantId.trim();
  if (rawVariantId.length > 1_000) throw new Error("As opções selecionadas são inválidas.");
  const variants = parseVariants(product.variants);
  const optionGroups = parseOptionGroups(product.option_groups);
  let resolvedOptions: ReturnType<typeof resolveMultiOptionSelection> | null = null;
  if (multiOptionsEnabled && rawVariantId) {
    try { resolvedOptions = resolveMultiOptionSelection(rawVariantId, optionGroups, safePersonalizationText); }
    catch (error) { if (quantity > 0) throw error; }
  }
  if (multiOptionsEnabled && quantity > 0 && !resolvedOptions) throw new Error("Escolha uma alternativa em cada grupo de opções.");
  if (resolvedOptions && Number(product.personalization_enabled)) validatePersonalizationRange(optionGroups, resolvedOptions.selections, safePersonalizationText);
  const selectedVariant = variantId ? variants.find((item) => item.id === variantId && item.active) : null;
  if (!multiOptionsEnabled && quantity > 0 && variants.some((item) => item.active) && !selectedVariant) throw new Error("Escolha uma opção do produto antes de adicionar.");
  if (!multiOptionsEnabled && quantity > 0 && variantId && !selectedVariant) throw new Error("As opções deste produto mudaram. Remova o item da sacola e escolha novamente.");
  const availableStock = Number(product.track_stock) ? Number(selectedVariant?.stock ?? product.stock) : 99;
  const requestedQuantity = Math.max(0, Math.min(Math.trunc(quantity), 99));
  if (requestedQuantity > availableStock) throw new Error("Não temos essa quantidade disponível no momento.");
  const safeQuantity = requestedQuantity;
  const normalizedVariantId = resolvedOptions?.variantId ?? (multiOptionsEnabled ? rawVariantId : selectedVariant?.id ?? rawVariantId.slice(0, 100));
  if (safeQuantity === 0) {
    await d1.prepare("DELETE FROM cart_items WHERE visitor_id = ? AND product_id = ? AND variant_id = ? AND personalization_text = ?").bind(visitorId, productId, normalizedVariantId, safePersonalizationText).run();
  } else if (safePreviousPersonalizationText !== undefined && safePreviousPersonalizationText !== safePersonalizationText) {
    const existingTarget = await d1.prepare("SELECT quantity FROM cart_items WHERE visitor_id = ? AND product_id = ? AND variant_id = ? AND personalization_text = ?")
      .bind(visitorId, productId, normalizedVariantId, safePersonalizationText)
      .first<{ quantity: number }>();
    if (Number(existingTarget?.quantity ?? 0) + safeQuantity > availableStock) throw new Error("Não temos essa quantidade disponível no momento.");
    await d1.batch([
      d1.prepare("DELETE FROM cart_items WHERE visitor_id = ? AND product_id = ? AND variant_id = ? AND personalization_text = ?").bind(visitorId, productId, normalizedVariantId, safePreviousPersonalizationText),
      d1.prepare("INSERT INTO cart_items (visitor_id, product_id, variant_id, personalization_text, quantity, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(visitor_id, product_id, variant_id, personalization_text) DO UPDATE SET quantity = cart_items.quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP").bind(visitorId, productId, normalizedVariantId, safePersonalizationText, safeQuantity),
    ]);
  } else {
    await d1.prepare("INSERT INTO cart_items (visitor_id, product_id, variant_id, personalization_text, quantity, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(visitor_id, product_id, variant_id, personalization_text) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP").bind(visitorId, productId, normalizedVariantId, safePersonalizationText, safeQuantity).run();
  }
  return readStore(visitorId);
}

export async function subscribe(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Informe um e-mail válido.");
  await getD1().prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").bind(normalized).run();
}

export function packageForCart(items: Array<{ quantity: number; catalogData?: CatalogData }>) {
  return shippingPackageFromItems(items);
}

export function cartHasFreeShipping(items: Array<{ freeShipping?: boolean }>) {
  return items.length > 0 && items.every((item) => item.freeShipping);
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
  marketingConsent?: boolean;
};

type CheckoutCartItem = {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  quantity: number;
  variantId: string;
  variantLabel: string;
  catalogData: CatalogData;
  freeShipping: boolean;
  pixDiscountEnabled: boolean;
  pixDiscountPercent: number;
  personalizationText: string;
};

async function checkoutCartItems(visitorId: string): Promise<CheckoutCartItem[]> {
  const cartResult = await getD1().prepare("SELECT p.id, p.name, p.price_cents, p.stock, p.variants, p.multi_options_enabled, p.option_groups, p.track_stock, p.catalog_data, p.free_shipping, p.pix_discount_enabled, p.pix_discount_percent, p.price_visible, p.personalization_enabled, p.personalization_max_chars, c.variant_id, c.personalization_text, c.quantity FROM cart_items c INNER JOIN products p ON p.id = c.product_id WHERE c.visitor_id = ? AND p.active = 1").bind(visitorId).all();
  const items = (cartResult.results as D1ResultRow[]).map((row) => {
    const variants = parseVariants(row.variants);
    if (!Number(row.price_visible)) throw new Error(`${String(row.name)} agora está disponível somente sob consulta.`);
    const variantId = String(row.variant_id ?? "");
    const personalizationText = String(row.personalization_text ?? "").trim();
    const personalizationEnabled = Boolean(Number(row.personalization_enabled ?? 0));
    assertPersonalizationCharacters(personalizationText);
    if (personalizationText && !personalizationEnabled) throw new Error(`${String(row.name)} não aceita mais personalização. Remova e adicione o produto novamente.`);
    if (Number(row.multi_options_enabled) && personalizationEnabled && !personalizationText) throw new Error(`Informe o nome para personalizar ${String(row.name)}.`);
    if (personalizationText.length > Number(row.personalization_max_chars ?? 20)) throw new Error(`A gravação de ${String(row.name)} ultrapassa o limite permitido.`);
    const variant = variantId ? variants.find((item) => item.id === variantId && item.active) : null;
    if (!Number(row.multi_options_enabled) && variantId && !variant) throw new Error(`As opções de ${String(row.name)} mudaram. Remova e adicione novamente.`);
    const optionGroups = parseOptionGroups(row.option_groups);
    const multiOption = Number(row.multi_options_enabled) ? resolveMultiOptionSelection(variantId, optionGroups, personalizationText) : null;
    if (multiOption && personalizationEnabled) validatePersonalizationRange(optionGroups, multiOption.selections, personalizationText);
    if (!multiOption && variants.some((item) => item.active) && !variant) throw new Error(`A opção escolhida para ${String(row.name)} não está mais disponível.`);
    return {
      id: String(row.id),
      name: String(row.name),
      priceCents: Number(row.price_cents) + (multiOption?.addedPriceCents ?? 0),
      stock: Number(row.track_stock) ? Number(variant?.stock ?? row.stock) : 99,
      quantity: Number(row.quantity),
      variantId,
      variantLabel: multiOption?.variantLabel ?? (variant ? variantLabel(variant) : ""),
      personalizationText,
      catalogData: parseObject(row.catalog_data),
      freeShipping: Boolean(Number(row.free_shipping ?? 0)),
      pixDiscountEnabled: Boolean(Number(row.pix_discount_enabled ?? 0)),
      pixDiscountPercent: Number(row.pix_discount_percent ?? 0),
    };
  });
  if (!items.length) throw new Error("Seu carrinho está vazio.");
  // Soma linhas do mesmo produto/variação (ex.: gravações diferentes) antes de comparar com o estoque.
  const totals = new Map<string, { quantity: number; stock: number; name: string }>();
  for (const [index, item] of items.entries()) {
    const row = cartResult.results[index] as D1ResultRow;
    const usesVariantStock = Number(row.track_stock) && !Number(row.multi_options_enabled) && item.variantId;
    const keys = [`p:${item.id}`, ...(usesVariantStock ? [`v:${item.id}:${item.variantId}`] : [])];
    for (const key of keys) {
      const stock = key.startsWith("p:") ? (Number(row.track_stock) ? Number(row.stock) : Number.MAX_SAFE_INTEGER) : item.stock;
      const current = totals.get(key) ?? { quantity: 0, stock, name: item.name };
      current.quantity += item.quantity;
      totals.set(key, current);
    }
  }
  for (const total of totals.values()) {
    if (total.quantity > total.stock) throw new Error(`Estoque insuficiente para ${total.name}.`);
  }
  return items;
}

export const FREE_SHIPPING_THRESHOLD_CENTS = 39900;

async function checkoutPricing(visitorId: string, cep: string, shippingMethod: string, couponCode: unknown, paymentMethod: "pix" | "credit_card", customerId: string | null = null) {
  const cartItems = await checkoutCartItems(visitorId);
  const items = cartItems.map((item) => {
    if (paymentMethod !== "pix" || !item.pixDiscountEnabled || item.pixDiscountPercent < 1) return item;
    return { ...item, priceCents: Math.round(item.priceCents * (100 - item.pixDiscountPercent) / 100) };
  });
  const pixDiscountCents = paymentMethod === "pix"
    ? items.reduce((sum, item, index) => sum + (cartItems[index].priceCents - item.priceCents) * item.quantity, 0)
    : 0;
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const shippingPackage = packageForCart(items);
  const shippingOptions = await calculateSuperFrete(cep, subtotalCents, shippingPackage);
  const selectedShipping = shippingOptions.find((option) => option.id === shippingMethod);
  if (!selectedShipping) throw new Error("A modalidade de entrega selecionada não está mais disponível.");
  // O frete grátis considera o valor antes do desconto Pix, para o Pix nunca sair mais caro que o cartão.
  const subtotalBeforePixCents = cartItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const baseShippingCents = subtotalBeforePixCents >= FREE_SHIPPING_THRESHOLD_CENTS || cartHasFreeShipping(items) ? 0 : selectedShipping.priceCents;
  const coupon = await applyCoupon(getD1(), couponCode, items, baseShippingCents, customerId);
  const shippingCents = Math.max(0, baseShippingCents - (coupon?.shippingDiscountCents ?? 0));
  const couponDiscountCents = coupon?.productDiscountCents ?? 0;
  const totalCents = subtotalCents - couponDiscountCents + shippingCents;
  if (totalCents < 1) throw new Error("O total do pedido precisa ser maior que zero.");
  return { items, subtotalCents, selectedShipping, baseShippingCents, shippingCents, couponDiscountCents, pixDiscountCents, coupon, totalCents };
}

export async function previewCoupon(visitorId: string, payload: Pick<CheckoutPayload, "coupon" | "cep" | "shippingMethod" | "paymentMethod">, customerId: string | null = null) {
  const couponCode = payload.coupon?.trim();
  if (!couponCode) throw new Error("Digite um cupom.");
  const cep = payload.cep?.trim() ?? "";
  if ((cep.match(/\d/g) ?? []).length !== 8) throw new Error("Informe o CEP antes de aplicar o cupom.");
  const shippingMethod = payload.shippingMethod?.trim() ?? "";
  if (!shippingMethod) throw new Error("Selecione a entrega antes de aplicar o cupom.");
  const paymentMethod = payload.paymentMethod === "pix" ? "pix" : payload.paymentMethod === "credit_card" ? "credit_card" : null;
  if (!paymentMethod) throw new Error("Escolha Pix ou cartão antes de aplicar o cupom.");
  const pricing = await checkoutPricing(visitorId, cep, shippingMethod, couponCode, paymentMethod, customerId);
  if (!pricing.coupon) throw new Error("Cupom inválido ou indisponível.");
  return {
    ...pricing.coupon,
    shippingCents: pricing.shippingCents,
    subtotalCents: pricing.subtotalCents,
    pixDiscountCents: pricing.pixDiscountCents,
    totalCents: pricing.totalCents,
  };
}

type CheckoutCustomer = { userId: string; name: string; email: string; phone: string };

export async function createOrder(visitorId: string, payload: CheckoutPayload, customer: CheckoutCustomer) {
  const clean = (value: string | undefined, maximum: number) => {
    const normalized = value?.trim() ?? "";
    if (normalized.length > maximum) throw new Error("Um dos campos ultrapassou o tamanho permitido.");
    return normalized;
  };
  const customerName = clean(payload.customerName, 120) || customer.name;
  const email = customer.email;
  const phone = clean(payload.phone, 30) || customer.phone;
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
  const paymentMethod = payload.paymentMethod === "pix" ? "pix" : payload.paymentMethod === "credit_card" ? "credit_card" : null;
  if (!paymentMethod) throw new Error("Escolha Pix ou cartão para continuar.");
  const verifiedAddress = await lookupCep(cep);
  if (verifiedAddress.city.toLocaleLowerCase("pt-BR") !== city.toLocaleLowerCase("pt-BR") || verifiedAddress.state !== state) {
    throw new Error("Cidade ou estado não correspondem ao CEP informado.");
  }

  const d1 = getD1();
  const pricing = await checkoutPricing(visitorId, cep, payload.shippingMethod.trim(), payload.coupon, paymentMethod, customer.userId);
  const { items, subtotalCents, selectedShipping, shippingCents, couponDiscountCents, pixDiscountCents, coupon, totalCents } = pricing;
  const orderId = `ELJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

  const statements = [
    d1.prepare("INSERT INTO orders (id, visitor_id, customer_id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city, state, city_ibge_code, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, pix_discount_cents, coupon_code, coupon_discount_cents, shipping_discount_cents, total_cents, marketing_consent, superfrete_service_id, superfrete_service_name, superfrete_delivery_days, superfrete_quote_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      orderId,
      visitorId,
      customer.userId,
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
      paymentMethod,
      subtotalCents,
      shippingCents,
      couponDiscountCents + pixDiscountCents,
      pixDiscountCents,
      coupon?.code ?? null,
      couponDiscountCents,
      coupon?.shippingDiscountCents ?? 0,
      totalCents,
      payload.marketingConsent ? 1 : 0,
      selectedShipping.id,
      selectedShipping.name,
      selectedShipping.deliveryDays,
      selectedShipping.priceCents,
    ),
    ...items.map((item) =>
      d1.prepare("INSERT INTO order_items (order_id, product_id, variant_id, variant_label, personalization_text, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(orderId, item.id, item.variantId || null, item.variantLabel || null, item.personalizationText, item.name, item.priceCents, item.quantity),
    ),
  ];
  await d1.batch(statements);

  // Reserva estoque e cupom já na criação. Se algo faltar, o pedido nunca chega à cliente.
  try {
    if (coupon) await reserveCouponUse(coupon.id, orderId, customer.userId);
    await reserveOrderStock(orderId);
  } catch (error) {
    await d1.batch([
      d1.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").bind(orderId),
      d1.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
      d1.prepare("DELETE FROM orders WHERE id = ? AND stock_committed = 0").bind(orderId),
    ]);
    if (coupon) await d1.prepare("UPDATE coupons SET usage_count = (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = coupons.id) WHERE id = ?").bind(coupon.id).run();
    throw error;
  }

  return {
    id: orderId,
    totalCents,
    status: "aguardando_pagamento",
    paymentMethod,
  };
}

/** Remove da sacola apenas os itens que foram comprados neste pedido (itens adicionados depois continuam). */
export async function clearPurchasedCartItems(visitorId: string, orderId: string) {
  await getD1().prepare("DELETE FROM cart_items WHERE visitor_id = ? AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = ? AND oi.product_id = cart_items.product_id AND COALESCE(oi.variant_id, '') = cart_items.variant_id AND COALESCE(oi.personalization_text, '') = cart_items.personalization_text)")
    .bind(visitorId, orderId)
    .run();
}
