import type { Metadata } from "next";
import { Storefront } from "../../Storefront";
import { ensureStoreSchema, getD1, publicStore, readStore } from "../../../lib/store";

type PageProps = { params: Promise<{ slug: string }> | { slug: string } };

async function productForSlug(slug: string) {
  await ensureStoreSchema();
  const row = await getD1().prepare("SELECT slug, name, description, image, catalog_data FROM products WHERE slug = ? AND active = 1 AND visibility != 'hidden' LIMIT 1").bind(slug).first<{ slug: string; name: string; description: string; image: string; catalog_data: string }>();
  if (!row) return null;
  let catalog: Record<string, unknown> = {};
  try { catalog = JSON.parse(row.catalog_data || "{}"); } catch { catalog = {}; }
  return { ...row, catalog };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await productForSlug(slug);
  if (!product) return { title: "Produto não encontrado | Elle Jew" };
  const title = String(product.catalog.seoTitle || `${product.name} | Elle Jew`);
  const description = String(product.catalog.seoDescription || product.description).slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: { title, description, type: "website", images: [product.image] },
    twitter: { card: "summary_large_image", title, description, images: [product.image] },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  let initialStore: Awaited<ReturnType<typeof publicStore>> | undefined;
  try {
    await ensureStoreSchema();
    initialStore = publicStore(await readStore(crypto.randomUUID(), slug));
  } catch {
    // The client can retry the product API if the server-side catalog is unavailable.
  }
  return <Storefront initialProductSlug={slug} initialStore={initialStore ? { ...initialStore, account: null } : undefined} />;
}
