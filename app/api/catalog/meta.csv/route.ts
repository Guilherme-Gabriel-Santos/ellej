import { catalogItems, csv } from "../../../../lib/catalog-feed";
import { ensureStoreSchema } from "../../../../lib/store";

export async function GET(request: Request) {
  await ensureStoreSchema();
  const items = await catalogItems(new URL(request.url).origin);
  const headers = ["id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link", "brand", "google_product_category", "item_group_id", "color", "size", "material", "age_group", "gender", "gtin", "mpn"];
  const rows = items.map((item) => [item.id, item.title, item.description, item.availability.replace(/_/g, " "), "new", item.price, item.salePrice, item.link, item.imageLink, item.brand, "Apparel & Accessories > Jewelry", item.groupId !== item.id ? item.groupId : "", item.color, item.size, item.material, item.ageGroup, item.gender, item.gtin, item.gtin ? "" : item.mpn].map(csv).join(","));
  return new Response([headers.join(","), ...rows].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "inline; filename=elle-jew-meta.csv", "Cache-Control": "public, max-age=300" } });
}
