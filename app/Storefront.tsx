"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  material: string;
  image: string;
  badge: string | null;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
};

type CartItem = Product & { quantity: number };
type StoreData = { products: Product[]; favoriteIds: string[]; cart: CartItem[] };
type Drawer = "cart" | "favorites" | null;
type Order = { id: string; totalCents: number; status: string; paymentMethod: string };

const fallbackProducts: Product[] = [
  { id: "choker-coracoes", slug: "choker-5-coracoes", name: "Choker 5 Corações", category: "Colares", description: "Cinco corações lapidados em uma corrente delicada para iluminar o colo sem perder a elegância.", material: "Prata 925 • Zircônias premium", image: "/brand/choker-coracoes.webp", badge: "Mais desejado", priceCents: 55000, compareAtCents: null, stock: 3 },
  { id: "colar-ponto-luz", slug: "colar-ponto-luz", name: "Colar Ponto Luz", category: "Colares", description: "A peça essencial: brilho limpo, cravação precisa e presença delicada para acompanhar todos os dias.", material: "Prata 925 • Zircônia cristal", image: "/brand/colar-ponto-luz.webp", badge: "Best-seller", priceCents: 28500, compareAtCents: null, stock: 6 },
  { id: "conjunto-kunzita", slug: "conjunto-kunzita", name: "Conjunto Kunzita", category: "Conjuntos", description: "Kunzita rosa em lapidação clássica, criada para trazer cor com sofisticação e leveza.", material: "Prata 925 • Kunzita criada", image: "/brand/conjunto-kunzita.webp", badge: "Edição limitada", priceCents: 29800, compareAtCents: null, stock: 4 },
  { id: "conjunto-ametista", slug: "conjunto-ametista", name: "Conjunto Ametista", category: "Conjuntos", description: "O violeta profundo da ametista encontra o brilho frio da prata em um desenho atemporal.", material: "Prata 925 • Ametista criada", image: "/brand/conjunto-ametista.webp", badge: "Novo", priceCents: 29800, compareAtCents: null, stock: 5 },
  { id: "ear-cuff-medio", slug: "ear-cuff-medio", name: "Ear Cuff Médio", category: "Brincos", description: "Uma linha ascendente de brilho que transforma a orelha sem exigir segundo furo.", material: "Prata 925 • Zircônias premium", image: "/brand/ear-cuff.webp", badge: "Últimas peças", priceCents: 19900, compareAtCents: 23500, stock: 2 },
];

