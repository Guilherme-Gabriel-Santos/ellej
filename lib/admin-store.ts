import { getD1 } from "./store";
import { writeAudit, type AdminSession } from "./admin-auth";
import { isOrderStatus, transitionOrderStatus } from "./order-status";

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
  try { catalogData = JSON.parse(String(row.catalog_data ?? "{}")); } catch { catalogData = {}; }
  try { variants = JSON.parse(String(row.variants ?? "[]")); } catch { variants = []; }
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
    visibility: String(row.visibility ?? "visible"),
    trackStock: Boolean(Number(row.track_stock ?? 1)),
    priceVisible: Boolean(Number(row.price_visible ?? 1)),
    freeShipping: Boolean(Number(row.free_shipping ?? 0)),
    badge: row.badge ? String(row.badge) : "",
    priceCents: Number(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    stock: Number(row.stock),
    active: Boolean(Number(row.active)),
    featured: Boolean(Number(row.featured)),
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
  const d1 = getD1();
  const [productsResult, categoriesResult, productCategoriesResult, bannersResult, ordersResult, itemsResult, subscribersResult, allCategoryImageResult] = await Promise.all([
    d1.prepare("SELECT id, slug, name, category, description, material, image, video, media, catalog_data, variants, visibility, track_stock, price_visible, free_shipping, badge, price_cents, compare_at_cents, stock, active, featured, created_at FROM products ORDER BY active DESC, featured DESC, created_at DESC, name").all(),
    d1.prepare("SELECT c.id, c.name, c.slug, c.parent_id, c.image, c.active, c.sort_order, (SELECT COUNT(DISTINCT pc.product_id) FROM product_categories pc INNER JOIN categories assigned ON assigned.id = pc.category_id WHERE assigned.id = c.id OR assigned.parent_id = c.id) AS product_count FROM categories c ORDER BY c.sort_order, c.name").all(),
    d1.prepare("SELECT product_id, category_id FROM product_categories ORDER BY created_at, category_id").all(),
    d1.prepare("SELECT id, title, subtitle, image, link_url, link_label, focal_x, focal_y, active, sort_order FROM homepage_banners ORDER BY sort_order, created_at, id").all(),
    d1.prepare("SELECT id, customer_name, email, phone, cpf, cep, address, address_number, neighborhood, complement, city, state, shipping_method, payment_method, subtotal_cents, shipping_cents, discount_cents, total_cents, status, superfrete_service_id, superfrete_service_name, superfrete_delivery_days, superfrete_quote_price_cents, superfrete_order_id, superfrete_protocol, superfrete_price_cents, superfrete_status, superfrete_tracking_code, superfrete_label_url, superfrete_updated_at, created_at FROM orders ORDER BY created_at DESC LIMIT 100").all(),
    d1.prepare("SELECT id, order_id, product_id, variant_id, variant_label, product_name, unit_price_cents, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 100) ORDER BY id").all(),
    d1.prepare("SELECT COUNT(*) AS total FROM subscribers").first<{ total: number }>(),
    d1.prepare("SELECT value FROM site_settings WHERE key = 'all_category_image'").first<{ value: string }>(),
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
    totalCents: Number(row.total_cents),
    status: String(row.status),
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
  return {
    products,
    categories: (categoriesResult.results as Row[]).map(normalizeCategory),
    banners: (bannersResult.results as Row[]).map(normalizeBanner),
    orders,
    allCategoryImage: allCategoryImageResult?.value ? String(allCategoryImageResult.value) : "",
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

const maxMediaPerProduct = 5;

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
    slug: slugify(textValue(payload.slug, "a URL", 80, false) || name),
    badge: textValue(payload.badge, "o selo", 50, false) || null,
    priceCents,
    compareAtCents,
    stock: variants.length ? variants.reduce((sum, item) => sum + item.stock, 0) : integerValue(payload.stock, "O estoque", 0, 100_000),
    trackStock: payload.trackStock !== false ? 1 : 0,
    priceVisible: payload.priceVisible !== false ? 1 : 0,
    freeShipping: payload.freeShipping === true ? 1 : 0,
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
  await d1.batch([
    d1.prepare("INSERT INTO products (id, slug, name, category, description, material, image, video, media, catalog_data, variants, visibility, track_stock, price_visible, free_shipping, badge, price_cents, compare_at_cents, stock, active, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, slug, product.name, categories.primaryName, product.description, product.material, product.image, product.video || null, JSON.stringify(product.media), JSON.stringify(product.catalogData), JSON.stringify(product.variants), product.visibility, product.trackStock, product.priceVisible, product.freeShipping, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active, product.featured),
    ...categories.ids.map((categoryId) => d1.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)").bind(id, categoryId)),
  ]);
  await writeAudit(session.userId, "product.created", "product", id, { name: product.name });
  return id;
}

export async function updateProduct(session: AdminSession, payload: ProductPayload) {
  const id = textValue(payload.id, "o produto", 80);
  const existing = await getD1().prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("Produto não encontrado.");
  const product = validateProduct(payload);
  const categories = await resolveProductCategories(product.categoryIds, product.category);
  const slug = await availableSlug(product.slug, id);
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE products SET slug = ?, name = ?, category = ?, description = ?, material = ?, image = ?, video = ?, media = ?, catalog_data = ?, variants = ?, visibility = ?, track_stock = ?, price_visible = ?, free_shipping = ?, badge = ?, price_cents = ?, compare_at_cents = ?, stock = ?, active = ?, featured = ? WHERE id = ?")
      .bind(slug, product.name, categories.primaryName, product.description, product.material, product.image, product.video || null, JSON.stringify(product.media), JSON.stringify(product.catalogData), JSON.stringify(product.variants), product.visibility, product.trackStock, product.priceVisible, product.freeShipping, product.badge, product.priceCents, product.compareAtCents, product.stock, product.active, product.featured, id),
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
