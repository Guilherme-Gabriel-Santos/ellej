"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categoryIds: string[];
  description: string;
  material: string;
  image: string;
  badge: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  active: boolean;
  featured: boolean;
  createdAt: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  active: boolean;
  sortOrder: number;
  productCount: number;
  image: string;
};

type Banner = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  linkUrl: string;
  linkLabel: string;
  active: boolean;
  sortOrder: number;
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
  neighborhood: string;
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
  superfreteServiceId: string;
  superfreteServiceName: string;
  superfreteDeliveryDays: number | null;
  superfreteQuotePriceCents: number | null;
  superfreteOrderId: string;
  superfreteProtocol: string;
  superfretePriceCents: number | null;
  superfreteStatus: string;
  superfreteTrackingCode: string;
  superfreteLabelUrl: string;
  superfreteUpdatedAt: string;
  createdAt: string;
  items: OrderItem[];
};

type Dashboard = {
  products: Product[];
  categories: Category[];
  banners: Banner[];
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
type Section = "inicio" | "produtos" | "categorias" | "banners" | "pedidos" | "configuracoes";

type ProductDraft = {
  id?: string;
  name: string;
  category: string;
  categoryIds: string[];
  badge: string;
  description: string;
  material: string;
  image: string;
  price: string;
  compareAt: string;
  stock: string;
  active: boolean;
  featured: boolean;
};

const emptyProduct: ProductDraft = {
  name: "",
  category: "Colares",
  categoryIds: [],
  badge: "",
  description: "",
  material: "Prata 925",
  image: "",
  price: "",
  compareAt: "",
  stock: "1",
  active: true,
  featured: false,
};

const emptyBanner = { id: "", title: "Foto da capa", subtitle: "", image: "", linkUrl: "", linkLabel: "" };

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
  const [categoryDraft, setCategoryDraft] = useState({ id: "", name: "", parentId: "", image: "" });
  const [bannerDraft, setBannerDraft] = useState(emptyBanner);
  const [bannerUploadProgress, setBannerUploadProgress] = useState<{ current: number; total: number } | null>(null);
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
    const defaultCategory = dashboard?.categories.find((category) => category.active && category.parentId) ?? dashboard?.categories.find((category) => category.active) ?? dashboard?.categories[0];
    setDraft({ ...emptyProduct, category: defaultCategory?.name ?? "", categoryIds: defaultCategory ? [defaultCategory.id] : [] });
    setWizardStep(1);
    setWizardOpen(true);
  }

  function editProduct(product: Product) {
    setDraft({
      id: product.id,
      name: product.name,
      category: product.category,
      categoryIds: product.categoryIds,
      badge: product.badge,
      description: product.description,
      material: product.material,
      image: product.image,
      price: (product.priceCents / 100).toFixed(2),
      compareAt: product.compareAtCents ? (product.compareAtCents / 100).toFixed(2) : "",
      stock: String(product.stock),
      active: product.active,
      featured: product.featured,
    });
    setWizardStep(1);
    setWizardOpen(true);
  }

  function toggleDraftCategory(category: Category) {
    setDraft((current) => {
      const selected = current.categoryIds.includes(category.id)
        ? current.categoryIds.filter((id) => id !== category.id)
        : [...current.categoryIds, category.id];
      const primary = dashboard?.categories.find((item) => item.id === selected[0]);
      return { ...current, categoryIds: selected, category: primary?.name ?? "" };
    });
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

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    setBusy("saveCategory");
    try {
      const action = categoryDraft.id ? "updateCategory" : "createCategory";
      const data = await post({ action, category: categoryDraft });
      setDashboard(data.dashboard);
      setCategoryDraft({ id: "", name: "", parentId: "", image: "" });
      setNotice({ type: "ok", text: categoryDraft.id ? "Categoria atualizada em todos os produtos." : "Categoria criada e pronta para receber produtos." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar a categoria." });
    } finally {
      setBusy("");
    }
  }

  async function toggleCategory(category: Category) {
    setBusy(`category-${category.id}`);
    try {
      const data = await post({ action: "setCategoryActive", categoryId: category.id, active: !category.active });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: category.active ? "Categoria ocultada da vitrine." : "Categoria publicada na vitrine." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar a categoria." });
    } finally {
      setBusy("");
    }
  }

  async function uploadCategoryImage(file: File) {
    setBusy("uploadCategory");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar a foto.");
      setCategoryDraft((current) => ({ ...current, image: data.url }));
      setNotice({ type: "ok", text: "Foto da categoria enviada." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar a foto." });
    } finally {
      setBusy("");
    }
  }

  async function moveCategory(category: Category, direction: -1 | 1) {
    if (!dashboard) return;
    const siblings = dashboard.categories.filter((item) => item.parentId === category.parentId);
    const siblingIndex = siblings.findIndex((item) => item.id === category.id);
    const targetSibling = siblingIndex + direction;
    if (targetSibling < 0 || targetSibling >= siblings.length) return;
    const ordered = [...dashboard.categories];
    const index = ordered.findIndex((item) => item.id === category.id);
    const target = ordered.findIndex((item) => item.id === siblings[targetSibling].id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("reorderCategories");
    try {
      const data = await post({ action: "reorderCategories", orderedIds: ordered.map((category) => category.id) });
      setDashboard(data.dashboard);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a ordem." });
    } finally {
      setBusy("");
    }
  }

  async function removeCategory(category: Category) {
    if (category.productCount > 0 || !window.confirm(`Excluir a categoria ${category.name}?`)) return;
    setBusy(`category-${category.id}`);
    try {
      const data = await post({ action: "deleteCategory", categoryId: category.id });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: "Categoria excluída." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível excluir a categoria." });
    } finally {
      setBusy("");
    }
  }

  async function uploadBannerFiles(selectedFiles: FileList) {
    if (!dashboard || !selectedFiles.length) return;

    const files = Array.from(selectedFiles);
    const isReplacing = Boolean(bannerDraft.id);
    const availableSlots = Math.max(0, 20 - dashboard.banners.length);
    const filesToUpload = isReplacing ? files.slice(0, 1) : files.slice(0, availableSlots);

    if (!filesToUpload.length) {
      setNotice({ type: "error", text: "O carrossel já atingiu o limite de 20 fotos." });
      return;
    }

    setBusy("uploadBanner");
    setBannerUploadProgress({ current: 0, total: filesToUpload.length });
    try {
      let uploaded = 0;

      for (const file of filesToUpload) {
        setBannerUploadProgress({ current: uploaded + 1, total: filesToUpload.length });
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body: form });
        const media = await response.json();
        if (!response.ok) throw new Error(media.error ?? "Não foi possível enviar a foto.");

        if (isReplacing) {
          setBannerDraft((current) => ({ ...current, image: media.url }));
        } else {
          const result = await post({ action: "createBanner", banner: { ...emptyBanner, image: media.url } });
          setDashboard(result.dashboard);
        }
        uploaded += 1;
      }

      const ignored = files.length - filesToUpload.length;
      setNotice({
        type: "ok",
        text: isReplacing
          ? "Foto substituta enviada. Clique em salvar para confirmar."
          : `${uploaded} ${uploaded === 1 ? "foto adicionada" : "fotos adicionadas"} ao carrossel.${ignored ? ` ${ignored} excederam o limite de 20 e não foram enviadas.` : ""}`,
      });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar as fotos." });
    } finally {
      setBannerUploadProgress(null);
      setBusy("");
    }
  }

  async function saveBanner(event: FormEvent) {
    event.preventDefault();
    setBusy("saveBanner");
    try {
      const data = await post({ action: bannerDraft.id ? "updateBanner" : "createBanner", banner: bannerDraft });
      setDashboard(data.dashboard);
      setBannerDraft(emptyBanner);
      setNotice({ type: "ok", text: bannerDraft.id ? "Banner atualizado na página inicial." : "Banner adicionado ao carrossel." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar o banner." });
    } finally {
      setBusy("");
    }
  }

  async function toggleBanner(banner: Banner) {
    setBusy(`banner-${banner.id}`);
    try {
      const data = await post({ action: "setBannerActive", bannerId: banner.id, active: !banner.active });
      setDashboard(data.dashboard);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar o banner." });
    } finally {
      setBusy("");
    }
  }

  async function moveBanner(index: number, direction: -1 | 1) {
    if (!dashboard) return;
    const target = index + direction;
    if (target < 0 || target >= dashboard.banners.length) return;
    const ordered = [...dashboard.banners];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("reorderBanners");
    try {
      const data = await post({ action: "reorderBanners", orderedIds: ordered.map((banner) => banner.id) });
      setDashboard(data.dashboard);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a ordem." });
    } finally {
      setBusy("");
    }
  }

  async function removeBanner(banner: Banner) {
    if (!window.confirm(`Excluir o banner “${banner.title}”?`)) return;
    setBusy(`banner-${banner.id}`);
    try {
      const data = await post({ action: "deleteBanner", bannerId: banner.id });
      setDashboard(data.dashboard);
      if (bannerDraft.id === banner.id) setBannerDraft(emptyBanner);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível excluir o banner." });
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

  async function runSuperFreteAction(order: Order, action: "createSuperFreteShipment" | "paySuperFreteShipment" | "refreshSuperFreteShipment" | "printSuperFreteShipment") {
    const labelTab = action === "printSuperFreteShipment" ? window.open("", "_blank") : null;
    setBusy(`shipping-${order.id}`);
    try {
      const data = await post({ action, orderId: order.id });
      setDashboard(data.dashboard);
      if (data.labelUrl) {
        if (labelTab) labelTab.location.href = data.labelUrl;
        else window.open(data.labelUrl, "_blank", "noopener,noreferrer");
      }
      setNotice({
        type: "ok",
        text: action === "createSuperFreteShipment"
          ? "Etiqueta preparada no SuperFrete. Nenhuma cobrança foi feita ainda."
          : action === "paySuperFreteShipment"
            ? "Pagamento da etiqueta solicitado ao SuperFrete."
            : action === "printSuperFreteShipment"
              ? "Etiqueta aberta para impressão."
              : "Situação da etiqueta atualizada.",
      });
    } catch (error) {
      labelTab?.close();
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível concluir no SuperFrete." });
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
          <button className={section === "categorias" ? styles.activeNav : ""} onClick={() => setSection("categorias")}><span>03</span> Categorias</button>
          <button className={section === "banners" ? styles.activeNav : ""} onClick={() => setSection("banners")}><span>04</span> Fotos da capa</button>
          <button className={section === "pedidos" ? styles.activeNav : ""} onClick={() => setSection("pedidos")}><span>05</span> Pedidos</button>
          <button className={section === "configuracoes" ? styles.activeNav : ""} onClick={() => setSection("configuracoes")}><span>06</span> Segurança</button>
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

        {section === "categorias" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Organização da loja</p><h1>Categorias</h1></div></div>
            <div className={styles.categoryLayout}>
              <section className={styles.categoryFormCard}>
                <p className={styles.eyebrow}>{categoryDraft.id ? "Editar categoria" : "Nova categoria"}</p>
                <h2>{categoryDraft.id ? "Altere o nome" : "Crie em poucos cliques"}</h2>
                <p>As categorias organizam o cadastro e aparecem como cartões clicáveis na página inicial.</p>
                <form onSubmit={saveCategory}>
                  <label>Nome da categoria<input maxLength={60} required value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} placeholder="Ex.: Anéis" /></label>
                  <label>Grupo principal<select value={categoryDraft.parentId} onChange={(event) => setCategoryDraft({ ...categoryDraft, parentId: event.target.value })}><option value="">Nenhum — esta é uma categoria principal</option>{dashboard.categories.filter((category) => !category.parentId && category.id !== categoryDraft.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  {!categoryDraft.parentId && <label className={styles.categoryImageUpload}>{categoryDraft.image ? <img src={categoryDraft.image} alt="Prévia da categoria" /> : <span><b>+</b> Foto do cartão</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && uploadCategoryImage(event.target.files[0])} /></label>}
                  <div><button className={styles.primaryButton} disabled={busy === "saveCategory" || busy === "uploadCategory"}>{busy === "uploadCategory" ? "Enviando foto…" : busy === "saveCategory" ? "Salvando…" : categoryDraft.id ? "Salvar alteração" : "+ Criar categoria"}</button>{categoryDraft.id && <button className={styles.textButton} type="button" onClick={() => setCategoryDraft({ id: "", name: "", parentId: "", image: "" })}>Cancelar</button>}</div>
                </form>
              </section>
              <section className={styles.categoryListCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Ordem da vitrine</p><h2>{dashboard.categories.length} categorias</h2></div></div>
                <p className={styles.categoryHelp}>Use as setas para escolher a ordem. Ocultar uma categoria retira temporariamente todos os seus produtos da vitrine.</p>
                <div className={styles.categoryList}>
                  {dashboard.categories.filter((category) => !category.parentId).map((root) => <section className={styles.categoryGroup} key={root.id}>
                    {[root, ...dashboard.categories.filter((category) => category.parentId === root.id)].map((category) => { const siblings = dashboard.categories.filter((item) => item.parentId === category.parentId); const index = siblings.findIndex((item) => item.id === category.id); return <article key={category.id} className={category.parentId ? styles.subcategoryRow : styles.rootCategoryRow}>
                      <div className={styles.categoryOrder}><button aria-label={`Mover ${category.name} para cima`} disabled={index === 0 || busy === "reorderCategories"} onClick={() => moveCategory(category, -1)}>↑</button><button aria-label={`Mover ${category.name} para baixo`} disabled={index === siblings.length - 1 || busy === "reorderCategories"} onClick={() => moveCategory(category, 1)}>↓</button></div>
                      <span><strong>{category.parentId ? category.name : category.name}</strong><small>{category.parentId ? "Subcategoria" : category.image ? "Cartão com foto" : "Foto automática"} • {category.productCount} {category.productCount === 1 ? "produto" : "produtos"}</small></span>
                      <em className={`${styles.statusPill} ${!category.active ? styles.inactivePill : ""}`}>{category.active ? "Visível" : "Oculta"}</em>
                      <div className={styles.categoryActions}><button onClick={() => setCategoryDraft({ id: category.id, name: category.name, parentId: category.parentId ?? "", image: category.image })}>Editar</button><button disabled={busy === `category-${category.id}`} onClick={() => toggleCategory(category)}>{category.active ? "Ocultar" : "Mostrar"}</button><button disabled={category.productCount > 0 || busy === `category-${category.id}`} onClick={() => removeCategory(category)}>Excluir</button></div>
                    </article>; })}
                  </section>)}
                  {!dashboard.categories.length && <p className={styles.empty}>Crie a primeira categoria para cadastrar produtos.</p>}
                </div>
              </section>
            </div>
          </div>
        )}

        {section === "banners" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Foto da direita</p><h1>Fotos da capa</h1></div></div>
            <div className={styles.bannerLayout}>
              <section className={styles.bannerFormCard}>
                <p className={styles.eyebrow}>{bannerDraft.id ? "Trocar foto" : "Nova foto"}</p>
                <h2>{bannerDraft.id ? "Escolha a substituta" : "Adicione ao carrossel"}</h2>
                <p>Estas fotos aparecem somente no lado direito da capa. Elas passam automaticamente, e a cliente também pode usar as setas.</p>
                <form onSubmit={saveBanner}>
                  <label className={styles.bannerUpload}>{bannerDraft.image ? <img src={bannerDraft.image} alt="Prévia da foto da capa" /> : <span><b>+</b> {bannerDraft.id ? "Escolher foto" : "Escolher várias fotos"}</span>}<input type="file" multiple={!bannerDraft.id} accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files?.length) void uploadBannerFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
                  {!bannerDraft.id && <p className={styles.categoryHelp}>{bannerUploadProgress ? `Enviando ${bannerUploadProgress.current} de ${bannerUploadProgress.total}…` : "Selecione todas as fotos de uma vez. Cada arquivo será adicionado automaticamente ao carrossel."}</p>}
                  <div><button className={styles.primaryButton} disabled={busy === "saveBanner" || busy === "uploadBanner" || !bannerDraft.image}>{busy === "uploadBanner" ? bannerUploadProgress ? `Enviando ${bannerUploadProgress.current}/${bannerUploadProgress.total}…` : "Enviando foto…" : busy === "saveBanner" ? "Salvando…" : bannerDraft.id ? "Salvar nova foto" : "+ Adicionar foto"}</button>{bannerDraft.id && <button type="button" className={styles.textButton} onClick={() => setBannerDraft(emptyBanner)}>Cancelar</button>}</div>
                </form>
              </section>
              <section className={styles.bannerListCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Ordem de exibição</p><h2>{dashboard.banners.length} {dashboard.banners.length === 1 ? "foto" : "fotos"}</h2></div></div>
                <p className={styles.categoryHelp}>Use as setas para escolher a sequência. Uma foto oculta continua salva, mas não aparece na capa.</p>
                <div className={styles.bannerList}>{dashboard.banners.map((banner, index) => <article key={banner.id}><img src={banner.image} alt="" /><span><strong>Foto {index + 1}</strong><small>{banner.active ? "Aparece no carrossel" : "Oculta da capa"}</small></span><em className={`${styles.statusPill} ${!banner.active ? styles.inactivePill : ""}`}>{banner.active ? "Visível" : "Oculta"}</em><div className={styles.bannerOrder}><button disabled={index === 0 || busy === "reorderBanners"} onClick={() => moveBanner(index, -1)}>↑</button><button disabled={index === dashboard.banners.length - 1 || busy === "reorderBanners"} onClick={() => moveBanner(index, 1)}>↓</button></div><div className={styles.categoryActions}><button onClick={() => setBannerDraft({ id: banner.id, title: banner.title || "Foto da capa", subtitle: "", image: banner.image, linkUrl: "", linkLabel: "" })}>Trocar foto</button><button disabled={busy === `banner-${banner.id}`} onClick={() => toggleBanner(banner)}>{banner.active ? "Ocultar" : "Mostrar"}</button><button disabled={busy === `banner-${banner.id}`} onClick={() => removeBanner(banner)}>Excluir</button></div></article>)}</div>
                {!dashboard.banners.length && <p className={styles.empty}>Adicione a primeira foto da capa.</p>}
              </section>
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
                      <div><h3>Entrega</h3><p>{order.address}, {order.addressNumber}{order.complement ? ` • ${order.complement}` : ""}</p>{order.neighborhood && <p>{order.neighborhood}</p>}<p>{order.cep} • {order.city}/{order.state}</p><p>{order.superfreteServiceName || "SuperFrete"}{order.superfreteDeliveryDays ? ` • ${order.superfreteDeliveryDays} ${order.superfreteDeliveryDays === 1 ? "dia útil" : "dias úteis"}` : ""}</p></div>
                      <div><h3>Cliente</h3><p>{order.email}</p><p>{order.phone}</p>{order.cpf && <p>CPF: {order.cpf}</p>}</div>
                      <div><h3>Situação do pedido</h3><select value={order.status} disabled={busy === `order-${order.id}`} onChange={(event) => changeOrderStatus(order.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Pagamento escolhido: {order.paymentMethod === "pix" ? "Pix" : "Cartão"}</small></div>
                      <div><h3>Etiqueta SuperFrete</h3><p>{order.superfreteStatus ? `Situação: ${order.superfreteStatus}` : "Ainda não preparada"}</p>{order.superfreteTrackingCode && <p>Rastreio: <strong>{order.superfreteTrackingCode}</strong></p>}{order.superfretePriceCents !== null && <p>Custo da etiqueta: <strong>{money(order.superfretePriceCents)}</strong></p>}<div className={styles.rowActions}>{!order.superfreteOrderId && ["pago", "em_separacao", "enviado", "concluido"].includes(order.status) && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "createSuperFreteShipment")}>Preparar etiqueta</button>}{order.superfreteOrderId && order.superfreteStatus === "pending" && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "paySuperFreteShipment")}>Pagar etiqueta</button>}{order.superfreteOrderId && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "refreshSuperFreteShipment")}>Atualizar</button>}{order.superfreteOrderId && ["released", "posted", "delivered"].includes(order.superfreteStatus) && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "printSuperFreteShipment")}>Imprimir etiqueta</button>}</div><small>O botão “Pagar etiqueta” usa o saldo disponível na conta SuperFrete.</small></div>
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
              {wizardStep === 1 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 1 de 3</p><h1>Qual joia você vai cadastrar?</h1><p>Comece pelas informações que ajudam a cliente a encontrar a peça.</p><div className={styles.formGrid}><label className={styles.fullField}>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Riviera Oval Moissanite" /></label><div className={`${styles.fullField} ${styles.categoryPicker}`}><strong>Categorias do produto</strong><small>Marque quantas forem necessárias.</small>{dashboard.categories.filter((item) => !item.parentId).map((root) => { const children = dashboard.categories.filter((item) => item.parentId === root.id); const options = children.length ? children : [root]; return <fieldset key={root.id}><legend>{root.name}</legend>{options.map((item) => <label key={item.id}><input type="checkbox" checked={draft.categoryIds.includes(item.id)} onChange={() => toggleDraftCategory(item)} /><span>{item.name}{item.active ? "" : " (oculta)"}</span></label>)}</fieldset>; })}</div><label>Selo na vitrine<input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} placeholder="Ex.: Novidade" maxLength={50} /></label></div></div>}
              {wizardStep === 2 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 2 de 3</p><h1>Mostre cada detalhe.</h1><p>Use uma foto clara e descreva o que torna essa peça especial.</p><div className={styles.mediaGrid}><label className={styles.uploadBox}><span className={styles.visuallyHidden}>Escolher foto do produto</span>{draft.image ? <img src={draft.image} alt="Prévia do produto" /> : <><b>+</b><strong>Escolher foto</strong><small>JPG, PNG ou WebP • até 8 MB</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} /></label><div className={styles.formGrid}><label className={styles.fullField}>Material e acabamento<input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} placeholder="Prata 925 • Zircônias premium" /></label><label className={styles.fullField}>Descrição<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Conte como é a peça, os detalhes e por que ela é especial…" maxLength={3000} /></label></div></div></div>}
              {wizardStep === 3 && <div className={styles.wizardForm}><p className={styles.eyebrow}>Etapa 3 de 3</p><h1>Defina preço e estoque.</h1><p>Revise os dados. Ao salvar, a vitrine será atualizada automaticamente.</p><div className={styles.formGrid}><label>Preço de venda (R$)<input type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="298,00" /></label><label>Preço anterior (opcional)<input type="number" min="0.01" step="0.01" value={draft.compareAt} onChange={(event) => setDraft({ ...draft, compareAt: event.target.value })} placeholder="350,00" /></label><label>Quantidade em estoque<input type="number" min="0" step="1" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value })} /></label><label className={styles.switchLabel}><span className={styles.visuallyHidden}>Publicar na vitrine</span><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span><strong>Publicar na vitrine</strong><small>Desative para salvar sem mostrar às clientes</small></span></label><label className={styles.switchLabel}><span className={styles.visuallyHidden}>Destacar na página inicial</span><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /><span><strong>Destacar na página inicial</strong><small>Mostra a joia na seleção curta da home</small></span></label></div><div className={styles.productReview}>{draft.image && <img src={draft.image} alt="" />}<span><strong>{draft.name || "Nome da joia"}</strong><small>{draft.category} • {draft.material}</small></span><b>{draft.price ? money(cents(draft.price)) : "R$ 0,00"}</b></div></div>}
            </div>
            <footer><button className={styles.secondaryButton} onClick={() => wizardStep === 1 ? setWizardOpen(false) : setWizardStep(wizardStep - 1)}>{wizardStep === 1 ? "Cancelar" : "← Voltar"}</button>{wizardStep < 3 ? <button className={styles.primaryButton} disabled={(wizardStep === 1 && (!draft.name.trim() || !draft.categoryIds.length)) || (wizardStep === 2 && (!draft.image || !draft.description.trim() || busy === "upload"))} onClick={() => setWizardStep(wizardStep + 1)}>{busy === "upload" ? "Enviando foto…" : "Continuar →"}</button> : <button className={styles.primaryButton} disabled={busy === "saveProduct" || !draft.price || draft.stock === ""} onClick={saveProduct}>{busy === "saveProduct" ? "Salvando…" : draft.id ? "Salvar alterações" : "Cadastrar e publicar"}</button>}</footer>
          </section>
        </div>
      )}

      {notice && <div className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : ""}`}>{notice.text}</div>}
    </main>
  );
}