const initialCheckout = {
  customerName: "",
  email: "",
  phone: "",
  cpf: "",
  cep: "",
  address: "",
  addressNumber: "",
  complement: "",
  city: "",
  state: "",
  shippingMethod: "standard",
  paymentMethod: "pix",
  coupon: "",
};

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

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
  const [store, setStore] = useState<StoreData>({ products: fallbackProducts, favoriteIds: [], cart: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [checkout, setCheckout] = useState(initialCheckout);
  const [order, setOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newsletter, setNewsletter] = useState("");
  const [newsletterDone, setNewsletterDone] = useState(false);
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
  const shipping = checkout.shippingMethod === "express" && subtotal < 39900 ? 2490 : 0;
  const total = subtotal - couponDiscount - pixDiscount + shipping;
  const favoriteProducts = store.products.filter((product) => store.favoriteIds.includes(product.id));
  const filteredProducts = store.products.filter((product) => {
    const categoryMatch = category === "Todos" || product.category === category;
    const searchMatch = `${product.name} ${product.category} ${product.material}`.toLowerCase().includes(search.toLowerCase());
    return categoryMatch && searchMatch;
  });
  const categories = useMemo(() => ["Todos", ...Array.from(new Set(store.products.map((product) => product.category)))], [store.products]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir.");
    return data;
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
    setBusy("checkout");
    try {
      const data = await post({ action: "checkout", ...checkout });
      setOrder(data.order);
      setStore(data.store);
      setCheckoutStep(3);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível criar seu pedido.");
    } finally {
      setBusy(null);
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
        <span>Frete expresso grátis acima de R$399</span>
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
          <p className="eyebrow">Prata 925 • Design de alta joalheria</p>
          <h1>Você não precisa de ocasião.<br /><em>Você é a ocasião.</em></h1>
          <p className="hero-lead">Joias de presença, acabamento impecável e brilho que continua dizendo quem você é — mesmo depois que você sai.</p>
          <div className="hero-ctas">
            <a className="button button-primary" href="#colecao">Quero minha joia</a>
            <button className="button button-ghost" onClick={() => setSelectedProduct(store.products[0])}>Ver o mais desejado</button>
          </div>
          <div className="hero-proof">
            <div className="avatars" aria-hidden="true"><span>E</span><span>J</span><span>♡</span></div>
            <p><strong>Mais de 1.200 mulheres</strong><br />já acompanham a Elle Jew</p>
          </div>
        </div>
        <div className="hero-visual">
          <img src="/brand/hero.webp" alt="Modelo usando joias douradas Elle Jew" />
          <div className="hero-card">
            <span>Curadoria da semana</span>
            <strong>Peças para ser lembrada</strong>
            <a href="#colecao">Descobrir agora →</a>
          </div>
          <div className="hero-seal"><span>925</span>prata legítima</div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Benefícios da loja">
        <div><strong>Prata 925 legítima</strong><span>Qualidade que atravessa o tempo</span></div>
        <div><strong>Envio em até 24h</strong><span>Para pedidos em estoque</span></div>
        <div><strong>Compra protegida</strong><span>Seus dados sempre seguros</span></div>
        <div><strong>Troca descomplicada</strong><span>7 dias para decidir</span></div>
      </section>

      <section className="collection section" id="colecao">
        <div className="section-heading">
          <div>
            <p className="eyebrow dark">As escolhas que não ficam para depois</p>
            <h2>Joias que entram<br />antes de você.</h2>
          </div>
          <p className="section-intro">Uma seleção de peças com estoque reduzido, criada para transformar o look sem pedir licença.</p>
        </div>

        <div className="shop-tools">
          <div className="category-tabs" aria-label="Filtrar por categoria">
            {categories.map((item) => (
              <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>
          <label className="search-box" htmlFor="busca-produtos">
            <span>⌕</span>
            <input id="busca-produtos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busque sua próxima joia" />
          </label>
        </div>

        {loading && <div className="loading-line" aria-label="Carregando produtos" />}
        <div className="product-grid">
          {filteredProducts.map((product) => {
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
                  {product.stock <= 4 && <p className="stock-warning"><span /> Só {product.stock} {product.stock === 1 ? "peça disponível" : "peças disponíveis"}</p>}
                </div>
              </article>
            );
          })}
        </div>
        {!filteredProducts.length && <p className="empty-search">Nenhuma joia encontrada. Tente uma busca diferente.</p>}
      </section>

      <section className="editorial" id="editorial">
        <div className="editorial-image editorial-main"><img src="/brand/editorial-gold.webp" alt="Modelo usando conjunto dourado Elle Jew" /></div>
        <div className="editorial-copy">
          <p className="eyebrow">A verdadeira elegância está nos detalhes</p>
          <h2>Não é sobre combinar.<br /><em>É sobre marcar.</em></h2>
          <p>Desenhamos uma coleção que acompanha movimentos, sustenta olhares e transforma o cotidiano em assinatura pessoal.</p>
          <a className="button button-light" href="#colecao">Encontrar minha assinatura</a>
          <div className="editorial-quote">“A joia certa não completa o look. Ela revela a mulher.”</div>
        </div>
        <div className="editorial-image editorial-side"><img src="/brand/editorial-silver.webp" alt="Modelo usando joias em prata Elle Jew" /></div>
      </section>

      <section className="social section" id="sobre">
        <div className="social-heading">
          <div><p className="eyebrow dark">Vista por elas. Feita para você.</p><h2>Elle Jew na vida real</h2></div>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">@ellejew_ ↗</a>
        </div>
        <div className="social-grid">
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-riviera.jpg" alt="Riviera Elle Jew em close" /><span>Rivieras que capturam a luz</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-rings.jpg" alt="Anéis e colares Elle Jew em uso" /><span>Camadas de personalidade</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-bastidores.jpg" alt="Embalagens Elle Jew sendo preparadas" /><span>Seu pedido, cuidado à mão</span></a>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-look.jpg" alt="Colar Riviera Elle Jew" /><span>Brilho em todos os ângulos</span></a>
        </div>
      </section>

      <section className="reviews section">
        <div className="reviews-heading"><p className="eyebrow dark">Razões para escolher Elle</p><h2>Luxo percebido.<br />Qualidade sentida.</h2></div>
        <div className="review-cards">
          <article><p className="stars">01</p><blockquote>Brilho que não passa despercebido, com a elegância que continua atual temporada após temporada.</blockquote><footer><strong>Prata 925</strong><span>Qualidade e durabilidade</span></footer></article>
          <article><p className="stars">02</p><blockquote>Desenhos com linguagem de alta joalheria para elevar o cotidiano sem parecer óbvio.</blockquote><footer><strong>Design autoral</strong><span>Presença em cada detalhe</span></footer></article>
          <article><p className="stars">03</p><blockquote>Da curadoria à embalagem, cada pedido é preparado para chegar como um presente.</blockquote><footer><strong>Cuidado Elle</strong><span>Experiência do início ao fim</span></footer></article>
        </div>
      </section>

      <section className="newsletter-section">
        <div><p className="eyebrow">Acesso antes de todo mundo</p><h2>Entre para a lista Elle.</h2><p>Lançamentos, reposições e condições reservadas chegam primeiro por aqui.</p></div>
        {newsletterDone ? <p className="newsletter-success">Você entrou. Fique de olho no seu e-mail. ♡</p> : (
          <form onSubmit={submitNewsletter}>
            <label htmlFor="newsletter-email">Seu melhor e-mail</label>
            <div><input id="newsletter-email" type="email" value={newsletter} onChange={(event) => setNewsletter(event.target.value)} placeholder="voce@email.com" required /><button disabled={busy === "newsletter"}>{busy === "newsletter" ? "Enviando…" : "Quero acesso"}</button></div>
            <small>Sem excesso. Só o que vale abrir.</small>
          </form>
        )}
      </section>

      <footer className="footer">
        <div className="footer-brand"><img src="/brand/logo.webp" alt="Elle Jew" /><p>Eternizando elegância por meio de joias.</p></div>
        <div><h3>Comprar</h3><a href="#colecao">Colares</a><a href="#colecao">Conjuntos</a><a href="#colecao">Brincos</a><a href="#colecao">Lançamentos</a></div>
        <div><h3>Atendimento</h3><a href="https://wa.me/5516992939739" target="_blank" rel="noreferrer">WhatsApp</a><a href="mailto:contato@ellejew.com.br">E-mail</a><a href="#">Trocas e devoluções</a><a href="#">Cuidados com sua joia</a></div>
        <div><h3>Elle Jew</h3><a href="#sobre">Nossa essência</a><a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">Instagram</a><a href="#">Privacidade</a><a href="#">Termos</a></div>
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
                <div className="drawer-progress"><div><span style={{ width: `${Math.min(100, (subtotal / 39900) * 100)}%` }} /></div><p>{subtotal >= 39900 ? "Você desbloqueou frete expresso grátis." : `Faltam ${money(39900 - subtotal)} para o frete expresso grátis.`}</p></div>
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
                  <form id="delivery-form" onSubmit={(event) => { event.preventDefault(); setCheckoutStep(2); window.scrollTo(0, 0); }}>
                    <p className="eyebrow dark">Entrega</p><h1>Para onde enviamos seu brilho?</h1>
                    <div className="form-section"><h2>Contato</h2><div className="field-grid"><label className="span-2">Nome completo<input required autoComplete="name" value={checkout.customerName} onChange={(event) => updateCheckout("customerName", event.target.value)} /></label><label>E-mail<input type="email" required autoComplete="email" value={checkout.email} onChange={(event) => updateCheckout("email", event.target.value)} /></label><label>WhatsApp<input required autoComplete="tel" placeholder="(16) 99999-9999" value={checkout.phone} onChange={(event) => updateCheckout("phone", event.target.value)} /></label><label>CPF <small>(opcional)</small><input inputMode="numeric" value={checkout.cpf} onChange={(event) => updateCheckout("cpf", event.target.value)} /></label></div></div>
                    <div className="form-section"><h2>Endereço de entrega</h2><div className="field-grid"><label>CEP<input required inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={checkout.cep} onChange={(event) => updateCheckout("cep", event.target.value)} /></label><label className="span-2">Endereço<input required autoComplete="street-address" value={checkout.address} onChange={(event) => updateCheckout("address", event.target.value)} /></label><label>Número<input required value={checkout.addressNumber} onChange={(event) => updateCheckout("addressNumber", event.target.value)} /></label><label>Complemento<input value={checkout.complement} onChange={(event) => updateCheckout("complement", event.target.value)} /></label><label>Cidade<input required autoComplete="address-level2" value={checkout.city} onChange={(event) => updateCheckout("city", event.target.value)} /></label><label>UF<input required maxLength={2} autoComplete="address-level1" value={checkout.state} onChange={(event) => updateCheckout("state", event.target.value)} /></label></div></div>
                    <div className="form-section"><h2>Forma de entrega</h2><label className={`shipping-option ${checkout.shippingMethod === "standard" ? "selected" : ""}`}><input type="radio" name="shipping" value="standard" checked={checkout.shippingMethod === "standard"} onChange={(event) => updateCheckout("shippingMethod", event.target.value)} /><span><strong>Envio padrão</strong><small>3 a 6 dias úteis • rastreamento incluso</small></span><b>Grátis</b></label><label className={`shipping-option ${checkout.shippingMethod === "express" ? "selected" : ""}`}><input type="radio" name="shipping" value="express" checked={checkout.shippingMethod === "express"} onChange={(event) => updateCheckout("shippingMethod", event.target.value)} /><span><strong>Envio expresso</strong><small>1 a 2 dias úteis</small></span><b>{subtotal >= 39900 ? "Grátis" : money(2490)}</b></label></div>
                    <button className="button button-primary checkout-next" type="submit">Continuar para pagamento</button>
                  </form>
                ) : (
                  <form id="payment-form" onSubmit={submitOrder}>
                    <p className="eyebrow dark">Pagamento</p><h1>Último passo. Sua joia já está reservada.</h1>
                    <div className="payment-tabs"><label className={checkout.paymentMethod === "pix" ? "selected" : ""}><input type="radio" name="payment" value="pix" checked={checkout.paymentMethod === "pix"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span>PIX</span><small>Aprovação rápida</small></label><label className={checkout.paymentMethod === "card" ? "selected" : ""}><input type="radio" name="payment" value="card" checked={checkout.paymentMethod === "card"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span>Cartão</span><small>Até 6x sem juros</small></label></div>
                    {checkout.paymentMethod === "pix" ? <div className="pix-box"><strong>5% de condição especial no PIX</strong><p>Ao confirmar, seu pedido será reservado e você receberá as instruções seguras de pagamento pelo WhatsApp cadastrado.</p><span>Aprovação rápida • sem taxa</span></div> : <div className="pix-box"><strong>Cartão em até 6x sem juros</strong><p>Ao confirmar, seu pedido será reservado e o link seguro para pagamento será enviado ao WhatsApp cadastrado. A Elle Jew não recebe nem armazena os dados do seu cartão.</p><span>Link individual • ambiente protegido</span></div>}
                    <div className="coupon"><label htmlFor="coupon">Tem um cupom?</label><div><input id="coupon" value={checkout.coupon} onChange={(event) => updateCheckout("coupon", event.target.value)} placeholder="Digite o código" /><span>{couponDiscount > 0 ? `${money(couponDiscount)} aplicados` : "Use ELLE10"}</span></div></div>
                    <button className="button button-primary checkout-next" type="submit" disabled={busy === "checkout"}>{busy === "checkout" ? "Reservando sua joia…" : `Finalizar pedido • ${money(total)}`}</button>
                    <button className="back-link" type="button" onClick={() => setCheckoutStep(1)}>← Alterar entrega</button>
                  </form>
                )}
              </div>
              <aside className="checkout-summary"><h2>Seu pedido</h2><div className="checkout-items">{store.cart.map((item) => <div key={item.id}><div><img src={item.image} alt="" /><span>{item.quantity}</span></div><p><strong>{item.name}</strong><small>{item.material}</small></p><b>{money(item.priceCents * item.quantity)}</b></div>)}</div><div className="summary-lines"><p><span>Subtotal</span><strong>{money(subtotal)}</strong></p><p><span>Entrega</span><strong>{shipping ? money(shipping) : "Grátis"}</strong></p>{couponDiscount > 0 && <p className="discount-line"><span>Desconto ELLE10</span><strong>− {money(couponDiscount)}</strong></p>}{pixDiscount > 0 && <p className="discount-line"><span>Desconto PIX</span><strong>− {money(pixDiscount)}</strong></p>}<div><span>Total</span><strong>{money(total)}</strong></div><small>em até 6x de {money(Math.round(total / 6))} sem juros</small></div><div className="summary-trust"><span>Compra protegida</span><span>Troca em 7 dias</span><span>Dados seguros</span></div></aside>
            </div>
          ) : (
            <section className="success-screen"><div className="success-mark">✓</div><p className="eyebrow dark">Pedido recebido</p><h1>Sua próxima assinatura<br />já tem número.</h1><p>Pedido <strong>{order?.id}</strong> reservado com sucesso. Enviamos a confirmação para <strong>{checkout.email}</strong>.</p><div className="success-order"><span>Total</span><strong>{money(order?.totalCents ?? total)}</strong><small>{order?.paymentMethod === "pix" ? "Instruções do PIX serão enviadas no WhatsApp" : "O link seguro do cartão será enviado no WhatsApp"}</small></div><a className="button button-primary" href={`https://wa.me/5516992939739?text=${encodeURIComponent(`Oi! Acabei de fazer o pedido ${order?.id} no site da Elle Jew.`)}`} target="_blank" rel="noreferrer">Acompanhar pelo WhatsApp</a><button className="back-link" onClick={() => { setCheckoutOpen(false); setCheckout(initialCheckout); }}>Voltar para a loja</button></section>
          )}
        </div>
      )}
    </main>
  );
}
