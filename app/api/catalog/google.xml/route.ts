import { catalogItems, xml } from "../../../../lib/catalog-feed";
import { ensureStoreSchema } from "../../../../lib/store";

export async function GET(request: Request) {
  await ensureStoreSchema();
  const origin = new URL(request.url).origin;
  const items = await catalogItems(origin);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>
<title>Elle Jew</title><link>${xml(origin)}</link><description>Catálogo de joias Elle Jew</description>
${items.map((item) => `<item>
<g:id>${xml(item.id)}</g:id><g:title>${xml(item.title)}</g:title><g:description>${xml(item.description)}</g:description>
<g:link>${xml(item.link)}</g:link><g:image_link>${xml(item.imageLink)}</g:image_link>
${item.additionalImages.map((image) => `<g:additional_image_link>${xml(image)}</g:additional_image_link>`).join("")}${item.videoLink ? `<g:video_link>${xml(item.videoLink)}</g:video_link>` : ""}
<g:condition>new</g:condition><g:availability>${item.availability.replace(/_/g, " ")}</g:availability><g:price>${item.price}</g:price>${item.salePrice ? `<g:sale_price>${item.salePrice}</g:sale_price>` : ""}
<g:brand>${xml(item.brand)}</g:brand>${item.gtin ? `<g:gtin>${item.gtin}</g:gtin>` : `<g:mpn>${xml(item.mpn)}</g:mpn>`}
<g:google_product_category>Apparel &amp; Accessories &gt; Jewelry</g:google_product_category><g:product_type>${xml(item.category)}</g:product_type>
${item.groupId !== item.id ? `<g:item_group_id>${xml(item.groupId)}</g:item_group_id>` : ""}${item.color ? `<g:color>${xml(item.color)}</g:color>` : ""}${item.size ? `<g:size>${xml(item.size)}</g:size>` : ""}<g:material>${xml(item.material)}</g:material><g:age_group>${xml(item.ageGroup)}</g:age_group><g:gender>${xml(item.gender)}</g:gender>
</item>`).join("\n")}
</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
