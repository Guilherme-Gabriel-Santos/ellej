import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.argv[2];
const outputDirectory = path.resolve(process.argv[3] ?? ".tmp/catalog-sync");

if (!sourcePath) {
  throw new Error("Informe o caminho do CSV exportado pela Nuvemshop.");
}

function parseCsv(input, delimiter = ";") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift() ?? [];
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function decodeHtml(value) {
  const named = {
    Aacute: "Á",
    Acirc: "Â",
    Agrave: "À",
    Atilde: "Ã",
    Ccedil: "Ç",
    Eacute: "É",
    Ecirc: "Ê",
    Iacute: "Í",
    Oacute: "Ó",
    Ocirc: "Ô",
    Otilde: "Õ",
    Uacute: "Ú",
    amp: "&",
    aacute: "á",
    acirc: "â",
    agrave: "à",
    atilde: "ã",
    apos: "'",
    bull: "•",
    ccedil: "ç",
    eacute: "é",
    ecirc: "ê",
    gt: ">",
    iacute: "í",
    ldquo: "“",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    oacute: "ó",
    ocirc: "ô",
    otilde: "õ",
    quot: '"',
    rdquo: "”",
    uacute: "ú",
  };
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    if (token[0] === "#") {
      const hexadecimal = token[1]?.toLowerCase() === "x";
      return String.fromCodePoint(Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return named[token] ?? named[token.toLowerCase()] ?? entity;
  });
}

