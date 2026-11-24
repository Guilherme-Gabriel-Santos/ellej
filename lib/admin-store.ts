import { ensureStoreSchema, getD1 } from "./store";
import { writeAudit, type AdminSession } from "./admin-auth";
import { normalizeCouponCode } from "./coupons";
import { isOrderStatus, transitionOrderStatus } from "./order-status";
import { LAUNCH_TEASER_SETTING, MAX_LAUNCH_TEASERS, readLaunchAdminData, sendLaunchTestEmail } from "./launch";

type Row = Record<string, unknown>;

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
  let media: Array<{ type: "image" | "video"; url: string }> = [];
  try { media = JSON.parse(String(row.media ?? "[]")); } catch { media = []; }
  if (!media.length && row.image) media = [{ type: "image", url: String(row.image) }];
  if (row.video && !media.some((item) => item.url === String(row.video))) media.push({ type: "video", url: String(row.video) });
  let catalogData: Record<string, unknown> = {};
  let variants: Array<Record<string, unknown>> = [];
  let optionGroups: Array<Record<string, unknown>> = [];
  try { catalogData = JSON.parse(String(row.catalog_data ?? "{}")); } catch { catalogData = {}; }
  try { variants = JSON.parse(String(row.variants ?? "[]")); } catch { variants = []; }
  try { optionGroups = JSON.parse(String(row.option_groups ?? "[]")); } catch { optionGroups = []; }
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
    catalogData,
    variants,
    multiOptionsEnabled: Boolean(Number(row.multi_options_enabled ?? 0)),
    optionGroups,
    visibility: String(row.visibility ?? "visible"),
    trackStock: Boolean(Number(row.track_stock ?? 1)),
    priceVisible: Boolean(Number(row.price_visible ?? 1)),
    freeShipping: Boolean(Number(row.free_shipping ?? 0)),
    pixDiscountEnabled: Boolean(Number(row.pix_discount_enabled ?? 0)),
    pixDiscountPercent: Number(row.pix_discount_percent ?? 0),
    personalizationEnabled: Boolean(Number(row.personalization_enabled ?? 0)),
    personalizationMaxChars: Number(row.personalization_max_chars ?? 20),
    badge: row.badge ? String(row.badge) : "",
    priceCents: Number(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    stock: Number(row.stock),
    active: Boolean(Number(row.active)),
    featured: Boolean(Number(row.featured)),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

function normalizeCategory(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    parentId: row.parent_id ? String(row.parent_id) : null,
    image: row.image ? String(row.image) : "",
    active: Boolean(Number(row.active)),
    sortOrder: Number(row.sort_order),
    productCount: Number(row.product_count ?? 0),
  };
}

function normalizeBanner(row: Row) {
  return {
    id: String(row.id),
    title: String(row.title),
    subtitle: String(row.subtitle),
    image: String(row.image),
    linkUrl: row.link_url ? String(row.link_url) : "",
    linkLabel: row.link_label ? String(row.link_label) : "",
    focalX: Number(row.focal_x ?? 50),
    focalY: Number(row.focal_y ?? 24),
    active: Boolean(Number(row.active)),
    sortOrder: Number(row.sort_order),
  };
}

