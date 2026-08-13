"use client";

import { FormEvent, useEffect, useState } from "react";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categoryIds: string[];
  description: string;
  material: string;
  image: string;
  badge: string | null;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  featured: boolean;
};

type CartItem = Product & { quantity: number };
type Category = { id: string; name: string; slug: string; parentId: string | null; image: string | null };
type Banner = { id: string; title: string; subtitle: string; image: string; linkUrl: string | null; linkLabel: string | null };
type StoreData = { products: Product[]; categories: Category[]; banners: Banner[]; favoriteIds: string[]; cart: CartItem[] };
type Drawer = "cart" | "favorites" | null;
type Order = { id: string; totalCents: number; status: string; paymentMethod: string; checkoutUrl?: string };
type ShippingOption = { id: string; name: string; priceCents: number; deliveryDays: number };

const fallbackProducts: Product[] = [
  { id: "choker-coracoes", slug: "choker-5-coracoes", name: "Choker 5 Corações", category: "Colares", categoryIds: [], description: "Choker delicada em Prata 925 com 5 pingentes de coração cravejados em zircônias cristal. Ideal para usar sozinha ou compor mix de colares.", material: "Prata 925 • Zircônias premium", image: "/brand/choker-coracoes.webp", badge: "Mais desejado", priceCents: 55000, compareAtCents: null, stock: 3, featured: true },
  { id: "colar-ponto-luz", slug: "colar-ponto-luz", name: "Colar Ponto Luz", category: "Colares", categoryIds: [], description: "Colar clássico ponto de luz em Prata 925 com zircônia cristal de alta lapidação. Uma peça coringa e atemporal para o dia a dia.", material: "Prata 925 • Zircônia cristal", image: "/brand/colar-ponto-luz.webp", badge: "Best-seller", priceCents: 28500, compareAtCents: null, stock: 6, featured: true },
  { id: "conjunto-kunzita", slug: "conjunto-kunzita", name: "Conjunto Kunzita", category: "Conjuntos", categoryIds: [], description: "Conjunto de colar e brincos em Prata 925 com pedra kunzita rosa lapidada. Traz um toque delicado de cor com máxima sofisticação.", material: "Prata 925 • Kunzita criada", image: "/brand/conjunto-kunzita.webp", badge: "Edição limitada", priceCents: 29800, compareAtCents: null, stock: 4, featured: true },
  { id: "conjunto-ametista", slug: "conjunto-ametista", name: "Conjunto Ametista", category: "Conjuntos", categoryIds: [], description: "Conjunto em Prata 925 composto por colar e brincos com zircônias na cor ametista profunda. Design refinado e acabamento impecável.", material: "Prata 925 • Ametista criada", image: "/brand/conjunto-ametista.webp", badge: "Novo", priceCents: 29800, compareAtCents: null, stock: 5, featured: true },
  { id: "ear-cuff-medio", slug: "ear-cuff-medio", name: "Ear Cuff Médio", category: "Brincos", categoryIds: [], description: "Brinco Ear Cuff em Prata 925 cravejado com uma fileira ascendente de zircônias brilhantes. Não necessita de segundo furo.", material: "Prata 925 • Zircônias premium", image: "/brand/ear-cuff.webp", badge: "Últimas peças", priceCents: 19900, compareAtCents: 23500, stock: 2, featured: true },
];

const initialCheckout = {
  customerName: "",
  email: "",
  phone: "",
  cpf: "",
  cep: "",
  address: "",
  addressNumber: "",
  neighborhood: "",
  complement: "",
  city: "",
  state: "",
  shippingMethod: "",
  paymentMethod: "pix",
  coupon: "",
};

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const formatCep = (value: string) => onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const formatCpf = (value: string) => onlyDigits(value).slice(0, 11)
  .replace(/^(\d{3})(\d)/, "$1.$2")
  .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
  .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

