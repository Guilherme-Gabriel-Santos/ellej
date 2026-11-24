import { ensureStoreSchema, getD1 } from "../../lib/store";

function xml(value: unknown) {
  return String(value ?? "").replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]!);
}

export async function GET(request: Request) {
  await ensureStoreSchema();
  const origin = new URL(request.url).origin;
  const products = await getD1().prepare("SELECT slug, created_at FROM products WHERE active = 1 AND visibility = 'visible' ORDER BY sort_order, created_at")
    .all<{ slug: string; created_at: string }>();
  const pages = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/privacidade", priority: "0.3", changefreq: "yearly" },
    { path: "/termos", priority: "0.3", changefreq: "yearly" },
    { path: "/entrega", priority: "0.4", changefreq: "monthly" },
    { path: "/trocas-e-devolucoes", priority: "0.4", changefreq: "monthly" },
  ];
  const urls = [
    ...pages.map((page) => `<url><loc>${xml(`${origin}${page.path}`)}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`),
    ...products.results.map((product) => `<url><loc>${xml(`${origin}/produtos/${encodeURIComponent(product.slug)}`)}</loc><lastmod>${xml(new Date(`${product.created_at.replace(" ", "T")}Z`).toISOString())}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