function plainText(value) {
  return decodeHtml(String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br|hr)\b[^>]*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(?:p|div|li|h[1-6]|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function baseSlug(value) {
  return String(value ?? "").replace(/-[a-z0-9]{5}$/, "");
}

function numberValue(value, fallback = 0) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cents(value) {
  return Math.round(numberValue(value) * 100);
}

function visibilityOf(row) {
  return row.Visibilidade === "Oculto" || row["Exibir na loja"] === "NÃO" ? "hidden" : "visible";
}

function categoryPaths(value) {
  return String(value ?? "").split(/,\s*(?=[^,]+\s>\s)/).map((item) => item.trim()).filter(Boolean);
}

function variantOf(row, index, defaultPrice) {
  const values = [1, 2, 3].map((position) => ({
    name: row[`Nome da variação ${position}`]?.trim() ?? "",
    value: row[`Valor da variação ${position}`]?.trim() ?? "",
  })).filter((item) => item.value);
  if (!values.length) return null;

  const variant = {
    id: `var_import_${createHash("sha256").update(`${row["Identificador URL"]}:${index}:${values.map((item) => item.value).join(":")}`).digest("hex").slice(0, 20)}`,
    size: "",
    color: "",
    material: "",
    sku: row.SKU?.trim() ?? "",
    priceCents: cents(row["Preço promocional"] || row.Preço) || defaultPrice,
    stock: Math.max(0, Math.trunc(numberValue(row.Estoque))),
    active: true,
  };

  for (const item of values) {
    const property = normalize(item.name);
    if (property.includes("cor")) variant.color = item.value;
    else if (property.includes("tamanho") || property.includes("aro")) variant.size = item.value;
    else variant.material = [variant.material, item.value].filter(Boolean).join(" • ");
  }
  return variant;
}

function inferMaterial(product) {
  const content = normalize(`${product.name} ${product.description}`);
  const parts = [];
  if (content.includes("prata 925") || product.categoryPaths.some((item) => item.startsWith("Prata 925") || item.startsWith("Coleção Lumière") || item.startsWith("Ródio"))) {
    parts.push(content.includes("banho de rodio") || product.categoryPaths.some((item) => item.startsWith("Ródio")) ? "Prata 925 com banho de ródio" : "Prata 925");
  }
  const stones = [
    ["moissanite", "Moissanite"],
    ["zirconia", "Zircônias"],
    ["esmeralda", "Esmeralda"],
    ["kunzita", "Kunzita"],
    ["turmalina", "Turmalina"],
    ["topazio", "Topázio"],
    ["ametista", "Ametista"],
  ];
  for (const [needle, label] of stones) {
    if (content.includes(needle)) parts.push(label);
  }
  return [...new Set(parts)].join(" • ") || "Joia Elle Jew";
}

function productFromRows(rows) {
  const primary = rows.find((row) => row.Nome?.trim()) ?? rows[0];
  const regularPrice = cents(primary.Preço);
  const promotionalPrice = cents(primary["Preço promocional"]);
  const priceCents = promotionalPrice || regularPrice;
  const variants = rows.map((row, index) => variantOf(row, index, priceCents)).filter(Boolean);
  const description = plainText(primary.Descrição) || primary["Descrição para SEO"]?.trim() || `${primary.Nome} da curadoria Elle Jew.`;
  const product = {
    sourceSlug: primary["Identificador URL"].trim(),
    name: primary.Nome.trim(),
    categoryPaths: categoryPaths(primary.Categorias),
    description: description.slice(0, 3_000),
    priceCents,
    compareAtCents: promotionalPrice && regularPrice > promotionalPrice ? regularPrice : null,
    stock: variants.length ? variants.reduce((total, variant) => total + variant.stock, 0) : Math.max(0, Math.trunc(numberValue(primary.Estoque))),
    visibility: visibilityOf(primary),
    active: visibilityOf(primary) !== "hidden",
    freeShipping: primary["Frete gratis"] === "SIM",
    catalogData: {
      costCents: cents(primary.Custo),
      sku: variants.length ? "" : primary.SKU?.trim() ?? "",
      barcode: primary["Código de barras"]?.trim() ?? "",
      weightGrams: Math.max(1, Math.round(numberValue(primary["Peso (kg)"], 0.3) * 1_000)),
      lengthCm: Math.max(1, Math.round(numberValue(primary["Comprimento (cm)"], 18))),
      widthCm: Math.max(1, Math.round(numberValue(primary["Largura (cm)"], 18))),
      heightCm: Math.max(1, Math.round(numberValue(primary["Altura (cm)"], 6))),
      mpn: primary["MPN (Cód. Exclusivo Modelo Fabricante)"]?.trim() ?? "",
      ageGroup: normalize(primary["Faixa etária"]).includes("crianca") ? "kids" : "adult",
      gender: normalize(primary.Sexo).includes("mascul") ? "male" : normalize(primary.Sexo).includes("unissex") ? "unisex" : "female",
      tags: primary.Tags?.trim() ?? "",
      brand: primary.Marca?.trim() || "Elle Jew",
      seoTitle: (primary["Título para SEO"]?.trim() ?? "").slice(0, 70),
      seoDescription: (primary["Descrição para SEO"]?.trim() ?? "").slice(0, 160),
    },
    variants,
  };
  product.material = inferMaterial(product);
  return product;
}

function galleryImages(html) {
  const images = [];
  for (const match of html.matchAll(/<a\b[^>]*data-fancybox=["']product-gallery["'][^>]*>/gi)) {
    const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const decoded = decodeHtml(href);
    const url = decoded.startsWith("//") ? `https:${decoded}` : decoded;
    if (/^https:\/\/dcdn-[^/]+\.mitiendanube\.com\/stores\/[^/]+\/[^/]+\/[^/]+\/products\//i.test(url) && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) {
      images.push(url);
    }
  }
  if (!images.length) {
    const fallback = html.match(/<meta\s+property=["']og:image:secure_url["']\s+content=["']([^"']+)["']/i)?.[1];
    if (fallback) images.push(decodeHtml(fallback));
  }
  return [...new Set(images)];
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

function matchCurrentProduct(source, currentProducts) {
  const deterministicId = `prd_import_${source.sourceSlug}`;
  return currentProducts.find((product) => product.id === deterministicId)
    ?? currentProducts.find((product) => product.slug === source.sourceSlug)
    ?? currentProducts.find((product) => baseSlug(source.sourceSlug) === product.slug || baseSlug(product.slug) === baseSlug(source.sourceSlug))
    ?? currentProducts.find((product) => normalize(product.name) === normalize(source.name))
    ?? null;
}

function differences(source, current) {
  if (!current) return ["missing"];
  const result = [];
  if (source.sourceSlug !== current.slug) result.push("slug");
  if (source.name !== current.name) result.push("name");
  if (source.priceCents !== current.priceCents) result.push("price");
  if (source.compareAtCents !== current.compareAtCents) result.push("compareAtPrice");
  if (source.stock !== current.stock) result.push("stock");
  if (source.description !== current.description) result.push("description");
  if (source.material !== current.material) result.push("material");
  if (JSON.stringify(source.variants) !== JSON.stringify(current.variants ?? [])) result.push("variants");
  return result;
}

await mkdir(outputDirectory, { recursive: true });
const sourceBytes = await readFile(path.resolve(sourcePath));
const rows = parseCsv(new TextDecoder("windows-1252").decode(sourceBytes));
const groupedRows = new Map();
for (const row of rows) {
  const slug = row["Identificador URL"]?.trim();
  if (!slug) continue;
  const group = groupedRows.get(slug) ?? [];
  group.push(row);
  groupedRows.set(slug, group);
}

const products = [...groupedRows.values()].map(productFromRows).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
const currentResponse = await fetch("https://elle-jew-loja.ellejew-brasil.workers.dev/api/store", { headers: { accept: "application/json" } });
if (!currentResponse.ok) throw new Error(`Não foi possível consultar o catálogo atual (${currentResponse.status}).`);
const currentStore = await currentResponse.json();
try {
  const databaseOutput = JSON.parse(await readFile(path.join(outputDirectory, "current-products.json"), "utf8"));
  const databaseProducts = databaseOutput?.[0]?.results ?? [];
  if (databaseProducts.length) {
    currentStore.products = databaseProducts.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      material: product.material,
      image: product.image,
      media: JSON.parse(product.media || "[]"),
      variants: JSON.parse(product.variants || "[]"),
      priceCents: product.price_cents,
      compareAtCents: product.compare_at_cents,
      stock: product.stock,
      active: Boolean(product.active),
      visibility: product.visibility,
    }));
  }
} catch {
  // The public catalog is enough when no authenticated database snapshot exists.
}
const auditPath = path.join(outputDirectory, "original-catalog-audit.json");
let previousBySlug = new Map();
try {
  const previous = JSON.parse(await readFile(auditPath, "utf8"));
  previousBySlug = new Map((previous.products ?? []).map((product) => [product.sourceSlug, product]));
} catch {
  // The first run has no previous audit to reuse.
}

const audited = await mapConcurrent(products, 2, async (product) => {
  const pageUrl = `https://ellejew.com.br/produtos/${encodeURIComponent(product.sourceSlug)}/`;
  const previous = previousBySlug.get(product.sourceSlug);
  let pageStatus = previous?.pageStatus === 200 ? 200 : 0;
  let sourceImages = previous?.pageStatus === 200 ? previous.sourceImages ?? [] : [];
  if (pageStatus !== 200) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(pageUrl, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "Mozilla/5.0 (compatible; ElleJewCatalogSync/1.0)",
          },
          redirect: "follow",
        });
        pageStatus = response.status;
        if (response.ok) {
          sourceImages = galleryImages(await response.text());
          break;
        }
        if (response.status !== 429) break;
      } catch {
        pageStatus = 0;
      }
      await wait(2_000 * (attempt + 1));
    }
    await wait(600);
  }
  const current = matchCurrentProduct(product, currentStore.products ?? []);
  const preservedImages = !sourceImages.length && current?.image ? [current.image] : [];
  return {
    ...product,
    pageUrl,
    pageStatus,
    sourceImages,
    preservedImages,
    current: current ? { id: current.id, slug: current.slug, name: current.name, mediaCount: current.media?.length ?? 0 } : null,
    differences: differences(product, current),
  };
});

