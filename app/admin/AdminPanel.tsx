"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  material: string;
  image: string;
  badge: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  active: boolean;
  createdAt: string;
};

type OrderItem = { id: number; productId: string; productName: string; unitPriceCents: number; quantity: number };
type Order = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  address: string;
  addressNumber: string;
  complement: string;
  city: string;
  state: string;
  shippingMethod: string;
  paymentMethod: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
};

type Dashboard = {
  products: Product[];
  orders: Order[];
  stats: {
    activeProducts: number;
    lowStock: number;
    pendingOrders: number;
    paidRevenueCents: number;
    subscribers: number;
  };
};

type AuthState = "loading" | "setup" | "login" | "code" | "authenticated";
type Section = "inicio" | "produtos" | "pedidos" | "configuracoes";

type ProductDraft = {
  id?: string;
  name: string;
  category: string;
  badge: string;
  description: string;
  material: string;
  image: string;
  price: string;
  compareAt: string;
  stock: string;
  active: boolean;
};

const emptyProduct: ProductDraft = {
  name: "",
  category: "Colares",
  badge: "",
  description: "",
  material: "Prata 925",
  image: "",
  price: "",
  compareAt: "",
  stock: "1",
  active: true,
};

const statusLabels: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_separacao: "Em separação",
  enviado: "Enviado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")));