export async function readAdminDashboard() {
  await ensureStoreSchema();
  const d1 = getD1();
  const [productsResult, categoriesResult, productCategoriesResult, bannersResult, ordersResult, itemsResult, subscribersResult, allCategoryImageResult, couponsResult, couponProductsResult, reviewsResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, video, media, catalog_data, variants, multi_options_enabled, option_groups, visibility, track_stock, price_visible, free_shipping, pix_discount_enabled, pix_discount_percent, personalization_enabled, personalization_max_chars, badge, price_cents, compare_at_cents, stock, active, featured, sort_order, created_at FROM products ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT c.id, c.name, c.slug, c.parent_id, c.image, c.active, c.sort_order, (SELECT COUNT(DISTINCT pc.product_id) FROM product_categories pc INNER JOIN categories assigned ON assigned.id = pc.category_id WHERE assigned.id = c.id OR assigned.parent_id = c.id) AS product_count FROM categories c ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT product_id, category_id FROM product_categories ORDER BY created_at, category_id").all(),
    d1.prepare("SELECT id, title, subtitle, image, link_url, link_label, focal_x, focal_y, active, sort_order FROM homepage_banners ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city, state, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, pix_discount_cents, coupon_code, coupon_discount_cents, shipping_discount_cents, total_cents, status, stock_issue, payment_status, payment_provider, superfrete_service_id, superfrete_service_name, superfrete_delivery_days, superfrete_order_id, superfrete_protocol, superfrete_price_cents, superfrete_status, superfrete_tracking_code, superfrete_label_url, superfrete_updated_at, created_at FROM orders ORDER BY created_at DESC LIMIT 100").all(),
    d1.prepare("SELECT id, order_id, product_id, variant_id, variant_label, personalization_text, product_name, unit_price_cents, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 100) ORDER BY id").all(),
    d1.prepare("SELECT COUNT(*) AS total FROM subscribers").first<{ total: number }>(),
    d1.prepare("SELECT value FROM site_settings WHERE key = 'all_category_image'").first<{ value: string }>(),
    d1.prepare("SELECT id, code, name, description, discount_type, discount_value, free_shipping, applies_to, minimum_subtotal_cents, maximum_discount_cents, usage_limit, usage_count, per_customer_limit, starts_at, expires_at, active, created_at, updated_at FROM coupons ORDER BY active DESC, created_at DESC").all(),
    d1.prepare("SELECT coupon_id, product_id FROM coupon_products ORDER BY coupon_id, product_id").all(),
    d1.prepare("SELECT id, customer_name, location, rating, body, product_name, active, sort_order, created_at, updated_at FROM homepage_reviews ORDER BY sort_order, created_at, id").all(),
  ]);

  const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
  for (const row of itemsResult.results as Row[]) {
    const orderId = String(row.order_id);
    const current = itemsByOrder.get(orderId) ?? [];
    current.push({
      id: Number(row.id),
      productId: String(row.product_id),
      variantId: row.variant_id ? String(row.variant_id) : "",
      variantLabel: row.variant_label ? String(row.variant_label) : "",
      personalizationText: String(row.personalization_text ?? ""),
      productName: String(row.product_name),
      unitPriceCents: Number(row.unit_price_cents),
      quantity: Number(row.quantity),
    });
    itemsByOrder.set(orderId, current);
  }

  const categoryIdsByProduct = new Map<string, string[]>();
  for (const row of productCategoriesResult.results as Row[]) {
    const productId = String(row.product_id);
    categoryIdsByProduct.set(productId, [...(categoryIdsByProduct.get(productId) ?? []), String(row.category_id)]);
  }
  const products = (productsResult.results as Row[]).map((row) => ({
    ...normalizeProduct(row),
    categoryIds: categoryIdsByProduct.get(String(row.id)) ?? [],
  }));
  const orders = (ordersResult.results as Row[]).map((row) => ({
    id: String(row.id),
    customerName: String(row.customer_name),
    email: String(row.email),
    phone: String(row.phone),
    cpf: row.cpf ? String(row.cpf) : "",
    cep: String(row.cep),
    address: String(row.address),
    addressNumber: String(row.address_number),
    neighborhood: row.neighborhood ? String(row.neighborhood) : "",
    complement: row.complement ? String(row.complement) : "",
    city: String(row.city),
    state: String(row.state),
    shippingMethod: String(row.shipping_method),
    paymentMethod: String(row.payment_method),
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    discountCents: Number(row.discount_cents),
    pixDiscountCents: Number(row.pix_discount_cents ?? 0),
    couponCode: row.coupon_code ? String(row.coupon_code) : "",
    couponDiscountCents: Number(row.coupon_discount_cents ?? 0),
    shippingDiscountCents: Number(row.shipping_discount_cents ?? 0),
    totalCents: Number(row.total_cents),
    status: String(row.status),
    paymentStatus: row.payment_status ? String(row.payment_status) : "",
    stockIssue: Boolean(Number(row.stock_issue ?? 0)),
    paymentProvider: row.payment_provider ? String(row.payment_provider) : "",
    superfreteServiceId: row.superfrete_service_id ? String(row.superfrete_service_id) : "",
    superfreteServiceName: row.superfrete_service_name ? String(row.superfrete_service_name) : "",
    superfreteDeliveryDays: row.superfrete_delivery_days === null ? null : Number(row.superfrete_delivery_days),
    superfreteQuotePriceCents: row.superfrete_quote_price_cents === null ? null : Number(row.superfrete_quote_price_cents),
    superfreteOrderId: row.superfrete_order_id ? String(row.superfrete_order_id) : "",
    superfreteProtocol: row.superfrete_protocol ? String(row.superfrete_protocol) : "",
    superfretePriceCents: row.superfrete_price_cents === null ? null : Number(row.superfrete_price_cents),
    superfreteStatus: row.superfrete_status ? String(row.superfrete_status) : "",
    superfreteTrackingCode: row.superfrete_tracking_code ? String(row.superfrete_tracking_code) : "",
    superfreteLabelUrl: row.superfrete_label_url ? String(row.superfrete_label_url) : "",
    superfreteUpdatedAt: row.superfrete_updated_at ? String(row.superfrete_updated_at) : "",
    createdAt: String(row.created_at),
    items: itemsByOrder.get(String(row.id)) ?? [],
  }));

  const paidStatuses = new Set(["pago", "em_separacao", "enviado", "concluido"]);
  const productIdsByCoupon = new Map<string, string[]>();
  for (const row of couponProductsResult.results as Row[]) {
    const couponId = String(row.coupon_id);
    productIdsByCoupon.set(couponId, [...(productIdsByCoupon.get(couponId) ?? []), String(row.product_id)]);
  }
  return {
    products,
    categories: (categoriesResult.results as Row[]).map(normalizeCategory),
    banners: (bannersResult.results as Row[]).map(normalizeBanner),
    orders,
    coupons: (couponsResult.results as Row[]).map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      description: String(row.description ?? ""),
      discountType: String(row.discount_type),
      discountValue: Number(row.discount_value),
      freeShipping: Boolean(Number(row.free_shipping)),
      appliesTo: String(row.applies_to),
      minimumSubtotalCents: Number(row.minimum_subtotal_cents),
      maximumDiscountCents: row.maximum_discount_cents === null ? null : Number(row.maximum_discount_cents),
      usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
      perCustomerLimit: row.per_customer_limit === null || row.per_customer_limit === undefined ? null : Number(row.per_customer_limit),
      usageCount: Number(row.usage_count),
      startsAt: row.starts_at ? String(row.starts_at) : "",
      expiresAt: row.expires_at ? String(row.expires_at) : "",
      active: Boolean(Number(row.active)),
      productIds: productIdsByCoupon.get(String(row.id)) ?? [],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    reviews: (reviewsResult.results as Row[]).map((row) => ({
      id: String(row.id),
      customerName: String(row.customer_name),
      location: String(row.location ?? ""),
      rating: Math.max(0, Math.min(5, Number(row.rating))),
      body: String(row.body),
      productName: String(row.product_name ?? ""),
      active: Boolean(Number(row.active)),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    allCategoryImage: allCategoryImageResult?.value ? String(allCategoryImageResult.value) : "",
    launch: await readLaunchAdminData(),
    stats: {
      activeProducts: products.filter((product) => product.active).length,
      lowStock: products.filter((product) => product.active && product.trackStock && product.stock <= 3).length,
      pendingOrders: orders.filter((order) => order.status === "aguardando_pagamento").length,
      paidRevenueCents: orders.filter((order) => paidStatuses.has(order.status)).reduce((sum, order) => sum + order.totalCents, 0),
      subscribers: Number(subscribersResult?.total ?? 0),
    },
  };
}

async function categorySlug(name: string, excludedId?: string) {
  const d1 = getD1();
  const base = slugify(name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const row = await d1.prepare("SELECT id FROM categories WHERE slug = ? AND (? IS NULL OR id != ?)")
      .bind(slug, excludedId ?? null, excludedId ?? null).first<{ id: string }>();
    if (!row) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function categoryParent(value: unknown, excludedId?: string) {
  const parentId = String(value ?? "").trim() || null;
  if (!parentId) return null;
  if (parentId === excludedId) throw new Error("Uma categoria não pode ser o próprio grupo.");
  const parent = await getD1().prepare("SELECT id, parent_id FROM categories WHERE id = ?").bind(parentId).first<{ id: string; parent_id: string | null }>();
  if (!parent) throw new Error("Escolha um grupo principal válido.");
  if (parent.parent_id) throw new Error("As subcategorias só podem ficar dentro de um grupo principal.");
  return parentId;
}

export async function createCategory(session: AdminSession, payload: Record<string, unknown>) {
  const name = textValue(payload.name, "o nome da categoria", 60);
  const image = textValue(payload.image, "a imagem da categoria", 500, false);
  if (image && !image.startsWith("/api/media?key=")) throw new Error("Envie a imagem pelo painel.");
  const parentId = await categoryParent(payload.parentId);
  const duplicate = await getD1().prepare("SELECT id FROM categories WHERE lower(name) = lower(?) AND parent_id IS ?").bind(name, parentId).first();
  if (duplicate) throw new Error("Essa categoria já existe.");
  const id = `cat_${crypto.randomUUID()}`;
  const slug = await categorySlug(name);
  const position = await getD1().prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories").first<{ next: number }>();
  await getD1().prepare("INSERT INTO categories (id, name, slug, parent_id, image, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)")
    .bind(id, name, slug, parentId, image || null, Number(position?.next ?? 1)).run();
  await writeAudit(session.userId, "category.created", "category", id, { name, parentId });
}

export async function updateCategory(session: AdminSession, payload: Record<string, unknown>) {
  const id = textValue(payload.id, "a categoria", 80);
  const name = textValue(payload.name, "o nome da categoria", 60);
  const image = textValue(payload.image, "a imagem da categoria", 500, false);
  if (image && !image.startsWith("/api/media?key=")) throw new Error("Envie a imagem pelo painel.");
  const current = await getD1().prepare("SELECT name FROM categories WHERE id = ?").bind(id).first<{ name: string }>();
  if (!current) throw new Error("Categoria não encontrada.");
  const parentId = await categoryParent(payload.parentId, id);
  const duplicate = await getD1().prepare("SELECT id FROM categories WHERE lower(name) = lower(?) AND parent_id IS ? AND id != ?").bind(name, parentId, id).first();
  if (duplicate) throw new Error("Essa categoria já existe.");
  const slug = await categorySlug(name, id);
  await getD1().batch([
    getD1().prepare("UPDATE categories SET name = ?, slug = ?, parent_id = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, slug, parentId, image || null, id),
    getD1().prepare("UPDATE products SET category = ? WHERE category = ? AND id IN (SELECT product_id FROM product_categories WHERE category_id = ?)").bind(name, current.name, id),
  ]);
  await writeAudit(session.userId, "category.updated", "category", id, { previousName: current.name, name, parentId });
}

export async function setCategoryActive(session: AdminSession, categoryId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE categories SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(active ? 1 : 0, categoryId).run();
  if (!result.meta.changes) throw new Error("Categoria não encontrada.");
  await writeAudit(session.userId, active ? "category.activated" : "category.hidden", "category", categoryId);
}

export async function reorderCategories(session: AdminSession, orderedIds: unknown) {
  if (!Array.isArray(orderedIds) || orderedIds.length > 100 || orderedIds.some((id) => typeof id !== "string")) {
    throw new Error("Ordem de categorias inválida.");
  }
  const uniqueIds = [...new Set(orderedIds as string[])];
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM categories").first<{ total: number }>();
  if (uniqueIds.length !== Number(total?.total ?? 0)) throw new Error("Atualize a página e tente ordenar novamente.");
  await getD1().batch(uniqueIds.map((id, index) => getD1().prepare("UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(index + 1, id)));
  await writeAudit(session.userId, "category.reordered", "category", null, { orderedIds: uniqueIds });
}

export async function deleteCategory(session: AdminSession, categoryId: string) {
  const category = await getD1().prepare("SELECT c.name, COUNT(DISTINCT pc.product_id) AS product_count, (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) AS child_count FROM categories c LEFT JOIN product_categories pc ON pc.category_id = c.id WHERE c.id = ? GROUP BY c.id, c.name")
    .bind(categoryId).first<{ name: string; product_count: number; child_count: number }>();
  if (!category) throw new Error("Categoria não encontrada.");
  if (Number(category.product_count) > 0) throw new Error("Mova os produtos para outra categoria antes de excluí-la.");
  if (Number(category.child_count) > 0) throw new Error("Exclua ou mova as subcategorias antes de apagar esse grupo.");
  await getD1().prepare("DELETE FROM categories WHERE id = ?").bind(categoryId).run();
  await writeAudit(session.userId, "category.deleted", "category", categoryId, { name: category.name });
}

const allCategoryImageKey = "all_category_image";

export async function updateAllCategoryImage(session: AdminSession, imageInput: unknown) {
  const image = textValue(imageInput, "a foto", 600, false);
  if (image && !isAllowedMediaUrl(image)) throw new Error("Envie uma foto válida.");
  const d1 = getD1();
  if (image) {
    await d1
      .prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
      .bind(allCategoryImageKey, image)
      .run();
  } else {
    await d1.prepare("DELETE FROM site_settings WHERE key = ?").bind(allCategoryImageKey).run();
  }
  await writeAudit(session.userId, "settings.updated", "site_setting", allCategoryImageKey, { image });
}

type ProductPayload = Record<string, unknown>;

type ProductMedia = { type: "image" | "video"; url: string };

const maxMediaPerProduct = 10;

function isAllowedMediaUrl(url: string) {
  return url.startsWith("/api/media?key=") || url.startsWith("/brand/") || url.toLowerCase().startsWith("https://");
}

function normalizeMediaPayload(value: unknown) {
  const media: ProductMedia[] = [];
  if (!Array.isArray(value)) return media;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const url = textValue(item.url, "a mídia", 600, false);
    if (!url || !isAllowedMediaUrl(url) || media.some((existing) => existing.url === url)) continue;
    media.push({ type: item.type === "video" ? "video" : "image", url });
    if (media.length === maxMediaPerProduct) break;
  }
  return media;
}

function validateProduct(payload: ProductPayload) {
  const name = textValue(payload.name, "o nome", 120);
  const category = textValue(payload.category, "a categoria", 60, false);
  const categoryIds = Array.isArray(payload.categoryIds)
    ? [...new Set(payload.categoryIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!categoryIds.length && !category) throw new Error("Escolha pelo menos uma categoria.");
  if (categoryIds.length > 30) throw new Error("Escolha no máximo 30 categorias.");
  const description = textValue(payload.description, "a descrição", 3_000);
  const material = textValue(payload.material, "o material", 160);
  const media = normalizeMediaPayload(payload.media);
  const sentImage = textValue(payload.image, "uma foto", 600, false);
  const validSentImage = sentImage && isAllowedMediaUrl(sentImage) && !media.some((item) => item.url === sentImage && item.type === "video")
    ? sentImage
    : "";
  const image = media.some((item) => item.url === validSentImage && item.type === "image")
    ? validSentImage
    : media.find((item) => item.type === "image")?.url ?? validSentImage;
  if (!image) throw new Error("Adicione pelo menos uma foto do produto.");
  if (!media.some((item) => item.url === image)) media.unshift({ type: "image", url: image });
  const video = media.find((item) => item.type === "video")?.url ?? "";
  const priceCents = integerValue(payload.priceCents, "O preço", 1, 100_000_000);
  const compareAtCents = payload.compareAtCents === null || payload.compareAtCents === "" || payload.compareAtCents === undefined
    ? null
    : integerValue(payload.compareAtCents, "O preço anterior", 1, 100_000_000);
  if (compareAtCents !== null && compareAtCents <= priceCents) {
    throw new Error("O preço anterior precisa ser maior que o preço atual.");
  }
  const pixDiscountEnabled = payload.pixDiscountEnabled === true;
  const pixDiscountPercent = integerValue(payload.pixDiscountPercent ?? 0, "O desconto Pix", 0, 90);
  if (pixDiscountEnabled && pixDiscountPercent < 1) throw new Error("Informe um percentual de desconto Pix entre 1% e 90%.");
  const catalogInput = payload.catalogData && typeof payload.catalogData === "object" ? payload.catalogData as Record<string, unknown> : {};
  const catalogData = {
    costCents: integerValue(catalogInput.costCents ?? 0, "O custo", 0, 100_000_000),
    sku: textValue(catalogInput.sku, "o SKU", 80, false),
    barcode: textValue(catalogInput.barcode, "o código de barras", 32, false),
    weightGrams: integerValue(catalogInput.weightGrams ?? 300, "O peso", 1, 100_000),
    lengthCm: integerValue(catalogInput.lengthCm ?? 18, "O comprimento", 1, 300),
    widthCm: integerValue(catalogInput.widthCm ?? 18, "A largura", 1, 300),
    heightCm: integerValue(catalogInput.heightCm ?? 6, "A altura", 1, 300),
    mpn: textValue(catalogInput.mpn, "o MPN", 80, false),
    ageGroup: ["adult", "kids"].includes(String(catalogInput.ageGroup)) ? String(catalogInput.ageGroup) : "adult",
    gender: ["female", "male", "unisex"].includes(String(catalogInput.gender)) ? String(catalogInput.gender) : "female",
    tags: textValue(catalogInput.tags, "as tags", 500, false),
    brand: textValue(catalogInput.brand, "a marca", 80, false) || "Elle Jew",
    seoTitle: textValue(catalogInput.seoTitle, "o título SEO", 70, false),
    seoDescription: textValue(catalogInput.seoDescription, "a descrição SEO", 160, false),
  };
  const variants = Array.isArray(payload.variants) ? payload.variants.slice(0, 100).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: textValue(item.id, "a variação", 80, false) || `var_${crypto.randomUUID()}`,
      size: textValue(item.size, "o tamanho", 60, false),
      color: textValue(item.color, "a cor", 60, false),
      material: textValue(item.material, "o material da variação", 80, false),
      sku: textValue(item.sku, "o SKU da variação", 80, false),
      priceCents: integerValue(item.priceCents ?? priceCents, `O preço da variação ${index + 1}`, 1, 100_000_000),
      stock: integerValue(item.stock ?? 0, `O estoque da variação ${index + 1}`, 0, 100_000),
      active: item.active !== false,
    };
  }).filter((item) => item.size || item.color || item.material) : [];
  const multiOptionsEnabled = payload.multiOptionsEnabled === true;
  const personalizationEnabled = payload.personalizationEnabled === true;
  const optionGroups = Array.isArray(payload.optionGroups) ? payload.optionGroups.slice(0, 8).map((entry, groupIndex) => {
    const group = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const selectionMode = group.selectionMode === "personalizationLength" ? "personalizationLength" as const : "manual" as const;
    const options = Array.isArray(group.options) ? group.options.slice(0, 30).map((optionEntry, optionIndex) => {
      const option = optionEntry && typeof optionEntry === "object" ? optionEntry as Record<string, unknown> : {};
      return {
        id: textValue(option.id, "a opção", 40, false) || `opt_${crypto.randomUUID().slice(0, 8)}`,
        label: textValue(option.label, `o nome da opção ${optionIndex + 1}`, 100, multiOptionsEnabled),
        addedPriceCents: integerValue(option.addedPriceCents ?? 0, `o acréscimo da opção ${optionIndex + 1}`, 0, 100_000_000),
        active: option.active !== false,
      };
    }) : [];
    if (multiOptionsEnabled && !options.length) throw new Error(`Adicione pelo menos uma alternativa ao grupo ${groupIndex + 1}.`);
    if (selectionMode === "personalizationLength" && options.some((option) => option.active && !/(\d+)\s*(?:-|–|—|a|até)\s*(\d+)/i.test(option.label))) {
      throw new Error(`As alternativas do grupo ${groupIndex + 1} precisam informar uma faixa, como “2 a 6 letras”.`);
    }
    return { id: textValue(group.id, "o grupo de opções", 40, false) || `grp_${crypto.randomUUID().slice(0, 8)}`, name: textValue(group.name, `o nome do grupo ${groupIndex + 1}`, 60, multiOptionsEnabled), options, selectionMode };
  }) : [];
  if (multiOptionsEnabled && optionGroups.length < 1) throw new Error("Adicione pelo menos um grupo de opções.");
  if (multiOptionsEnabled && variants.length) throw new Error("Remova as variações simples antes de ativar as múltiplas opções.");
  if (multiOptionsEnabled && optionGroups.some((group) => group.options.length < 1)) throw new Error("Cada grupo precisa ter pelo menos uma alternativa.");
  if (multiOptionsEnabled && optionGroups.reduce((sum, group) => sum + Math.max(...group.options.map((option) => option.addedPriceCents)), 0) + priceCents > 100_000_000) throw new Error("O preço máximo formado pelas opções ultrapassa o limite permitido.");
  if (multiOptionsEnabled && new Set(optionGroups.map((group) => group.id)).size !== optionGroups.length) throw new Error("Os grupos de opções precisam ter identificadores diferentes.");
  if (multiOptionsEnabled && optionGroups.some((group) => new Set(group.options.map((option) => option.id)).size !== group.options.length)) throw new Error("As alternativas de cada grupo precisam ter identificadores diferentes.");
  if (optionGroups.filter((group) => group.selectionMode === "personalizationLength").length > 1) throw new Error("Ative a seleção automática em apenas um grupo de faixas de letras.");
  if (optionGroups.some((group) => group.selectionMode === "personalizationLength") && !personalizationEnabled) throw new Error("Ative a personalização para usar faixas automáticas de letras.");
  if (optionGroups.some((group) => group.options.filter((option) => option.active).length < 1)) throw new Error("Cada grupo precisa ter ao menos uma alternativa disponível.");
  const visibility = ["visible", "unlisted", "hidden"].includes(String(payload.visibility)) ? String(payload.visibility) : "visible";
  return {
    name,
    category,
    categoryIds,
    description,
    material,
    image,
    video,
    media,
    catalogData,
    variants,
    multiOptionsEnabled: multiOptionsEnabled ? 1 : 0,
    optionGroups,
    slug: slugify(textValue(payload.slug, "a URL", 80, false) || name),
    badge: textValue(payload.badge, "o selo", 50, false) || null,
    priceCents,
    compareAtCents,
    stock: variants.length ? variants.reduce((sum, item) => sum + item.stock, 0) : integerValue(payload.stock, "O estoque", 0, 100_000),
    trackStock: payload.trackStock !== false ? 1 : 0,
    priceVisible: payload.priceVisible !== false ? 1 : 0,
    freeShipping: payload.freeShipping === true ? 1 : 0,
    pixDiscountEnabled: pixDiscountEnabled ? 1 : 0,
    pixDiscountPercent,
    personalizationEnabled: personalizationEnabled ? 1 : 0,
    personalizationMaxChars: integerValue(payload.personalizationMaxChars ?? 20, "O limite de caracteres da gravação", 1, 80),
    visibility,
    active: visibility === "hidden" || payload.active === false || payload.active === 0 ? 0 : 1,
    featured: payload.featured === true || payload.featured === 1 ? 1 : 0,
  };
}

async function resolveProductCategories(categoryIds: string[], fallbackName: string) {
  const d1 = getD1();
  if (!categoryIds.length) {
    const fallback = await d1.prepare("SELECT id, name FROM categories WHERE name = ? ORDER BY parent_id IS NULL, sort_order LIMIT 1").bind(fallbackName).first<{ id: string; name: string }>();
    if (!fallback) throw new Error("Escolha uma categoria cadastrada.");
    return { ids: [fallback.id], primaryName: fallback.name };
  }
  const placeholders = categoryIds.map(() => "?").join(",");
  const result = await d1.prepare(`SELECT id, name, parent_id FROM categories WHERE id IN (${placeholders})`).bind(...categoryIds).all<{ id: string; name: string; parent_id: string | null }>();
  if (result.results.length !== categoryIds.length) throw new Error("Uma das categorias selecionadas não existe mais.");
  const selected = new Map(result.results.map((row) => [row.id, row]));
  const ordered = categoryIds.map((id) => selected.get(id)!);
  const primary = ordered.find((row) => row.parent_id) ?? ordered[0];
  return { ids: categoryIds, primaryName: primary.name };
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
  const categories = await resolveProductCategories(product.categoryIds, product.category);
  const id = `prd_${crypto.randomUUID()}`;
  const slug = await availableSlug(product.slug);
  const d1 = getD1();
  const position = await d1.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM products").first<{ next: number }>();
  await d1.batch([
    d1.prepare("INSERT INTO products (id, slug, name, category, description, material, image, video, media, catalog_data, variants, multi_options_enabled, option_groups, visibility, track_stock, price_visible, free_shipping, pix_discount_enabled, pix_discount_percent, personalization_enabled, personalization_max_chars, badge, price_cents, compare_at_cents, stock, active, featured, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, slug, product.name, categories.primaryName, product.description, product.material, product.image, product.video || null, JSON.stringify(product.media), JSON.stringify(product.catalogData), JSON.stringify(product.variants), product.multiOptionsEnabled, JSON.stringify(product.optionGroups), product.visibility, product.trackStock, product.priceVisible, product.freeShipping, product.pixDiscountEnabled, product.pixDiscountPercent, product.personalizationEnabled, product.personalizationMaxChars, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active, product.featured, Number(position?.next ?? 1)),
    ...categories.ids.map((categoryId) => d1.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(id, categoryId)),
  ]);
  await writeAudit(session.userId, "product.created", "product", id, { name: product.name });
  return id;
}

type StockSnapshot = { stock?: unknown; variants?: Array<{ id?: unknown; stock?: unknown }> };

/** Compara o estoque que o admin viu ao abrir o produto com o atual; se houve venda no meio, recusa o salvamento. */
function assertStockSnapshot(snapshot: unknown, current: { stock: number; variants: string }) {
  if (!snapshot || typeof snapshot !== "object") return;
  const seen = snapshot as StockSnapshot;
  const changedMessage = "O estoque deste produto mudou desde que você abriu a edição (provavelmente uma venda). Reabra o produto para conferir o estoque atual.";
  if (Number(seen.stock) !== Number(current.stock)) throw new Error(changedMessage);
  let variants: Array<{ id: string; stock: number }> = [];
  try { variants = JSON.parse(current.variants || "[]"); } catch { variants = []; }
  for (const variant of Array.isArray(seen.variants) ? seen.variants : []) {
    const live = variants.find((item) => item.id === String(variant.id ?? ""));
    if (live && Number(live.stock) !== Number(variant.stock)) throw new Error(changedMessage);
  }
}

export async function updateProduct(session: AdminSession, payload: ProductPayload) {
  const id = textValue(payload.id, "o produto", 80);
  const existing = await getD1().prepare("SELECT id, stock, variants FROM products WHERE id = ?").bind(id).first<{ id: string; stock: number; variants: string }>();
  if (!existing) throw new Error("Produto não encontrado.");
  assertStockSnapshot(payload.stockSnapshot, existing);
  const product = validateProduct(payload);
  const categories = await resolveProductCategories(product.categoryIds, product.category);
  const slug = await availableSlug(product.slug, id);
  const d1 = getD1();
  // Atualização condicional: se houve venda (estoque mudou) desde a leitura acima, nada é sobrescrito.
  const updated = await d1.prepare("UPDATE products SET slug = ?, name = ?, category = ?, description = ?, material = ?, image = ?, video = ?, media = ?, catalog_data = ?, variants = ?, multi_options_enabled = ?, option_groups = ?, visibility = ?, track_stock = ?, price_visible = ?, free_shipping = ?, pix_discount_enabled = ?, pix_discount_percent = ?, personalization_enabled = ?, personalization_max_chars = ?, badge = ?, price_cents = ?, compare_at_cents = ?, stock = ?, active = ?, featured = ? WHERE id = ? AND stock = ? AND variants = ?")
      .bind(slug, product.name, categories.primaryName, product.description, product.material, product.image, product.video || null, JSON.stringify(product.media), JSON.stringify(product.catalogData), JSON.stringify(product.variants), product.multiOptionsEnabled, JSON.stringify(product.optionGroups), product.visibility, product.trackStock, product.priceVisible, product.freeShipping, product.pixDiscountEnabled, product.pixDiscountPercent, product.personalizationEnabled, product.personalizationMaxChars, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active, product.featured, id, Number(existing.stock), existing.variants).run();
  if (Number(updated.meta.changes ?? 0) !== 1) throw new Error("O estoque deste produto mudou enquanto você editava (provavelmente uma venda). Reabra o produto e salve novamente.");
  await d1.batch([
    d1.prepare("DELETE FROM product_categories WHERE product_id = ?").bind(id),
    ...categories.ids.map((categoryId) => d1.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(id, categoryId)),
  ]);
  await writeAudit(session.userId, "product.updated", "product", id, { name: product.name });
  return id;
}

export async function setProductActive(session: AdminSession, productId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE products SET active = ?, visibility = ? WHERE id = ?").bind(active ? 1 : 0, active ? "visible" : "hidden", productId).run();
  if (!result.success) throw new Error("Não foi possível atualizar o produto.");
  await writeAudit(session.userId, active ? "product.activated" : "product.archived", "product", productId);
}

function validateBanner(payload: Record<string, unknown>) {
  const title = textValue(payload.title, "o título do banner", 100);
  const subtitle = textValue(payload.subtitle, "o texto do banner", 220, false);
  const image = textValue(payload.image, "uma foto para o banner", 600);
  if (!image.startsWith("/api/media?key=") && !image.startsWith("/brand/") && !/^https:\/\//i.test(image)) {
    throw new Error("Envie uma foto válida para o banner.");
  }
  const linkUrl = textValue(payload.linkUrl, "o link", 500, false);
  if (linkUrl && !linkUrl.startsWith("#") && !linkUrl.startsWith("/") && !/^https:\/\//i.test(linkUrl)) {
    throw new Error("Use um link seguro iniciado por https://, / ou #.");
  }
  const linkLabel = textValue(payload.linkLabel, "o texto do botão", 50, false);
  const focalX = Math.max(0, Math.min(100, Math.round(Number(payload.focalX ?? 50))));
  const focalY = Math.max(0, Math.min(100, Math.round(Number(payload.focalY ?? 24))));
  if (!Number.isFinite(focalX) || !Number.isFinite(focalY)) throw new Error("Posição de foco inválida.");
  return { title, subtitle, image, linkUrl: linkUrl || null, linkLabel: linkUrl ? (linkLabel || "Saiba mais") : null, focalX, focalY };
}

export async function reorderProducts(session: AdminSession, orderedIds: unknown) {
  if (!Array.isArray(orderedIds) || orderedIds.length > 1_000 || orderedIds.some((id) => typeof id !== "string")) throw new Error("Ordem de produtos inválida.");
  const ids = [...new Set(orderedIds as string[])];
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM products").first<{ total: number }>();
  if (ids.length !== Number(total?.total ?? 0)) throw new Error("Atualize a página e tente ordenar novamente.");
  await getD1().batch(ids.map((id, index) => getD1().prepare("UPDATE products SET sort_order = ? WHERE id = ?").bind(index + 1, id)));
  await writeAudit(session.userId, "product.reordered", "product", null, { orderedIds: ids });
}

export async function reorderStorefrontProducts(session: AdminSession, orderedIds: unknown) {
  if (!Array.isArray(orderedIds) || orderedIds.length > 1_000 || orderedIds.some((id) => typeof id !== "string")) throw new Error("Ordem de produtos inválida.");
  const ids = orderedIds as string[];
  if (new Set(ids).size !== ids.length) throw new Error("Ordem de produtos inválida.");

  const result = await getD1()
    .prepare("SELECT id, active, visibility FROM products ORDER BY sort_order, created_at, id")
    .all<{ id: string; active: number; visibility: string }>();
  const products = result.results ?? [];
  const storefrontIds = products.filter((product) => Boolean(product.active) && product.visibility === "visible").map((product) => product.id);
  const requestedIds = new Set(ids);
  if (ids.length !== storefrontIds.length || storefrontIds.some((id) => !requestedIds.has(id))) {
    throw new Error("A vitrine mudou. Atualize a página antes de salvar a nova ordem.");
  }

  const storefrontSet = new Set(storefrontIds);
  let storefrontIndex = 0;
  const completeOrder = products.map((product) => storefrontSet.has(product.id) ? ids[storefrontIndex++] : product.id);
  if (completeOrder.length) {
    await getD1().batch(completeOrder.map((id, index) => getD1().prepare("UPDATE products SET sort_order = ? WHERE id = ?").bind(index + 1, id)));
  }
  await writeAudit(session.userId, "product.storefront_reordered", "product", null, { orderedIds: ids });
  return ids;
}

export async function createBanner(session: AdminSession, payload: Record<string, unknown>) {
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM homepage_banners").first<{ total: number }>();
  if (Number(total?.total ?? 0) >= 20) throw new Error("O carrossel aceita no máximo 20 banners.");
  const banner = validateBanner(payload);
  const id = `banner_${crypto.randomUUID()}`;
  const position = await getD1().prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM homepage_banners").first<{ next: number }>();
  await getD1().prepare("INSERT INTO homepage_banners (id, title, subtitle, image, link_url, link_label, focal_x, focal_y, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)")
    .bind(id, banner.title, banner.subtitle, banner.image, banner.linkUrl, banner.linkLabel, banner.focalX, banner.focalY, Number(position?.next ?? 1)).run();
  await writeAudit(session.userId, "banner.created", "banner", id, { title: banner.title });
}

export async function updateBanner(session: AdminSession, payload: Record<string, unknown>) {
  const id = textValue(payload.id, "o banner", 80);
  const banner = validateBanner(payload);
  const result = await getD1().prepare("UPDATE homepage_banners SET title = ?, subtitle = ?, image = ?, link_url = ?, link_label = ?, focal_x = ?, focal_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(banner.title, banner.subtitle, banner.image, banner.linkUrl, banner.linkLabel, banner.focalX, banner.focalY, id).run();
  if (!result.meta.changes) throw new Error("Banner não encontrado.");
  await writeAudit(session.userId, "banner.updated", "banner", id, { title: banner.title });
}

export async function setBannerActive(session: AdminSession, bannerId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE homepage_banners SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active ? 1 : 0, bannerId).run();
  if (!result.meta.changes) throw new Error("Banner não encontrado.");
  await writeAudit(session.userId, active ? "banner.activated" : "banner.hidden", "banner", bannerId);
}

export async function reorderBanners(session: AdminSession, orderedIds: unknown) {
  if (!Array.isArray(orderedIds) || orderedIds.length > 20 || orderedIds.some((id) => typeof id !== "string")) throw new Error("Ordem de banners inválida.");
  const ids = [...new Set(orderedIds as string[])];
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM homepage_banners").first<{ total: number }>();
  if (ids.length !== Number(total?.total ?? 0)) throw new Error("Atualize a página e tente novamente.");
  await getD1().batch(ids.map((id, index) => getD1().prepare("UPDATE homepage_banners SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(index + 1, id)));
  await writeAudit(session.userId, "banner.reordered", "banner", null, { orderedIds: ids });
}

export async function deleteBanner(session: AdminSession, bannerId: string) {
  const result = await getD1().prepare("DELETE FROM homepage_banners WHERE id = ?").bind(bannerId).run();
  if (!result.meta.changes) throw new Error("Banner não encontrado.");
  await writeAudit(session.userId, "banner.deleted", "banner", bannerId);
}

export async function updateOrderStatus(session: AdminSession, orderId: string, status: string) {
  if (!isOrderStatus(status)) throw new Error("Situação do pedido inválida.");
  const changed = await transitionOrderStatus(orderId, status);
  await writeAudit(session.userId, "order.status_changed", "order", orderId, changed);
}

function optionalInteger(value: unknown, field: string, maximum = 100_000_000) {
  if (value === null || value === undefined || value === "" || Number(value) === 0) return null;
  return integerValue(value, field, 1, maximum);
}

function optionalDate(value: unknown, field: string) {
  const normalized = textValue(value, field, 40, false);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} está inválida.`);
  return date.toISOString();
}

async function validateCoupon(payload: Record<string, unknown>, excludedId?: string) {
  const code = normalizeCouponCode(payload.code);
  if (code.length < 3) throw new Error("O código precisa ter pelo menos 3 letras ou números.");
  const name = textValue(payload.name, "o nome interno do cupom", 80);
  const description = textValue(payload.description, "a descrição", 220, false);
  const discountType = ["none", "percentage", "fixed"].includes(String(payload.discountType)) ? String(payload.discountType) : "none";
  const discountValue = discountType === "percentage"
    ? integerValue(payload.discountValue, "A porcentagem", 1, 100)
    : discountType === "fixed"
      ? integerValue(payload.discountValue, "O valor do desconto", 1, 100_000_000)
      : 0;
  const freeShipping = Boolean(payload.freeShipping);
  if (discountType === "none" && !freeShipping) throw new Error("Escolha um desconto nos produtos, frete grátis ou os dois.");
  const appliesTo = payload.appliesTo === "selected" ? "selected" : "all";
  const productIds = appliesTo === "selected" && Array.isArray(payload.productIds)
    ? [...new Set(payload.productIds.filter((id): id is string => typeof id === "string" && /^[-_a-zA-Z0-9]{2,100}$/.test(id)))].slice(0, 500)
    : [];
  if (appliesTo === "selected" && !productIds.length) throw new Error("Selecione pelo menos um produto elegível.");
  if (productIds.length) {
    const placeholders = productIds.map(() => "?").join(",");
    const found = await getD1().prepare(`SELECT COUNT(*) AS total FROM products WHERE id IN (${placeholders})`).bind(...productIds).first<{ total: number }>();
    if (Number(found?.total ?? 0) !== productIds.length) throw new Error("Um dos produtos selecionados não existe mais.");
  }
  const minimumSubtotalCents = integerValue(payload.minimumSubtotalCents ?? 0, "A compra mínima", 0, 100_000_000);
  const maximumDiscountCents = discountType === "percentage" ? optionalInteger(payload.maximumDiscountCents, "O desconto máximo") : null;
  const usageLimit = optionalInteger(payload.usageLimit, "O limite de usos", 1_000_000);
  const perCustomerLimit = optionalInteger(payload.perCustomerLimit, "O limite por cliente", 1_000);
  const startsAt = optionalDate(payload.startsAt, "A data inicial");
  const expiresAt = optionalDate(payload.expiresAt, "A data final");
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) throw new Error("A data final precisa ser posterior à data inicial.");
  const duplicate = await getD1().prepare("SELECT id FROM coupons WHERE code = ? COLLATE NOCASE AND (? IS NULL OR id != ?)").bind(code, excludedId ?? null, excludedId ?? null).first();
  if (duplicate) throw new Error("Já existe um cupom com esse código.");
  return { code, name, description, discountType, discountValue, freeShipping, appliesTo, productIds, minimumSubtotalCents, maximumDiscountCents, usageLimit, perCustomerLimit, startsAt, expiresAt, active: payload.active !== false };
}

export async function createCoupon(session: AdminSession, payload: Record<string, unknown>) {
  const coupon = await validateCoupon(payload);
  const id = `coupon_${crypto.randomUUID()}`;
  const d1 = getD1();
  await d1.batch([
    d1.prepare("INSERT INTO coupons (id, code, name, description, discount_type, discount_value, free_shipping, applies_to, minimum_subtotal_cents, maximum_discount_cents, usage_limit, per_customer_limit, starts_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, coupon.code, coupon.name, coupon.description, coupon.discountType, coupon.discountValue, coupon.freeShipping ? 1 : 0, coupon.appliesTo, coupon.minimumSubtotalCents, coupon.maximumDiscountCents, coupon.usageLimit, coupon.perCustomerLimit, coupon.startsAt, coupon.expiresAt, coupon.active ? 1 : 0),
    ...coupon.productIds.map((productId) => d1.prepare("INSERT INTO coupon_products (coupon_id, product_id) VALUES (?, ?)").bind(id, productId)),
  ]);
  await writeAudit(session.userId, "coupon.created", "coupon", id, { code: coupon.code });
}

export async function updateCoupon(session: AdminSession, payload: Record<string, unknown>) {
  const id = textValue(payload.id, "o cupom", 80);
  const current = await getD1().prepare("SELECT id FROM coupons WHERE id = ?").bind(id).first();
  if (!current) throw new Error("Cupom não encontrado.");
  const coupon = await validateCoupon(payload, id);
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE coupons SET code = ?, name = ?, description = ?, discount_type = ?, discount_value = ?, free_shipping = ?, applies_to = ?, minimum_subtotal_cents = ?, maximum_discount_cents = ?, usage_limit = ?, per_customer_limit = ?, starts_at = ?, expires_at = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(coupon.code, coupon.name, coupon.description, coupon.discountType, coupon.discountValue, coupon.freeShipping ? 1 : 0, coupon.appliesTo, coupon.minimumSubtotalCents, coupon.maximumDiscountCents, coupon.usageLimit, coupon.perCustomerLimit, coupon.startsAt, coupon.expiresAt, coupon.active ? 1 : 0, id),
    d1.prepare("DELETE FROM coupon_products WHERE coupon_id = ?").bind(id),
    ...coupon.productIds.map((productId) => d1.prepare("INSERT INTO coupon_products (coupon_id, product_id) VALUES (?, ?)").bind(id, productId)),
  ]);
  await writeAudit(session.userId, "coupon.updated", "coupon", id, { code: coupon.code });
}

export async function setCouponActive(session: AdminSession, couponId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE coupons SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active ? 1 : 0, couponId).run();
  if (!result.meta.changes) throw new Error("Cupom não encontrado.");
  await writeAudit(session.userId, active ? "coupon.activated" : "coupon.disabled", "coupon", couponId);
}

export async function deleteCoupon(session: AdminSession, couponId: string) {
  const coupon = await getD1().prepare("SELECT code, usage_count FROM coupons WHERE id = ?").bind(couponId).first<{ code: string; usage_count: number }>();
  if (!coupon) throw new Error("Cupom não encontrado.");
  if (Number(coupon.usage_count) > 0) throw new Error("Este cupom já foi utilizado. Desative-o para preservar o histórico.");
  await getD1().batch([
    getD1().prepare("DELETE FROM coupon_products WHERE coupon_id = ?").bind(couponId),
    getD1().prepare("DELETE FROM coupons WHERE id = ?").bind(couponId),
  ]);
  await writeAudit(session.userId, "coupon.deleted", "coupon", couponId, { code: coupon.code });
}

function validateReview(payload: Record<string, unknown>) {
  return {
    customerName: textValue(payload.customerName, "o nome da cliente", 80),
    location: textValue(payload.location, "a cidade", 80, false),
    rating: integerValue(payload.rating, "A nota", 0, 5),
    body: textValue(payload.body, "o texto da avaliação", 500),
    productName: textValue(payload.productName, "o produto", 120, false),
    active: payload.active !== false,
  };
}

export async function createReview(session: AdminSession, payload: Record<string, unknown>) {
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM homepage_reviews").first<{ total: number }>();
  if (Number(total?.total ?? 0) >= 50) throw new Error("O painel aceita no máximo 50 avaliações.");
  const review = validateReview(payload);
  const id = `review_${crypto.randomUUID()}`;
  const position = await getD1().prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM homepage_reviews").first<{ next: number }>();
  await getD1().prepare("INSERT INTO homepage_reviews (id, customer_name, location, rating, body, product_name, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, review.customerName, review.location, review.rating, review.body, review.productName, review.active ? 1 : 0, Number(position?.next ?? 1)).run();
  await writeAudit(session.userId, "review.created", "review", id, { customerName: review.customerName });
}

export async function updateReview(session: AdminSession, payload: Record<string, unknown>) {
  const id = textValue(payload.id, "a avaliação", 80);
  const review = validateReview(payload);
  const result = await getD1().prepare("UPDATE homepage_reviews SET customer_name = ?, location = ?, rating = ?, body = ?, product_name = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(review.customerName, review.location, review.rating, review.body, review.productName, review.active ? 1 : 0, id).run();
  if (!result.meta.changes) throw new Error("Avaliação não encontrada.");
  await writeAudit(session.userId, "review.updated", "review", id, { customerName: review.customerName });
}

export async function setReviewActive(session: AdminSession, reviewId: string, active: boolean) {
  const result = await getD1().prepare("UPDATE homepage_reviews SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(active ? 1 : 0, reviewId).run();
  if (!result.meta.changes) throw new Error("Avaliação não encontrada.");
  await writeAudit(session.userId, active ? "review.published" : "review.hidden", "review", reviewId);
}

export async function reorderReviews(session: AdminSession, orderedIds: unknown) {
  if (!Array.isArray(orderedIds) || orderedIds.length > 50 || orderedIds.some((id) => typeof id !== "string")) throw new Error("Ordem de avaliações inválida.");
  const ids = [...new Set(orderedIds as string[])];
  const total = await getD1().prepare("SELECT COUNT(*) AS total FROM homepage_reviews").first<{ total: number }>();
  if (ids.length !== Number(total?.total ?? 0)) throw new Error("Atualize a página e tente novamente.");
  await getD1().batch(ids.map((id, index) => getD1().prepare("UPDATE homepage_reviews SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(index + 1, id)));
  await writeAudit(session.userId, "review.reordered", "review", null, { orderedIds: ids });
}

export async function deleteReview(session: AdminSession, reviewId: string) {
  const result = await getD1().prepare("DELETE FROM homepage_reviews WHERE id = ?").bind(reviewId).run();
  if (!result.meta.changes) throw new Error("Avaliação não encontrada.");
  await writeAudit(session.userId, "review.deleted", "review", reviewId);
}


/** Define quais joias aparecem como spoiler na tela de lançamento (até 6, na ordem escolhida). */
export async function saveLaunchTeasers(session: AdminSession, value: unknown) {
  const ids = Array.isArray(value) ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))] : [];
  if (ids.length > MAX_LAUNCH_TEASERS) throw new Error(`Escolha no máximo ${MAX_LAUNCH_TEASERS} joias para o spoiler.`);
  const d1 = getD1();
  if (ids.length) {
    const found = await d1.prepare(`SELECT id FROM products WHERE active = 1 AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: string }>();
    if (found.results.length !== ids.length) throw new Error("Uma das joias escolhidas não está mais ativa. Atualize a página.");
  }
  await d1.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind(LAUNCH_TEASER_SETTING, JSON.stringify(ids))
    .run();
  await writeAudit(session.userId, "launch.teasers_updated", "site_settings", LAUNCH_TEASER_SETTING, { count: ids.length });
}

export async function sendLaunchTest(session: AdminSession) {
  await sendLaunchTestEmail(session.email);
  await writeAudit(session.userId, "launch.test_email_sent", "launch", "test");
}
