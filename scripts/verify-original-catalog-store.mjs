import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://elle-jew-loja.ellejew-brasil.workers.dev";
const auditPath = path.resolve(process.argv[2] ?? ".tmp/catalog-sync/original-catalog-audit.json");
const reportPath = path.resolve(process.argv[3] ?? ".tmp/catalog-sync/catalog-import-report.json");

function mediaUrl(sourceUrl) {
  const digest = createHash("sha256").update(sourceUrl).digest("hex");
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  const extension = new URL(sourceUrl).pathname.match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase() ?? "webp";
  return `/api/media?key=${uuid}.${extension === "jpeg" ? "jpg" : extension}`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function mapConcurrent(items, concurrency, mapper) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const response = await fetch(`${baseUrl}/api/store?catalog-verification=${Date.now()}`, {
  headers: { accept: "application/json", "cache-control": "no-cache" },
});
if (!response.ok) throw new Error(`A API da loja respondeu ${response.status}.`);
const store = await response.json();
const currentBySlug = new Map(store.products.map((product) => [product.slug, product]));
const reportBySlug = new Map(report.products.map((product) => [product.slug, product]));
const visibleSource = audit.products.filter((product) => product.active);
const errors = [];

for (const source of visibleSource) {
  const current = currentBySlug.get(source.sourceSlug);
  const imported = reportBySlug.get(source.sourceSlug);
  if (!current || !imported) {
    errors.push(`${source.sourceSlug}: produto ausente`);
    continue;
  }
  const expectedImages = source.sourceImages.map(mediaUrl);
  const actualImages = current.media.filter((item) => item.type === "image").map((item) => item.url);
  const checks = [
    [current.name === source.name, "nome"],
    [current.description === source.description, "descrição"],
    [current.material === source.material, "material"],
    [current.priceCents === source.priceCents, "preço"],
    [current.compareAtCents === source.compareAtCents, "preço anterior"],
    [current.stock === source.stock, "estoque"],
    [same(current.catalogData, source.catalogData), "dados comerciais"],
    [same(current.variants, source.variants), "variações"],
    [same(current.categoryIds.slice().sort(), imported.categoryIds.slice().sort()), "categorias"],
    [same(actualImages, expectedImages), "galeria"],
    [current.media.length === imported.mediaCount, "quantidade de mídias"],
  ];
  for (const [valid, field] of checks) {
    if (!valid) errors.push(`${source.sourceSlug}: divergência em ${field}`);
  }
}

if (errors.length) throw new Error(`Falha na comparação:\n- ${errors.join("\n- ")}`);

const imageUrls = [...new Set(visibleSource.flatMap((product) => product.sourceImages.map(mediaUrl)))];
let checkedImages = 0;
await mapConcurrent(imageUrls, 10, async (url) => {
  const imageResponse = await fetch(`${baseUrl}${url}`, { headers: { range: "bytes=0-0" } });
  if (![200, 206].includes(imageResponse.status)) throw new Error(`A foto ${url} respondeu ${imageResponse.status}.`);
  if (!(imageResponse.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`A foto ${url} não retornou um formato de imagem.`);
  }
  await imageResponse.arrayBuffer();
  checkedImages += 1;
  if (checkedImages % 25 === 0 || checkedImages === imageUrls.length) {
    console.log(`Fotos verificadas: ${checkedImages}/${imageUrls.length}`);
  }
});

console.log(JSON.stringify({
  sourceProducts: audit.summary.sourceProducts,
  visibleProductsCompared: visibleSource.length,
  hiddenProductsCheckedInD1: audit.summary.sourceProducts - visibleSource.length,
  originalImagesServed: imageUrls.length,
  storefrontProducts: store.products.length,
}, null, 2));
