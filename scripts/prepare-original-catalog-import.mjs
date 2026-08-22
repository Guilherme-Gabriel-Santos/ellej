import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const auditPath = path.resolve(process.argv[2] ?? ".tmp/catalog-sync/original-catalog-audit.json");
const currentPath = path.resolve(process.argv[3] ?? ".tmp/catalog-sync/current-products.json");
const outputDirectory = path.resolve(process.argv[4] ?? ".tmp/catalog-sync");
const mediaDirectory = path.join(outputDirectory, "media");

const categoryIds = new Map([
  ["Coleção Lumière > Anéis", "cat_lumiere_aneis"],
  ["Coleção Lumière > Brincos", "cat_lumiere_brincos"],
  ["Coleção Lumière > Colares", "cat_lumiere_colares"],
  ["Coleção Lumière > Piercing", "cat_lumiere_piercing"],
  ["Coleção Lumière > Pulseiras", "cat_lumiere_pulseiras"],
  ["Coleção Lumière > Rivieiras", "cat_lumiere_rivieiras"],
  ["Prata 925 > Alianças", "cat_prata_aliancas"],
  ["Prata 925 > Anéis", "cat_prata_aneis"],
  ["Prata 925 > Brincos", "cat_prata_brincos"],
  ["Prata 925 > Colares", "cat_prata_colares"],
  ["Prata 925 > Moissanite", "cat_prata_moissanite"],
  ["Prata 925 > Pulseiras", "cat_prata_pulseiras"],
  ["Ródio > Alianças", "cat_rodio_aliancas"],
  ["Ródio > Anéis", "cat_rodio_aneis"],
  ["Ródio > Brincos", "cat_rodio_brincos"],
  ["Ródio > Colares", "cat_rodio_colares"],
  ["Ródio > Pulseiras", "cat_rodio_pulseiras"],
]);

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function mediaKey(sourceUrl) {
  const digest = createHash("sha256").update(sourceUrl).digest("hex");
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  const extension = new URL(sourceUrl).pathname.match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase() ?? "webp";
  return `${uuid}.${extension === "jpeg" ? "jpg" : extension}`;
}

function contentType(key) {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}

function primaryCategoryName(paths) {
  return paths[0]?.split(" > ").at(-1)?.trim() || "Joias";
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function mapConcurrent(items, concurrency, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return result;
}

async function downloadImage(upload) {
  if (await exists(upload.filePath)) return { ...upload, reused: true };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(upload.sourceUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ElleJewCatalogSync/1.0)" },
      redirect: "follow",
    });
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`Foto inválida: ${upload.sourceUrl}`);
      await writeFile(upload.filePath, bytes);
      return { ...upload, size: bytes.length, reused: false };
    }
    if (response.status !== 429) throw new Error(`Falha ${response.status} ao baixar ${upload.sourceUrl}`);
    await wait(1_500 * (attempt + 1));
  }
  throw new Error(`Limite de tentativas ao baixar ${upload.sourceUrl}`);
}

await mkdir(mediaDirectory, { recursive: true });
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const databaseOutput = JSON.parse(await readFile(currentPath, "utf8"));
const currentProducts = databaseOutput?.[0]?.results ?? [];
const currentById = new Map(currentProducts.map((product) => [product.id, product]));
const uploadsBySource = new Map();

for (const product of audit.products) {
  for (const sourceUrl of product.sourceImages) {
    const key = mediaKey(sourceUrl);
    uploadsBySource.set(sourceUrl, {
      sourceUrl,
      key,
      contentType: contentType(key),
      filePath: path.join(mediaDirectory, key),
      publicUrl: `/api/media?key=${key}`,
    });
  }
}

const downloadedUploads = await mapConcurrent([...uploadsBySource.values()], 6, downloadImage);
const uploadBySource = new Map(downloadedUploads.map((upload) => [upload.sourceUrl, upload]));
const statements = [];
const textStatements = [];
const reportProducts = [];