function useCountdown() {
  const [label, setLabel] = useState("00:00:00");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const seconds = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
      const s = (seconds % 60).toString().padStart(2, "0");
      setLabel(`${h}:${m}:${s}`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return label;
}

export function Storefront() {
  const [store, setStore] = useState<StoreData>({ products: fallbackProducts, categories: [], banners: [], favoriteIds: [], cart: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState("Destaques");
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [checkout, setCheckout] = useState(initialCheckout);
  const [order, setOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newsletter, setNewsletter] = useState("");
  const [newsletterDone, setNewsletterDone] = useState(false);
  const [cepStatus, setCepStatus] = useState("");
  const [lastLookupCep, setLastLookupCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingStatus, setShippingStatus] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const countdown = useCountdown();

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStore(data);
      })
      .catch(() => setToast("A vitrine está visível, mas não foi possível sincronizar seus dados agora."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (store.banners.length < 2 || carouselPaused) return;
    const timer = window.setInterval(() => setBannerIndex((current) => (current + 1) % store.banners.length), 5500);
    return () => window.clearInterval(timer);
  }, [store.banners.length, carouselPaused]);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (!payment) return;
    const messages: Record<string, string> = {
      success: "Pagamento aprovado. Seu pedido já está sendo preparado.",
      pending: "Pagamento recebido e em análise. Avisaremos assim que for aprovado.",
      failure: "O pagamento não foi concluído. Seu carrinho continua disponível para tentar novamente.",
      expired: "O link de pagamento expirou. Volte ao carrinho para gerar um novo.",
    };
    const timer = window.setTimeout(
      () => setToast(messages[payment] ?? "Consulte a situação do pedido pelo WhatsApp."),
      0,
    );
    window.history.replaceState({}, "", window.location.pathname);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const locked = Boolean(drawer || selectedProduct || checkoutOpen);
    document.body.style.overflow = locked ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawer, selectedProduct, checkoutOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedProduct) setSelectedProduct(null);
      else if (drawer) setDrawer(null);
      else if (checkoutOpen && checkoutStep < 3) setCheckoutOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, selectedProduct, checkoutOpen, checkoutStep]);

  const cartCount = store.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = store.cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const couponDiscount = checkout.coupon.trim().toUpperCase() === "ELLE10" ? Math.round(subtotal * 0.1) : 0;
  const pixDiscount = checkout.paymentMethod === "pix" ? Math.round((subtotal - couponDiscount) * 0.05) : 0;
  const selectedShipping = shippingOptions.find((option) => option.id === checkout.shippingMethod);
  const shipping = subtotal >= 39900 ? 0 : selectedShipping?.priceCents ?? 0;
  const total = subtotal - couponDiscount - pixDiscount + shipping;
  const favoriteProducts = store.products.filter((product) => store.favoriteIds.includes(product.id));
  const rootCategories = store.categories.filter((item) => !item.parentId);
  const selectedRoot = rootCategories.find((item) => item.id === category);
  const selectedSubcategory = store.categories.find((item) => item.id === category && item.parentId);
  const activeRootId = selectedRoot?.id ?? selectedSubcategory?.parentId ?? null;
  const subcategories = activeRootId ? store.categories.filter((item) => item.parentId === activeRootId) : [];
  const categoryIds = category === "Todos" || category === "Destaques"
    ? null
    : selectedRoot
      ? new Set([selectedRoot.id, ...store.categories.filter((item) => item.parentId === selectedRoot.id).map((item) => item.id)])
      : new Set([category]);
  const filteredProducts = store.products.filter((product) => {
    const categoryMatch = !categoryIds || product.categoryIds.some((id) => categoryIds.has(id));
    const productCategoryNames = store.categories.filter((item) => product.categoryIds.includes(item.id)).map((item) => item.name).join(" ");
    const searchMatch = `${product.name} ${product.category} ${productCategoryNames} ${product.material}`.toLowerCase().includes(search.toLowerCase());
    return categoryMatch && searchMatch;
  });
  const featuredProducts = store.products.filter((product) => product.featured);
  const displayedProducts = search.trim()
    ? filteredProducts
    : category === "Destaques"
      ? (featuredProducts.length ? featuredProducts : store.products).slice(0, 8)
      : filteredProducts;
  const selectedCategoryName = category === "Destaques"
    ? "Destaques da Elle"
    : category === "Todos"
      ? "Todas as joias"
      : store.categories.find((item) => item.id === category)?.name ?? "Joias";
  const categoryImage = (item: Category) => {
    if (item.image) return item.image;
    const childIds = new Set([item.id, ...store.categories.filter((child) => child.parentId === item.id).map((child) => child.id)]);
    return store.products.find((product) => product.categoryIds.some((id) => childIds.has(id)))?.image ?? "/brand/editorial-silver.webp";
  };
  function chooseCategory(categoryId: string) {
    setCategory(categoryId);
    setSearch("");
    window.setTimeout(() => document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function post(payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
      return data;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("O pagamento demorou para responder. Tente novamente em alguns instantes.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function toggleFavorite(product: Product) {
    setBusy(`favorite-${product.id}`);
    try {
      const data = await post({ action: "favorite", productId: product.id });
      setStore(data.store);
      const added = data.store.favoriteIds.includes(product.id);
      setToast(added ? `${product.name} foi salvo nos favoritos.` : `${product.name} saiu dos favoritos.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível atualizar os favoritos.");
    } finally {
      setBusy(null);
    }
  }

  async function setCartQuantity(product: Product, quantity: number, open = false) {
    setBusy(`cart-${product.id}`);
    try {
      const data = await post({ action: "cart", productId: product.id, quantity });
      setStore(data.store);
      if (quantity > 0) setToast(`${product.name} está na sua sacola.`);
      if (open) {
        setSelectedProduct(null);
        setDrawer("cart");
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível atualizar a sacola.");
    } finally {
      setBusy(null);
    }
  }

  function addToCart(product: Product, open = true) {
    const current = store.cart.find((item) => item.id === product.id)?.quantity ?? 0;
    return setCartQuantity(product, current + 1, open);
  }

  function openCheckout() {
    if (!store.cart.length) {
      setToast("Escolha ao menos uma joia para continuar.");
      return;
    }
    setDrawer(null);
    setCheckoutStep(1);
    setOrder(null);
    setCheckoutOpen(true);
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    setCheckoutError(null);
    setBusy("checkout");
    try {
      const data = await post({ action: "checkout", ...checkout });
      setOrder(data.order);
      setStore(data.store);
      if (data.order.checkoutUrl) {
        window.location.assign(data.order.checkoutUrl);
        return;
      }
      setCheckoutStep(3);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar seu pedido.";
      setCheckoutError(message);
      setToast(message);
    } finally {
      setBusy(null);
    }
  }

  async function lookupCheckoutCep(value = checkout.cep) {
    const cep = onlyDigits(value);
    if (cep.length !== 8 || cep === lastLookupCep) return;
    setLastLookupCep(cep);
    setCepStatus("Buscando endereço…");
    try {
      const data = await post({ action: "lookupCep", cep });
      setCheckout((current) => ({
        ...current,
        cep: formatCep(cep),
        address: data.address.address || current.address,
        neighborhood: data.address.neighborhood || current.neighborhood,
        city: data.address.city,
        state: data.address.state,
      }));
      setCepStatus("Endereço localizado.");
      await lookupShipping(cep);
    } catch (error) {
      setLastLookupCep("");
      setCepStatus(error instanceof Error ? error.message : "CEP não encontrado.");
    }
  }

  async function lookupShipping(value: string) {
    const cep = onlyDigits(value);
    if (cep.length !== 8) return;
    setShippingStatus("Calculando as melhores opções…");
    setShippingOptions([]);
    setCheckout((current) => ({ ...current, shippingMethod: "" }));
    try {
      const data = await post({ action: "shippingQuote", cep });
      const options = data.options as ShippingOption[];
      setShippingOptions(options);
      setCheckout((current) => ({ ...current, shippingMethod: options[0]?.id ?? "" }));
      setShippingStatus(options.length ? "Valores e prazos calculados pelo SuperFrete." : "Nenhuma modalidade disponível para este CEP.");
    } catch (error) {
      setShippingStatus(error instanceof Error ? error.message : "Não foi possível calcular o frete.");
    }
  }

  async function submitNewsletter(event: FormEvent) {
    event.preventDefault();
    setBusy("newsletter");
    try {
      await post({ action: "subscribe", email: newsletter });
      setNewsletterDone(true);
      setNewsletter("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Confira o seu e-mail.");
    } finally {
      setBusy(null);
    }
  }

  const updateCheckout = (field: keyof typeof checkout, value: string) =>
    setCheckout((current) => ({ ...current, [field]: value }));

  return (
    <main>
      <div className="announcement">
        <span>Frete grátis acima de R$399</span>
        <span className="announcement-dot">◆</span>
        <span>Condição de hoje encerra em <strong>{countdown}</strong></span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Elle Jew — início">
          <img src="/brand/logo.webp" alt="Elle Jew" />
        </a>
        <nav aria-label="Navegação principal">
          <a href="#colecao">Coleção</a>
          <a href="#editorial">Editorial</a>
          <a href="#sobre">Nossa essência</a>
        </nav>
        <div className="header-actions">
          <button className="text-action" onClick={() => document.querySelector<HTMLInputElement>("#busca-produtos")?.focus()} aria-label="Buscar produtos">Buscar</button>
          <button className="icon-action" onClick={() => setDrawer("favorites")} aria-label={`Favoritos: ${store.favoriteIds.length} itens`}>
            <span aria-hidden="true">♡</span><em>{store.favoriteIds.length}</em>
          </button>
          <button className="bag-action" onClick={() => setDrawer("cart")} aria-label={`Sacola: ${cartCount} itens`}>
            Sacola <strong>{cartCount}</strong>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Prata 925 Legítima • Garantia Vitalícia</p>
          <h1>Realce sua beleza<br /><em>em todos os momentos.</em></h1>
          <p className="hero-lead">Joias delicadas em Prata 925 com zircônias de alta lapidação. Acabamento impecável, brilho duradouro e pronta entrega para todo o Brasil.</p>
          <div className="hero-ctas">
            <a className="button button-primary" href="#colecao">Ver Coleção Completa</a>
            <button className="button button-ghost" onClick={() => setSelectedProduct(store.products[0])}>Ver Mais Vendidos</button>
          </div>
          <div className="hero-proof">
            <div className="avatars" aria-hidden="true"><span>E</span><span>J</span><span>★</span></div>
            <p><strong>Mais de 1.500 clientes satisfeitas</strong><br />em todo o Brasil</p>
          </div>
        </div>
        <div className="hero-visual" aria-roledescription="carrossel" aria-label="Fotos da coleção" onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onFocus={() => setCarouselPaused(true)} onBlur={() => setCarouselPaused(false)}>
          {(store.banners.length ? store.banners : [{ id: "fallback", image: "/brand/hero.webp", title: "", subtitle: "", linkUrl: null, linkLabel: null }]).map((banner, index, photos) => <img key={banner.id} className={`hero-slide ${index === bannerIndex % photos.length ? "active" : ""}`} src={banner.image} alt={index === bannerIndex % photos.length ? "Modelo usando joias Elle Jew" : ""} aria-hidden={index !== bannerIndex % photos.length} />)}
          <div className="hero-card">
            <span>Destaques da Semana</span>
            <strong>Rivieras e Pontos de Luz</strong>
            <a href="#colecao">Ver destaques →</a>
          </div>
          <div className="hero-seal"><span>925</span>prata de lei</div>
          {store.banners.length > 1 && <><button className="hero-gallery-arrow previous" onClick={() => setBannerIndex((bannerIndex - 1 + store.banners.length) % store.banners.length)} aria-label="Foto anterior">‹</button><button className="hero-gallery-arrow next" onClick={() => setBannerIndex((bannerIndex + 1) % store.banners.length)} aria-label="Próxima foto">›</button><div className="hero-gallery-dots" aria-label="Escolher foto">{store.banners.map((banner, index) => <button key={banner.id} className={index === bannerIndex % store.banners.length ? "active" : ""} onClick={() => setBannerIndex(index)} aria-label={`Mostrar foto ${index + 1}`} />)}</div></>}
        </div>
      </section>

      <section className="trust-strip" aria-label="Benefícios da loja">
        <div><strong>Prata 925 Legítima</strong><span>Garantia vitalícia no metal</span></div>
        <div><strong>Envio Rápido 24h</strong><span>Para produtos em estoque</span></div>
        <div><strong>Pagamento Facilitado</strong><span>Até 6x sem juros ou 5% OFF no Pix</span></div>
        <div><strong>Troca Fácil e Grátis</strong><span>Até 7 dias após receber</span></div>
      </section>

      <section className="category-showcase section" aria-labelledby="category-showcase-title">
        <div className="section-heading category-showcase-heading">
          <div><p className="eyebrow dark">Encontre seu estilo</p><h2 id="category-showcase-title">Compre por categoria.</h2></div>
          <p className="section-intro">Escolha uma coleção para ver somente as peças que combinam com o que você procura.</p>
        </div>
        <div className="category-card-grid">
          <button className="category-card" onClick={() => chooseCategory("Todos")}>
            <img src={store.products[0]?.image ?? "/brand/editorial-gold.webp"} alt="Seleção de joias Elle Jew" />
            <span><small>Descubra toda a coleção</small><strong>Todas as joias</strong><em>Ver tudo</em></span>
          </button>
          {rootCategories.map((item) => (
            <button className="category-card" key={item.id} onClick={() => chooseCategory(item.id)}>
              <img src={categoryImage(item)} alt={`Categoria ${item.name}`} />
              <span><small>Curadoria Elle Jew</small><strong>{item.name}</strong><em>Ver {item.name.toLocaleLowerCase("pt-BR")}</em></span>
            </button>
          ))}
        </div>
      </section>

      <section className="collection section" id="colecao">
        <div className="section-heading">
          <div>
            <p className="eyebrow dark">Curadoria da vez</p>
            <h2>{selectedCategoryName}</h2>
          </div>
          <p className="section-intro">Colares, brincos e conjuntos cravejados com zircônias cristal de alta lapidação. Frete grátis para compras acima de R$399.</p>
        </div>

        <div className="shop-tools">
          <div className="category-tabs" aria-label="Filtrar por categoria">
            <button className={category === "Destaques" ? "active" : ""} onClick={() => setCategory("Destaques")}>Destaques</button>
            <button className={category === "Todos" ? "active" : ""} onClick={() => setCategory("Todos")}>Todos</button>
            {rootCategories.map((item) => (
              <button key={item.id} className={activeRootId === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>{item.name}</button>
            ))}
          </div>
          {subcategories.length > 0 && <div className="category-tabs subcategory-tabs" aria-label="Filtrar por subcategoria">
            <button className={selectedRoot ? "active" : ""} onClick={() => setCategory(activeRootId!)}>Ver tudo</button>
            {subcategories.map((item) => <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>{item.name}</button>)}
          </div>}
          <label className="search-box" htmlFor="busca-produtos">
            <span>⌕</span>
            <input id="busca-produtos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar joia ou material..." />
          </label>
        </div>

        {loading && <div className="loading-line" aria-label="Carregando produtos" />}
        <div className="product-grid">
          {displayedProducts.map((product) => {
            const favorite = store.favoriteIds.includes(product.id);
            return (
              <article className="product-card" key={product.id}>
                <div className="product-media">
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                  <button className={`heart-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(product)} disabled={busy === `favorite-${product.id}`} aria-label={favorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}>{favorite ? "♥" : "♡"}</button>
                  <button className="product-image-button" onClick={() => setSelectedProduct(product)} aria-label={`Ver detalhes de ${product.name}`}>
                    <img src={product.image} alt={product.name} />
                  </button>
                  <button className="quick-add" onClick={() => addToCart(product)} disabled={busy === `cart-${product.id}` || product.stock < 1}>{busy === `cart-${product.id}` ? "Adicionando…" : "Adicionar à sacola"}</button>
                </div>
                <div className="product-info">
                  <div><span>{product.category}</span><button onClick={() => setSelectedProduct(product)}>Detalhes +</button></div>
                  <h3>{product.name}</h3>
                  <p className="product-price">
                    {product.compareAtCents && <del>{money(product.compareAtCents)}</del>}
                    <strong>{money(product.priceCents)}</strong>
                  </p>
                  <p className="installment">ou 6x de {money(Math.round(product.priceCents / 6))} sem juros</p>
                  {product.stock <= 4 && <p className="stock-warning"><span /> Restam apenas {product.stock} {product.stock === 1 ? "unidade" : "unidades"}</p>}
                </div>
              </article>
            );
          })}
        </div>
        {!displayedProducts.length && <p className="empty-search">Nenhuma joia encontrada. Tente uma busca diferente.</p>}
      </section>

      <section className="editorial" id="editorial">
        <div className="editorial-image editorial-main"><img src="/brand/editorial-ellej-box.png" alt="Modelo apresentando uma joia Elle Jew" /></div>
        <div className="editorial-copy">
          <p className="eyebrow">Qualidade & Acabamento</p>
          <h2>O brilho do ouro branco com<br /><em>a durabilidade da Prata 925.</em></h2>
          <p>Trabalhamos com prata de lei 925 legítima e zircônias lapidadas a mão. Peças hipoalergênicas, resistentes e com acabamento polido para brilhar por anos.</p>
          <a className="button button-light" href="#colecao">Conhecer Lançamentos</a>
          <div className="editorial-quote">“A elegância que eterniza momentos.”</div>
        </div>
        <div className="editorial-image editorial-side"><img src="/brand/editorial-ellej-rings.png" alt="Modelo usando anéis e brincos Elle Jew" /></div>
      </section>

      <section className="social section" id="sobre">
        <div className="social-heading">
          <div><p className="eyebrow dark">No Instagram</p><h2>Descubra o brilho que transforma cada momento</h2></div>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">@ellejew_ ↗</a>
        </div>
        <div className="social-grid">
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-riviera.jpg" alt="Riviera Elle Jew em close" /><span>Colares Riviera cravejados</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-rings.jpg" alt="Anéis e colares Elle Jew em uso" /><span>Mix de colares e anéis</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-bastidores.jpg" alt="Embalagens Elle Jew sendo preparadas" /><span>Embaladas com carinho</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-look.jpg" alt="Colar Riviera Elle Jew" /><span>Brilho radiante em cada detalhe</span></a>
        </div>
      </section>

      <section className="reviews section">
        <div className="reviews-heading"><p className="eyebrow dark">Por que escolher a Elle Jew?</p><h2>Qualidade garantida e<br />carinho em cada detalhe.</h2></div>
        <div className="review-cards">
          <article><p className="stars">★★★★★</p><blockquote>Peças confeccionadas em prata de lei 925 legítima, revestidas para manter a cor e o brilho intenso por muito mais tempo.</blockquote><footer><strong>PRATA 925 LEGÍTIMA</strong><span>Garantia e durabilidade</span></footer></article>
          <article><p className="stars">★★★★★</p><blockquote>Zircônias cristal de alta lapidação com o mesmo brilho e precisão dos diamantes, perfeitas para qualquer ocasião.</blockquote><footer><strong>LAPIDAÇÃO PREMIUM</strong><span>Cravejamento impecável</span></footer></article>
          <article><p className="stars">★★★★★</p><blockquote>Cada pedido é embalado à mão em caixa personalizada com saquinho aveludado protetor e um aroma exclusivo da marca.</blockquote><footer><strong>EMBALAGEM ESPECIAL</strong><span>Pronta para presentear</span></footer></article>
        </div>
      </section>

      <section className="newsletter-section">
        <div><p className="eyebrow">CUPOM DE BOAS-VINDAS</p><h2>Ganhe 10% OFF no seu primeiro pedido.</h2><p>Cadastre seu e-mail para receber cupons de desconto, avisos de reposição e lançamentos em primeira mão.</p></div>
        {newsletterDone ? <p className="newsletter-success">Cadastro realizado com sucesso! Seu cupom foi enviado para o e-mail. ♡</p> : (
          <form onSubmit={submitNewsletter}>
            <label htmlFor="newsletter-email">Digite seu melhor e-mail</label>
            <div><input id="newsletter-email" type="email" value={newsletter} onChange={(event) => setNewsletter(event.target.value)} placeholder="seuemail@exemplo.com.br" required /><button disabled={busy === "newsletter"}>{busy === "newsletter" ? "Enviando…" : "Garantir 10% OFF"}</button></div>
            <small>Prometemos não enviar spam. Cancele quando quiser.</small>
          </form>
        )}
      </section>

      <footer className="footer">
        <div className="footer-brand"><img src="/brand/logo.webp" alt="Elle Jew" /><p>Eternizando elegância por meio de joias.</p></div>
        <div><h3>Comprar</h3><a href="#colecao">Colares</a><a href="#colecao">Conjuntos</a><a href="#colecao">Brincos</a><a href="#colecao">Lançamentos</a></div>
        <div><h3>Atendimento</h3><a href="https://wa.me/5516992939739" target="_blank" rel="noreferrer">WhatsApp</a><a href="mailto:contato@ellejew.com.br">E-mail</a><a href="mailto:contato@ellejew.com.br?subject=Trocas%20e%20devolucoes">Trocas e devoluções</a><a href="mailto:contato@ellejew.com.br?subject=Cuidados%20com%20minha%20joia">Cuidados com sua joia</a></div>
        <div><h3>Elle Jew</h3><a href="#sobre">Nossa essência</a><a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">Instagram</a><a href="mailto:contato@ellejew.com.br?subject=Privacidade">Privacidade</a><a href="mailto:contato@ellejew.com.br?subject=Termos%20da%20loja">Termos</a></div>
        <div className="footer-bottom"><span>© 2026 Elle Jew. Todos os direitos reservados.</span><span>Prata 925 • Feito para durar</span></div>
      </footer>

      <a className="whatsapp" href="https://wa.me/5516992939739?text=Oi%2C%20vim%20pelo%20site%20da%20Elle%20Jew%20e%20quero%20ajuda%20para%20escolher%20uma%20joia." target="_blank" rel="noreferrer" aria-label="Falar com a Elle Jew no WhatsApp">WhatsApp</a>

      <div className="mobile-bar">
        <button onClick={() => setDrawer("favorites")}><span>♡</span>Favoritos{store.favoriteIds.length > 0 && <em>{store.favoriteIds.length}</em>}</button>
        <button className="mobile-bag" onClick={() => setDrawer("cart")}><span>Sacola</span><strong>{cartCount} {cartCount === 1 ? "item" : "itens"}</strong></button>
      </div>

      {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast(null)} aria-label="Fechar aviso">×</button></div>}

      {drawer && (
        <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={drawer === "cart" ? "Sacola" : "Favoritos"}>
            <div className="drawer-header"><div><p className="eyebrow dark">{drawer === "cart" ? "Sua seleção" : "Sua curadoria"}</p><h2>{drawer === "cart" ? "Sacola" : "Favoritos"}</h2></div><button onClick={() => setDrawer(null)} aria-label="Fechar">×</button></div>
            {drawer === "cart" ? (
              <>
                <div className="drawer-progress"><div><span style={{ width: `${Math.min(100, (subtotal / 39900) * 100)}%` }} /></div><p>{subtotal >= 39900 ? "Você desbloqueou frete grátis." : `Faltam ${money(39900 - subtotal)} para o frete grátis.`}</p></div>
                <div className="drawer-list">
                  {store.cart.map((item) => (
                    <article className="drawer-item" key={item.id}><img src={item.image} alt={item.name} /><div><span>{item.category}</span><h3>{item.name}</h3><strong>{money(item.priceCents)}</strong><div className="quantity"><button onClick={() => setCartQuantity(item, item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => setCartQuantity(item, item.quantity + 1)} disabled={item.quantity >= item.stock} aria-label={`Aumentar quantidade de ${item.name}`}>+</button></div></div><button className="remove" onClick={() => setCartQuantity(item, 0)} aria-label={`Remover ${item.name}`}>×</button></article>
                  ))}
                  {!store.cart.length && <div className="empty-drawer"><span>◇</span><h3>Sua sacola está esperando.</h3><p>Comece pelas peças que estão no radar de todo mundo.</p><button onClick={() => setDrawer(null)}>Ver mais desejados</button></div>}
                </div>
                {store.cart.length > 0 && <div className="drawer-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>Frete e descontos calculados no checkout.</small><button className="button button-primary full" onClick={openCheckout}>Ir para o checkout seguro</button><p>Compra protegida • Troca em 7 dias</p></div>}
              </>
            ) : (
              <div className="drawer-list favorites-list">
                {favoriteProducts.map((product) => <article className="drawer-item" key={product.id}><img src={product.image} alt={product.name} /><div><span>{product.category}</span><h3>{product.name}</h3><strong>{money(product.priceCents)}</strong><button className="mini-add" onClick={() => addToCart(product)}>Adicionar à sacola</button></div><button className="remove" onClick={() => toggleFavorite(product)} aria-label={`Remover ${product.name}`}>×</button></article>)}
                {!favoriteProducts.length && <div className="empty-drawer"><span>♡</span><h3>Guarde o que fez seus olhos brilharem.</h3><p>Toque no coração de uma peça para encontrá-la aqui.</p><button onClick={() => setDrawer(null)}>Descobrir a coleção</button></div>}
              </div>
            )}
          </aside>
        </div>
      )}

      {selectedProduct && (
        <div className="overlay product-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProduct(null); }}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${selectedProduct.name}`}>
            <button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label="Fechar">×</button>
            <div className="modal-image"><img src={selectedProduct.image} alt={selectedProduct.name} /><span>{selectedProduct.badge}</span></div>
            <div className="modal-copy"><p className="eyebrow dark">{selectedProduct.category} • Elle Jew</p><h2>{selectedProduct.name}</h2><p className="modal-description">{selectedProduct.description}</p><p className="modal-material">◇ {selectedProduct.material}</p><div className="modal-price">{selectedProduct.compareAtCents && <del>{money(selectedProduct.compareAtCents)}</del>}<strong>{money(selectedProduct.priceCents)}</strong><span>ou 6x de {money(Math.round(selectedProduct.priceCents / 6))} sem juros</span></div>{selectedProduct.stock <= 4 && <p className="modal-stock"><span /> Restam apenas {selectedProduct.stock} peças desta edição</p>}<button className="button button-primary full" onClick={() => addToCart(selectedProduct)} disabled={busy === `cart-${selectedProduct.id}`}>{busy === `cart-${selectedProduct.id}` ? "Adicionando…" : "Adicionar à sacola"}</button><button className="modal-favorite" onClick={() => toggleFavorite(selectedProduct)}>{store.favoriteIds.includes(selectedProduct.id) ? "♥ Salvo nos favoritos" : "♡ Salvar nos favoritos"}</button><div className="modal-benefits"><span>Envio em 24h</span><span>Troca fácil</span><span>Compra segura</span></div></div>
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="checkout" role="dialog" aria-modal="true" aria-label="Checkout">
          <header className="checkout-header"><button onClick={() => checkoutStep === 3 ? setCheckoutOpen(false) : setCheckoutOpen(false)} aria-label="Fechar checkout">← Voltar</button><img src="/brand/logo.webp" alt="Elle Jew" /><span>Ambiente seguro</span></header>
          <div className="checkout-steps" aria-label="Etapas do checkout"><span className={checkoutStep >= 1 ? "active" : ""}>1. Entrega</span><i /><span className={checkoutStep >= 2 ? "active" : ""}>2. Pagamento</span><i /><span className={checkoutStep >= 3 ? "active" : ""}>3. Confirmação</span></div>
          {checkoutStep < 3 ? (
            <div className="checkout-grid">
              <div className="checkout-main">
                {checkoutStep === 1 ? (
                  <form id="delivery-form" onSubmit={(event) => { event.preventDefault(); if (!checkout.shippingMethod) { setToast("Calcule e selecione uma opção de entrega."); return; } setCheckoutStep(2); window.scrollTo(0, 0); }}>
                    <p className="eyebrow dark">Entrega</p><h1>Para onde enviamos seu brilho?</h1>
                    <div className="form-section"><h2>Contato</h2><div className="field-grid"><label className="span-2">Nome completo<input required autoComplete="name" value={checkout.customerName} onChange={(event) => updateCheckout("customerName", event.target.value)} /></label><label>E-mail<input type="email" required autoComplete="email" value={checkout.email} onChange={(event) => updateCheckout("email", event.target.value)} /></label><label>WhatsApp<input required autoComplete="tel" placeholder="(16) 99999-9999" value={checkout.phone} onChange={(event) => updateCheckout("phone", event.target.value)} /></label><label>CPF do comprador<input required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" pattern="\d{3}\.\d{3}\.\d{3}-\d{2}" value={checkout.cpf} onChange={(event) => updateCheckout("cpf", formatCpf(event.target.value))} /></label></div></div>
                    <div className="form-section"><h2>Endereço de entrega</h2><div className="field-grid"><label>CEP<input required inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" pattern="\d{5}-\d{3}" value={checkout.cep} onBlur={() => lookupCheckoutCep()} onChange={(event) => { const value = formatCep(event.target.value); setShippingOptions([]); setShippingStatus(""); setCheckout((current) => ({ ...current, cep: value, shippingMethod: "" })); if (onlyDigits(value).length === 8) void lookupCheckoutCep(value); }} />{cepStatus && <small>{cepStatus}</small>}</label><label className="span-2">Rua ou avenida<input required autoComplete="address-line1" value={checkout.address} onChange={(event) => updateCheckout("address", event.target.value)} /></label><label>Número<input required autoComplete="address-line2" value={checkout.addressNumber} onChange={(event) => updateCheckout("addressNumber", event.target.value)} /></label><label>Bairro<input required value={checkout.neighborhood} onChange={(event) => updateCheckout("neighborhood", event.target.value)} /></label><label>Complemento<input value={checkout.complement} onChange={(event) => updateCheckout("complement", event.target.value)} /></label><label>Cidade<input required autoComplete="address-level2" value={checkout.city} onChange={(event) => updateCheckout("city", event.target.value)} /></label><label>UF<input required maxLength={2} autoComplete="address-level1" value={checkout.state} onChange={(event) => updateCheckout("state", event.target.value.toUpperCase())} /></label></div></div>
                    <div className="form-section"><h2>Forma de entrega</h2>{shippingOptions.map((option) => <label key={option.id} className={`shipping-option ${checkout.shippingMethod === option.id ? "selected" : ""}`}><input type="radio" name="shipping" value={option.id} checked={checkout.shippingMethod === option.id} onChange={(event) => updateCheckout("shippingMethod", event.target.value)} /><span><strong>{option.name}</strong><small>{option.deliveryDays} {option.deliveryDays === 1 ? "dia útil" : "dias úteis"} • rastreamento incluso</small></span><b>{subtotal >= 39900 ? "Grátis" : money(option.priceCents)}</b></label>)}{shippingStatus && <p className="shipping-status">{shippingStatus}</p>}{!shippingOptions.length && !shippingStatus && <p className="shipping-status">Informe o CEP para calcular o frete.</p>}</div>
                    <button className="button button-primary checkout-next" type="submit" disabled={!checkout.shippingMethod}>Continuar para pagamento</button>
                  </form>
                ) : (
                  <form id="payment-form" onSubmit={submitOrder}>
                    <p className="eyebrow dark">Pagamento</p><h1>Último passo. Sua joia já está reservada.</h1>
                    <div className="payment-tabs"><label className={checkout.paymentMethod === "pix" ? "selected" : ""}><input type="radio" name="payment" value="pix" checked={checkout.paymentMethod === "pix"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span>PIX</span><small>Aprovação rápida</small></label><label className={checkout.paymentMethod === "card" ? "selected" : ""}><input type="radio" name="payment" value="card" checked={checkout.paymentMethod === "card"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span>Cartão</span><small>Até 6x sem juros</small></label></div>
                    {checkout.paymentMethod === "pix" ? <div className="pix-box"><strong>5% de condição especial no PIX</strong><p>Você será direcionada ao Asaas para gerar o QR Code e o Pix Copia e Cola com segurança.</p><span>Aprovação automática • ambiente Asaas</span></div> : <div className="pix-box"><strong>Cartão em até 6x sem juros</strong><p>O pagamento será concluído no ambiente protegido do Asaas. A Elle Jew não recebe nem armazena os dados do seu cartão.</p><span>Tokenização segura • ambiente Asaas</span></div>}
                    <div className="coupon"><label htmlFor="coupon">Tem um cupom?</label><div><input id="coupon" value={checkout.coupon} onChange={(event) => updateCheckout("coupon", event.target.value)} placeholder="Digite o código" /><span>{couponDiscount > 0 ? `${money(couponDiscount)} aplicados` : "Use ELLE10"}</span></div></div>
                    <button className="button button-primary checkout-next" type="submit" disabled={busy === "checkout"}>{busy === "checkout" ? "Abrindo pagamento seguro…" : `Ir para o pagamento • ${money(total)}`}</button>
                    {checkoutError && <p className="checkout-payment-error" role="alert">{checkoutError}</p>}
                    <button className="back-link" type="button" onClick={() => setCheckoutStep(1)}>← Alterar entrega</button>
                  </form>
                )}
              </div>
              <aside className="checkout-summary"><h2>Seu pedido</h2><div className="checkout-items">{store.cart.map((item) => <div key={item.id}><div><img src={item.image} alt="" /><span>{item.quantity}</span></div><p><strong>{item.name}</strong><small>{item.material}</small></p><b>{money(item.priceCents * item.quantity)}</b></div>)}</div><div className="summary-lines"><p><span>Subtotal</span><strong>{money(subtotal)}</strong></p><p><span>Entrega</span><strong>{selectedShipping ? shipping ? money(shipping) : "Grátis" : "A calcular"}</strong></p>{couponDiscount > 0 && <p className="discount-line"><span>Desconto ELLE10</span><strong>− {money(couponDiscount)}</strong></p>}{pixDiscount > 0 && <p className="discount-line"><span>Desconto PIX</span><strong>− {money(pixDiscount)}</strong></p>}<div><span>Total</span><strong>{money(total)}</strong></div><small>em até 6x de {money(Math.round(total / 6))} sem juros</small></div><div className="summary-trust"><span>Compra protegida</span><span>Troca em 7 dias</span><span>Dados seguros</span></div></aside>
            </div>
          ) : (
              <section className="success-screen"><div className="success-mark">✓</div><p className="eyebrow dark">Pedido recebido</p><h1>Sua próxima assinatura<br />já tem número.</h1><p>Pedido <strong>{order?.id}</strong> recebido com sucesso. A situação do pagamento será atualizada automaticamente.</p><div className="success-order"><span>Total</span><strong>{money(order?.totalCents ?? total)}</strong><small>Pagamento protegido pelo Asaas</small></div><a className="button button-primary" href={`https://wa.me/5516992939739?text=${encodeURIComponent(`Oi! Acabei de fazer o pedido ${order?.id} no site da Elle Jew.`)}`} target="_blank" rel="noreferrer">Acompanhar pelo WhatsApp</a><button className="back-link" onClick={() => { setCheckoutOpen(false); setCheckout(initialCheckout); }}>Voltar para a loja</button></section>
          )}
        </div>
      )}
    </main>
  );
}