const joinedDescriptionPattern = /[\p{Ll}](?=\p{Lu})|[:;!?](?=\p{L})|\.(?=\p{Lu})/u;
const productsWithJoinedWords = audited.filter((product) => joinedDescriptionPattern.test(product.description));
if (productsWithJoinedWords.length) {
  throw new Error(`Descrições com possíveis palavras unidas: ${productsWithJoinedWords.map((product) => product.sourceSlug).join(", ")}`);
}

const summary = {
  sourceProducts: audited.length,
  sourceVisible: audited.filter((product) => product.active).length,
  matchedVisibleProducts: audited.filter((product) => product.current).length,
  missingOrHiddenProducts: audited.filter((product) => !product.current).length,
  pagesAvailable: audited.filter((product) => product.pageStatus === 200).length,
  pagesUnavailable: audited.filter((product) => product.pageStatus !== 200).length,
  productsWithImages: audited.filter((product) => product.sourceImages.length).length,
  productsWithoutImages: audited.filter((product) => !product.sourceImages.length).length,
  totalImages: audited.reduce((total, product) => total + product.sourceImages.length, 0),
  maximumImagesPerProduct: Math.max(0, ...audited.map((product) => product.sourceImages.length)),
  descriptionFormattingIssues: productsWithJoinedWords.length,
};

await writeFile(auditPath, `${JSON.stringify({ summary, products: audited }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log("\nProdutos sem página ou sem fotos:");
for (const product of audited.filter((item) => item.pageStatus !== 200 || !item.sourceImages.length)) {
  console.log(`- ${product.sourceSlug} | ${product.name} | página ${product.pageStatus || "indisponível"} | ${product.sourceImages.length} fotos`);
}