function cents(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function AdminPanel() {
  const [auth, setAuth] = useState<AuthState>("loading");
  const [setupConfigured, setSetupConfigured] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [setup, setSetup] = useState({ email: "", password: "", repeatPassword: "", setupKey: "" });
  const [challenge, setChallenge] = useState({ id: "", emailHint: "", code: "", localCode: "" });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct);
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", repeat: "" });

  useEffect(() => {
    fetch("/api/admin", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.authenticated) {
          setAdminEmail(data.admin.email);
          setDashboard(data.dashboard);
          setAuth("authenticated");
        } else {
          setSetupConfigured(data.setupConfigured !== false);
          setAuth(data.setupRequired ? "setup" : "login");
        }
      })
      .catch((error) => {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível abrir o painel." });
        setAuth("login");
      });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setDashboard(null);
        setAuth("login");
      }
      throw new Error(data.error ?? "Não foi possível concluir.");
    }
    return data;
  }

  async function submitSetup(event: FormEvent) {
    event.preventDefault();
    if (setup.password !== setup.repeatPassword) return setNotice({ type: "error", text: "As senhas não são iguais." });
    setBusy("setup");
    try {
      await post({ action: "setup", email: setup.email, password: setup.password, setupKey: setup.setupKey });
      setLogin({ email: setup.email, password: "" });
      setSetup({ email: "", password: "", repeatPassword: "", setupKey: "" });
      setAuth("login");
      setNotice({ type: "ok", text: "Administrador criado. Agora faça o primeiro login." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível ativar." });
    } finally {
      setBusy("");
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setBusy("login");
    try {
      const data = await post({ action: "login", ...login });
      setChallenge({ id: data.challengeId, emailHint: data.emailHint, code: "", localCode: data.localCode ?? "" });
      setAuth("code");
      setNotice({ type: "ok", text: "Código enviado. Ele vale por 10 minutos." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível entrar." });
    } finally {
      setBusy("");
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy("code");
    try {
      const data = await post({ action: "verify", challengeId: challenge.id, code: challenge.code });
      setAdminEmail(data.admin.email);
      setDashboard(data.dashboard);
      setLogin((current) => ({ ...current, password: "" }));
      setAuth("authenticated");
      setNotice({ type: "ok", text: "Acesso confirmado. Bem-vinda ao painel." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Código inválido." });
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await post({ action: "logout" });
      setDashboard(null);
      setAuth("login");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível sair." });
    } finally {
      setBusy("");
    }
  }

  function openNewProduct() {
    setDraft({ ...emptyProduct });
    setWizardStep(1);
    setWizardOpen(true);
  }

  function editProduct(product: Product) {
    setDraft({
      id: product.id,
      name: product.name,
      category: product.category,
      badge: product.badge,
      description: product.description,
      material: product.material,
      image: product.image,
      price: (product.priceCents / 100).toFixed(2),
      compareAt: product.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : "",
      stock: String(product.stock),
      active: product.active,
    });
    setWizardStep(1);
    setWizardOpen(true);
  }

  async function uploadImage(file: File) {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar a foto.");
      setDraft((current) => ({ ...current, image: data.url }));
      setNotice({ type: "ok", text: "Foto enviada com sucesso." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar a foto." });
    } finally {
      setBusy("");
    }
  }

  async function saveProduct() {
    setBusy("saveProduct");
    try {
      const product = {
        ...draft,
        priceCents: cents(draft.price),
        compareAtCents: draft.compareAt ? cents(draft.compareAt) : null,
        stock: Number(draft.stock),
      };
      const data = await post({ action: draft.id ? "updateProduct" : "createProduct", product });
      setDashboard(data.dashboard);
      setWizardOpen(false);
      setNotice({ type: "ok", text: draft.id ? "Produto atualizado e vitrine sincronizada." : "Produto cadastrado e publicado na vitrine." });
      setSection("produtos");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar." });
    } finally {
      setBusy("");
    }
  }

  async function toggleProduct(product: Product) {
    setBusy(`product-${product.id}`);
    try {
      const data = await post({ action: "setProductActive", productId: product.id, active: !product.active });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: product.active ? "Produto arquivado e retirado da vitrine." : "Produto publicado na vitrine." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar." });
    } finally {
      setBusy("");
    }
  }

  async function changeOrderStatus(orderId: string, status: string) {
    setBusy(`order-${orderId}`);
    try {
      const data = await post({ action: "updateOrderStatus", orderId, status });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: "Situação do pedido atualizada." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar." });
    } finally {
      setBusy("");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwords.next !== passwords.repeat) return setNotice({ type: "error", text: "As novas senhas não são iguais." });
    setBusy("password");
    try {
      await post({ action: "changePassword", currentPassword: passwords.current, nextPassword: passwords.next });
      setPasswords({ current: "", next: "", repeat: "" });
      setDashboard(null);
      setAuth("login");
      setNotice({ type: "ok", text: "Senha alterada. Entre novamente para confirmar." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a senha." });
    } finally {
      setBusy("");
    }
  }

  const filteredProducts = useMemo(() => {
    const query = productSearch.toLowerCase();
    return dashboard?.products.filter((product) => `${product.name} ${product.category} ${product.material}`.toLowerCase().includes(query)) ?? [];
  }, [dashboard, productSearch]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.toLowerCase();
    return dashboard?.orders.filter((order) => `${order.id} ${order.customerName} ${order.email} ${order.phone}`.toLowerCase().includes(query)) ?? [];
  }, [dashboard, orderSearch]);

  if (auth === "loading") {
    return <main className={styles.authPage}><div className={styles.loader} /><p>Preparando o painel Elle Jew…</p></main>;
  }

  if (auth !== "authenticated" || !dashboard) {
    return (
      <main className={styles.authPage}>
        <Link className={styles.backStore} href="/">← Voltar para a loja</Link>
        <section className={styles.authCard}>
          <img src="/brand/logo.webp" alt="Elle Jew" />
          <p className={styles.eyebrow}>Área administrativa</p>
          {auth === "setup" && (
            <>
              <h1>Ative o painel</h1>
              <p className={styles.authLead}>Esta etapa acontece uma única vez. Crie o acesso da pessoa responsável pela loja.</p>
              {!setupConfigured && <div className={styles.configAlert}>Antes de ativar, configure <strong>AUTH_SECRET</strong> e <strong>ADMIN_SETUP_KEY</strong> na Cloudflare.</div>}
              <form className={styles.authForm} onSubmit={submitSetup}>
                <label>E-mail da administradora<input type="email" autoComplete="email" required value={setup.email} onChange={(event) => setSetup({ ...setup, email: event.target.value })} /></label>
                <label>Senha <small>Mínimo de 12 caracteres, com letras e números</small><input type="password" autoComplete="new-password" required minLength={12} value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} /></label>
                <label>Repita a senha<input type="password" autoComplete="new-password" required minLength={12} value={setup.repeatPassword} onChange={(event) => setSetup({ ...setup, repeatPassword: event.target.value })} /></label>
                <label>Chave de ativação <small>É a chave secreta criada na configuração da Cloudflare</small><input type="password" autoComplete="off" required value={setup.setupKey} onChange={(event) => setSetup({ ...setup, setupKey: event.target.value })} /></label>
                <button className={styles.primaryButton} disabled={busy === "setup"}>{busy === "setup" ? "Ativando…" : "Criar acesso seguro"}</button>
              </form>
            </>
          )}
          {auth === "login" && (
            <>
              <h1>Bem-vinda de volta</h1>
              <p className={styles.authLead}>Entre com seu e-mail e senha. Em seguida enviaremos um código de confirmação.</p>
              <form className={styles.authForm} onSubmit={submitLogin}>
                <label>E-mail<input type="email" autoComplete="username" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label>
                <label>Senha<input type="password" autoComplete="current-password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
                <button className={styles.primaryButton} disabled={busy === "login"}>{busy === "login" ? "Verificando…" : "Continuar"}</button>
              </form>
            </>
          )}
          {auth === "code" && (
            <>
              <h1>Confira seu e-mail</h1>
              <p className={styles.authLead}>Enviamos um código de seis números para <strong>{challenge.emailHint}</strong>.</p>
              {challenge.localCode && <div className={styles.configAlert}>Código do ambiente local: <strong>{challenge.localCode}</strong></div>}
              <form className={styles.authForm} onSubmit={submitCode}>
                <label>Código de acesso<input className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={challenge.code} onChange={(event) => setChallenge({ ...challenge, code: event.target.value.replace(/\D/g, "") })} /></label>
                <button className={styles.primaryButton} disabled={busy === "code"}>{busy === "code" ? "Confirmando…" : "Entrar no painel"}</button>
                <button className={styles.textButton} type="button" onClick={() => setAuth("login")}>Usar outro acesso</button>
              </form>
            </>
          )}
        </section>
        {notice && <div className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : ""}`}>{notice.text}</div>}
      </main>
    );
  }

  return (
    <main className={styles.adminShell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.adminLogo}><img src="/brand/logo.webp" alt="Elle Jew" /></Link>
        <nav>
          <button className={section === "inicio" ? styles.activeNav : ""} onClick={() => setSection("inicio")}><span>01</span> Visão geral</button>
          <button className={section === "produtos" ? styles.activeNav : ""} onClick={() => setSection("produtos")}><span>02</span> Produtos</button>
          <button className={section === "pedidos" ? styles.activeNav : ""} onClick={() => setSection("pedidos")}><span>03</span> Pedidos</button>
          <button className={section === "configuracoes" ? styles.activeNav : ""} onClick={() => setSection("configuracoes")}><span>04</span> Segurança</button>
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/" target="_blank">Ver loja ↗</Link>
          <button onClick={logout} disabled={busy === "logout"}>Sair</button>
        </div>
      </aside>

      <section className={styles.adminMain}>
        <header className={styles.adminHeader}>
          <button className={styles.mobileMenu} onClick={() => setSection(section === "inicio" ? "produtos" : "inicio")}>Menu</button>
          <div><span>Painel administrativo</span><strong>{adminEmail}</strong></div>
          <button className={styles.headerAdd} onClick={openNewProduct}>+ Cadastrar produto</button>
        </header>

        {section === "inicio" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Hoje na Elle Jew</p><h1>Visão geral</h1></div><button className={styles.primaryButton} onClick={openNewProduct}>+ Novo produto</button></div>
            <div className={styles.statGrid}>
              <article><span>Produtos publicados</span><strong>{dashboard.stats.activeProducts}</strong><button onClick={() => setSection("produtos")}>Gerenciar coleção →</button></article>
              <article><span>Estoque baixo</span><strong>{dashboard.stats.lowStock}</strong><small>Produtos com até 3 unidades</small></article>
              <article><span>Aguardando pagamento</span><strong>{dashboard.stats.pendingOrders}</strong><button onClick={() => setSection("pedidos")}>Ver pedidos →</button></article>
              <article className={styles.revenueCard}><span>Vendas confirmadas</span><strong>{money(dashboard.stats.paidRevenueCents)}</strong><small>{dashboard.stats.subscribers} pessoas na lista de novidades</small></article>
            </div>
            <div className={styles.dashboardGrid}>
              <section className={styles.panelCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Atenção agora</p><h2>Estoque reduzido</h2></div><button onClick={() => setSection("produtos")}>Ver todos</button></div>
                <div className={styles.compactList}>
                  {dashboard.products.filter((product) => product.active && product.stock <= 3).slice(0, 5).map((product) => (
                    <button key={product.id} onClick={() => editProduct(product)}><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.category}</small></span><b>{product.stock} un.</b></button>
                  ))}
                  {!dashboard.products.some((product) => product.active && product.stock <= 3) && <p className={styles.empty}>Nenhum produto com estoque baixo.</p>}
                </div>
              </section>
              <section className={styles.panelCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Últimas compras</p><h2>Pedidos recentes</h2></div><button onClick={() => setSection("pedidos")}>Ver todos</button></div>
                <div className={styles.compactOrders}>
                  {dashboard.orders.slice(0, 5).map((order) => (
                    <button key={order.id} onClick={() => { setExpandedOrder(order.id); setSection("pedidos"); }}><span><strong>{order.customerName}</strong><small>{order.id} • {date(order.createdAt)}</small></span><b>{money(order.totalCents)}</b><em>{statusLabels[order.status] ?? order.status}</em></button>
                  ))}
                  {!dashboard.orders.length && <p className={styles.empty}>Os novos pedidos aparecerão aqui.</p>}
                </div>
              </section>
            </div>
          </div>
        )}

        {section === "produtos" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Catálogo</p><h1>Produtos</h1></div><button className={styles.primaryButton} onClick={openNewProduct}>+ Cadastrar produto</button></div>
            <div className={styles.toolbar}><label>Buscar produto<input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nome, categoria ou material" /></label><span>{filteredProducts.length} itens</span></div>
            <div className={styles.productTable}>
              <div className={styles.tableHeader}><span>Produto</span><span>Preço</span><span>Estoque</span><span>Status</span><span>Ações</span></div>
              {filteredProducts.map((product) => (
                <article key={product.id}>
                  <div className={styles.tableProduct}><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.category} • {product.material}</small></span></div>
                  <div><strong>{money(product.priceCents)}</strong>{product.compareAtCents && <small>de {money(product.compareAtCents)}</small>}</div>
                  <div><strong>{product.stock}</strong><small>{product.stock <= 3 ? "Estoque baixo" : "Em estoque"}</small></div>
                  <div><span className={`${styles.statusPill} ${!product.active ? styles.inactivePill : ""}`}>{product.active ? "Publicado" : "Arquivado"}</span></div>
                  <div className={styles.rowActions}><button onClick={() => editProduct(product)}>Editar</button><button disabled={busy === `product-${product.id}`} onClick={() => toggleProduct(product)}>{product.active ? "Arquivar" : "Publicar"}</button></div>
                </article>
              ))}
              {!filteredProducts.length && <p className={styles.empty}>Nenhum produto encontrado.</p>}
            </div>
          </div>
        )}

        {section === "pedidos" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Vendas</p><h1>Pedidos</h1></div></div>
            <div className={styles.toolbar}><label>Buscar pedido<input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Número, cliente, e-mail ou telefone" /></label><span>{filteredOrders.length} pedidos</span></div>
            <div className={styles.orderList}>
              {filteredOrders.map((order) => (
                <article key={order.id} className={expandedOrder === order.id ? styles.expandedOrder : ""}>
                  <button className={styles.orderSummary} onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                    <span><small>Pedido</small><strong>{order.id}</strong></span>
                    <span><small>Cliente</small><strong>{order.customerName}</strong></span>
                    <span><small>Data</small><strong>{date(order.createdAt)}</strong></span>
                    <span><small>Total</small><strong>{money(order.totalCents)}</strong></span>
                    <em>{statusLabels[order.status] ?? order.status}</em><b>{expandedOrder === order.id ? "−" : "+"}</b>
                  </button>
                  {expandedOrder === order.id && (
                    <div className={styles.orderDetails}>
                      <div><h3>Itens</h3>{order.items.map((item) => <p key={item.id}><span>{item.quantity}× {item.productName}</span><strong>{money(item.unitPriceCents * item.quantity)}</strong></p>)}</div>
                      <div><h3>Entrega</h3><p>{order.address}, {order.addressNumber}{order.complement ? ` • ${order.complement}` : ""}</p><p>{order.cep} • {order.city}/{order.state}</p><p>{order.shippingMethod === "express" ? "Entrega expressa" : "Entrega padrão"}</p></div>
                      <div><h3>Cliente</h3><p>{order.email}</p><p>{order.phone}</p>{order.cpf && <p>CPF: {order.cpf}</p>}</div>
                      <div><h3>Situação do pedido</h3><select value={order.status} disabled={busy === `order-${order.id}`} onChange={(event) => changeOrderStatus(order.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Pagamento escolhido: {order.paymentMethod === "pix" ? "Pix" : "Cartão"}</small></div>
                    </div>
                  )}
                </article>
              ))}
              {!filteredOrders.length && <p className={styles.empty}>Nenhum pedido encontrado.</p>}
            </div>
          </div>
        )}

        {section === "configuracoes" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Conta</p><h1>Segurança</h1></div></div>
            <section className={styles.settingsCard}>
              <h2>Alterar senha</h2><p>Depois da alteração, todas as sessões serão encerradas e você precisará entrar novamente com o código do e-mail.</p>
              <form onSubmit={changePassword}>
                <label>Senha atual<input type="password" autoComplete="current-password" required value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></label>
                <label>Nova senha<input type="password" autoComplete="new-password" minLength={12} required value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></label>
                <label>Repita a nova senha<input type="password" autoComplete="new-password" minLength={12} required value={passwords.repeat} onChange={(event) => setPasswords({ ...passwords, repeat: event.target.value })} /></label>
                <button className={styles.primaryButton} disabled={busy === "password"}>{busy === "password" ? "Alterando…" : "Salvar nova senha"}</button>
              </form>
            </section>
          </div>
        )}
      </section>

      {wizardOpen && (
        <div className={styles.wizardOverlay} role="dialog" aria-modal="true" aria-label={draft.id ? "Editar produto" : "Cadastrar produto"}>
          <section className={styles.wizard}>
            <header><button onClick={() => setWizardOpen(false)}>Fechar</button><img src="/brand/logo.webp" alt="Elle Jew" /><span>{draft.id ? "Editar produto" : "Novo produto"}</span></header>
            <div className={styles.wizardSteps}>{[1, 2, 3].map((step) => <div key={step} className={wizardStep >= step ? styles.currentStep : ""}><i>{wizardStep > step ? "✓" : step}</i><span>{step === 1 ? "Informações" : step === 2 ? "Foto e detalhes" : "Preço e estoque"}</span></div>)}</div>
            <div className={styles.wizardBody}>
              {wizardStep === 1 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 1 de 3</p><h1>Qual joia você vai cadastrar?</h1><p>Comece pelas informações que ajudam a cliente a encontrar a peça.</p><div className={styles.formGrid}><label className={styles.fullField}>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Riviera Oval Moissanite" /></label><label>Categoria<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option>Colares</option><option>Brincos</option><option>Anéis</option><option>Pulseiras</option><option>Conjuntos</option><option>Tornozeleiras</option><option>Outros</option></select></label><label>Selo na vitrine<input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} placeholder="Ex.: Novidade" maxLength={50} /></label></div></div>}
              {wizardStep === 2 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 2 de 3</p><h1>Mostre cada detalhe.</h1><p>Use uma foto clara e descreva o que torna essa peça especial.</p><div className={styles.mediaGrid}><label className={styles.uploadBox}><span className={styles.visuallyHidden}>Escolher foto do produto</span>{draft.image ? <img src={draft.image} alt="Prévia do produto" /> : <><b>+</b><strong>Escolher foto</strong><small>JPG, PNG ou WebP • até 8 MB</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} /></label><div className={styles.formGrid}><label className={styles.fullField}>Material e acabamento<input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} placeholder="Prata 925 • Zircônias premium" /></label><label className={styles.fullField}>Descrição<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Conte como é a peça, os detalhes e por que ela é especial…" maxLength={900} /></label></div></div></div>}
              {wizardStep === 3 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 3 de 3</p><h1>Defina preço e estoque.</h1><p>Revise os dados. Ao salvar, a vitrine será atualizada automaticamente.</p><div className={styles.formGrid}><label>Preço de venda (R$)<input type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="298,00" /></label><label>Preço anterior (opcional)<input type="number" min="0.01" step="0.01" value={draft.compareAt} onChange={(event) => setDraft({ ...draft, compareAt: event.target.value })} placeholder="350,00" /></label><label>Quantidade em estoque<input type="number" min="0" step="1" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value })} /></label><label className={styles.switchLabel}><span className={styles.visuallyHidden}>Publicar na vitrine</span><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span><strong>Publicar na vitrine</strong><small>Desative para salvar sem mostrar às clientes</small></span></label></div><div className={styles.productReview}>{draft.image && <img src={draft.image} alt="" />}<span><strong>{draft.name || "Nome da joia"}</strong><small>{draft.category} • {draft.material}</small></span><b>{draft.price ? money(cents(draft.price)) : "R$ 0,00"}</b></div></div>}
            </div>
            <footer><button className={styles.secondaryButton} onClick={() => wizardStep === 1 ? setWizardOpen(false) : setWizardStep(wizardStep - 1)}>{wizardStep === 1 ? "Cancelar" : "← Voltar"}</button>{wizardStep < 3 ? <button className={styles.primaryButton} disabled={(wizardStep === 1 && !draft.name.trim()) || (wizardStep === 2 && (!draft.image || !draft.description.trim() || busy === "upload"))} onClick={() => setWizardStep(wizardStep + 1)}>{busy === "upload" ? "Enviando foto…" : "Continuar →"}</button> : <button className={styles.primaryButton} disabled={busy === "saveProduct" || !draft.price || draft.stock === ""} onClick={saveProduct}>{busy === "saveProduct" ? "Salvando…" : draft.id ? "Salvar alterações" : "Cadastrar e publicar"}</button>}</footer>
          </section>
        </div>
      )}

      {notice && <div className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : ""}`}>{notice.text}</div>}
    </main>
  );
}
