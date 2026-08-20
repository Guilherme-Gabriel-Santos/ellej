import { getD1 } from "./store";

type Row = Record<string, unknown>;
type Variant = { id: string; size: string; color: string; material: string; sku: string; priceCents: number; stock: number; active: boolean };

export type CatalogItem = {
  id: string;
  groupId: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImages: string[];
  videoLink: string;
  availability: "in_stock" | "out_of_stock";
  price: string;
  brand: string;
  gtin: string;
  mpn: string;
  category: string;
  color: string;
  size: string;
  material: string;
  ageGroup: string;
  gender: string;
};

function parsed<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
}

function absolute(origin: string, value: string) {
  if (!value.trim()) return "";
  try { return new URL(value, origin).toString(); } catch { return ""; }
}

function validGtin(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : "";
}

export async function catalogItems(origin: string) {
  const result = await getD1().prepare("SELECT id, slug, name, category, description, material, image, video, media, catalog_data, variants, track_stock, price_cents, stock FROM products WHERE active = 1 AND visibility = 'visible' AND price_visible = 1 ORDER BY created_at, id").all();
  return (result.results as Row[]).flatMap((row): CatalogItem[] => {
    const catalog = parsed<Record<string, unknown>>(row.catalog_data, {});
    const variants = parsed<Variant[]>(row.variants, []).filter((item) => item.active);
    const media = parsed<Array<{ type: string; url: string }>>(row.media, []);
    const imageLink = absolute(origin, String(row.image ?? ""));
    if (!imageLink) return [];
    const additionalImages = media.filter((item) => item.type === "image" && item.url !== row.image).map((item) => absolute(origin, item.url)).filter(Boolean).slice(0, 10);
    const videoLink = absolute(origin, media.find((item) => item.type === "video")?.url || String(row.video ?? ""));
    const base = {
      groupId: String(row.id).slice(0, 50),
      description: String(row.description).slice(0, 5000),
      link: `${origin}/produtos/${encodeURIComponent(String(row.slug))}`,
      imageLink,
      additionalImages,
      videoLink,
      brand: String(catalog.brand || "Elle Jew"),
      gtin: validGtin(catalog.barcode),
      mpn: String(catalog.mpn || catalog.sku || row.id),
      category: String(row.category),
      ageGroup: String(catalog.ageGroup || "adult"),
      gender: String(catalog.gender || "female"),
    };
    if (variants.length) return variants.map((variant) => ({
      ...base,
      id: `${String(row.id)}-${variant.id}`.slice(0, 50),
      title: `${String(row.name)}${[variant.size, variant.color, variant.material].filter(Boolean).length ? ` - ${[variant.size, variant.color, variant.material].filter(Boolean).join(" / ")}` : ""}`.slice(0, 150),
      availability: !Number(row.track_stock) || Number(variant.stock) > 0 ? "in_stock" : "out_of_stock",
      price: `${(Number(variant.priceCents || row.price_cents) / 100).toFixed(2)} BRL`,
      gtin: "",
      mpn: variant.sku || base.mpn,
      color: variant.color || "",
      size: variant.size || "",
      material: variant.material || String(row.material),
    }));
    return [{
      ...base,
      id: String(row.id).slice(0, 50),
      title: String(row.name).slice(0, 150),
      availability: !Number(row.track_stock) || Number(row.stock) > 0 ? "in_stock" : "out_of_stock",
      price: `${(Number(row.price_cents) / 100).toFixed(2)} BRL`,
      color: "",
      size: "",
      material: String(row.material),
    }];
  });
}

export function xml(value: unknown) {
  return String(value ?? "").replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character]!);
}

export function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}