for (const product of audit.products) {
  const current = product.current ? currentById.get(product.current.id) : null;
  const productId = current?.id ?? `prd_import_${product.sourceSlug}`;
  const originalImages = product.sourceImages.map((sourceUrl) => uploadBySource.get(sourceUrl)?.publicUrl).filter(Boolean);
  const fallbackImages = originalImages.length ? [] : product.preservedImages;
  const existingMedia = (() => {
    try {
      return JSON.parse(current?.media || "[]");
    } catch {
      return [];
    }
  })();
  const existingVideos = existingMedia.filter((item) => item?.type === "video" && item.url);
  const media = [
    ...originalImages.map((url) => ({ type: "image", url })),
    ...fallbackImages.map((url) => ({ type: "image", url })),
    ...existingVideos,
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);
  const image = media.find((item) => item.type === "image")?.url ?? current?.image ?? "";
  const video = media.find((item) => item.type === "video")?.url ?? null;
  if (!image) throw new Error(`O produto ${product.name} ficou sem foto.`);

  const selectedCategoryIds = product.categoryPaths.map((category) => categoryIds.get(category)).filter(Boolean);
  if (!selectedCategoryIds.length) throw new Error(`Categoria não reconhecida em ${product.name}: ${product.categoryPaths.join(", ")}`);

  const values = [
    productId,
    product.sourceSlug,
    product.name,
    primaryCategoryName(product.categoryPaths),
    product.description,
    product.material,
    image,
    video,
    JSON.stringify(media),
    JSON.stringify(product.catalogData),
    JSON.stringify(product.variants),
    product.visibility,
    1,
    1,
    product.freeShipping ? 1 : 0,
    current?.badge ?? null,
    product.priceCents,
    product.compareAtCents,
    product.stock,
    product.active ? 1 : 0,
    current?.featured ?? 0,
  ];

  statements.push(`INSERT INTO products (id, slug, name, category, description, material, image, video, media, catalog_data, variants, visibility, track_stock, price_visible, free_shipping, badge, price_cents, compare_at_cents, stock, active, featured) VALUES (${values.map(sql).join(", ")}) ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, category = excluded.category, description = excluded.description, material = excluded.material, image = excluded.image, video = excluded.video, media = excluded.media, catalog_data = excluded.catalog_data, variants = excluded.variants, visibility = excluded.visibility, track_stock = excluded.track_stock, price_visible = excluded.price_visible, free_shipping = excluded.free_shipping, price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents, stock = excluded.stock, active = excluded.active;`);
  textStatements.push(`UPDATE products SET description = ${sql(product.description)}, material = ${sql(product.material)} WHERE id = ${sql(productId)} AND slug = ${sql(product.sourceSlug)};`);
  statements.push(`DELETE FROM product_categories WHERE product_id = ${sql(productId)};`);
  for (const categoryId of selectedCategoryIds) {
    statements.push(`INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (${sql(productId)}, ${sql(categoryId)});`);
  }
  reportProducts.push({
    id: productId,
    slug: product.sourceSlug,
    name: product.name,
    operation: current ? "update" : "insert",
    originalImages: originalImages.length,
    preservedImages: fallbackImages.length,
    preservedVideos: existingVideos.length,
    mediaCount: media.length,
    visibility: product.visibility,
    categoryIds: selectedCategoryIds,
  });
}

const report = {
  products: reportProducts.length,
  inserts: reportProducts.filter((product) => product.operation === "insert").length,
  updates: reportProducts.filter((product) => product.operation === "update").length,
  visible: reportProducts.filter((product) => product.visibility === "visible").length,
  hidden: reportProducts.filter((product) => product.visibility === "hidden").length,
  uniqueImageUploads: downloadedUploads.length,
  totalOriginalImageAssignments: reportProducts.reduce((total, product) => total + product.originalImages, 0),
  fallbackImageAssignments: reportProducts.reduce((total, product) => total + product.preservedImages, 0),
  preservedVideos: reportProducts.reduce((total, product) => total + product.preservedVideos, 0),
  maximumMediaPerProduct: Math.max(...reportProducts.map((product) => product.mediaCount)),
};

await writeFile(path.join(outputDirectory, "catalog-import.sql"), `${statements.join("\n")}\n`);
await writeFile(path.join(outputDirectory, "catalog-text-fix.sql"), `${textStatements.join("\n")}\n`);
await writeFile(path.join(outputDirectory, "r2-uploads.json"), `${JSON.stringify(downloadedUploads, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "catalog-import-report.json"), `${JSON.stringify({ summary: report, products: reportProducts }, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
