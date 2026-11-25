"use client";

import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import Link from "next/link";
import styles from "./admin.module.css";
import { applyProductDiscount, MAX_PRODUCT_DISCOUNT_PERCENT, normalizeDiscountPercent } from "../../lib/pricing";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categoryIds: string[];
  description: string;
  material: string;
  image: string;
  video: string;
  media: Array<{ type: "image" | "video"; url: string }>;
  catalogData: CatalogData;
  variants: ProductVariant[];
  multiOptionsEnabled: boolean;
  optionGroups: ProductOptionGroup[];
  visibility: string;
  trackStock: boolean;
  priceVisible: boolean;
  freeShipping: boolean;
  pixDiscountEnabled: boolean;
  pixDiscountPercent: number;
  discountPercent?: number;
  personalizationEnabled: boolean;
  personalizationMaxChars: number;
  badge: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  active: boolean;
  featured: boolean;
  sortOrder: number;
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
  focalX: number;
  focalY: number;
  active: boolean;
  sortOrder: number;
};

type OrderItem = { id: number; productId: string; variantId: string; variantLabel: string; personalizationText: string; productName: string; unitPriceCents: number; quantity: number };
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
  pixDiscountCents: number;
  couponCode: string;
  couponDiscountCents: number;
  shippingDiscountCents: number;
  totalCents: number;
  status: string;
  paymentStatus: string;
  stockIssue?: boolean;
  paymentProvider: string;
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

type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: "none" | "percentage" | "fixed";
  discountValue: number;
  freeShipping: boolean;
  appliesTo: "all" | "selected";
  minimumSubtotalCents: number;
  maximumDiscountCents: number | null;
  usageLimit: number | null;
  perCustomerLimit?: number | null;
  usageCount: number;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Review = {
  id: string;
  customerName: string;
  location: string;
  rating: number;
  body: string;
  productName: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type Dashboard = {
  products: Product[];
  categories: Category[];
  banners: Banner[];
  orders: Order[];
  coupons: Coupon[];
  reviews: Review[];
  allCategoryImage: string;
  launch?: {
    launchAt: string;
    emailConfigured: boolean;
    teaserProductIds: string[];
    waitlist: { total: number; active: number; notified: number; unsubscribed: number; failed: number };
  };
  stats: {
    activeProducts: number;
    lowStock: number;
    pendingOrders: number;
    paidRevenueCents: number;
    subscribers: number;
  };
};

type AuthState = "loading" | "setup" | "login" | "code" | "authenticated";
type Section = "inicio" | "produtos" | "categorias" | "banners" | "cupons" | "avaliacoes" | "pedidos" | "lancamento" | "configuracoes";
type AdminPasskey = { id: string; label: string; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type ProductMedia = { type: "image" | "video"; url: string };
type ProductVariant = { id: string; size: string; color: string; material: string; sku: string; priceCents: number; stock: number; active: boolean };
type ProductOption = { id: string; label: string; addedPriceCents: number; active: boolean };
type ProductOptionGroup = { id: string; name: string; options: ProductOption[]; selectionMode?: "manual" | "personalizationLength" };
type CatalogData = { costCents: number; sku: string; barcode: string; weightGrams: number; lengthCm: number; widthCm: number; heightCm: number; mpn: string; ageGroup: string; gender: string; tags: string; brand: string; seoTitle: string; seoDescription: string };

type ProductDraft = {
  id?: string;
  name: string;
  category: string;
  categoryIds: string[];
  badge: string;
  description: string;
  material: string;
  image: string;
  video: string;
  media: ProductMedia[];
  slug: string;
  catalogData: CatalogData;
  variants: ProductVariant[];
  multiOptionsEnabled: boolean;
  optionGroups: ProductOptionGroup[];
  visibility: string;
  trackStock: boolean;
  priceVisible: boolean;
  freeShipping: boolean;
  pixDiscountEnabled: boolean;
  pixDiscountPercent: number;
  discountPercent?: number;
  personalizationEnabled: boolean;
  personalizationMaxChars: number;
  price: string;
  compareAt: string;
  stock: string;
  active: boolean;
  featured: boolean;
};

type CouponDraft = {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: "none" | "percentage" | "fixed";
  discountValue: string;
  freeShipping: boolean;
  appliesTo: "all" | "selected";
  productIds: string[];
  minimumSubtotal: string;
  maximumDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  expiresAt: string;
  active: boolean;
};

type ReviewDraft = {
  id: string;
  customerName: string;
  location: string;
  rating: number;
  body: string;
  productName: string;
  active: boolean;
};

const videoExtensions = [".mp4", ".webm", ".mov", ".m4v", ".qt"];

function isVideoFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("video/") || videoExtensions.some((extension) => name.endsWith(extension));
}

const emptyProduct: ProductDraft = {
  name: "",
  category: "Colares",
  categoryIds: [],
  badge: "",
  description: "",
  material: "Prata 925",
  image: "",
  video: "",
  media: [],
  slug: "",
  catalogData: { costCents: 0, sku: "", barcode: "", weightGrams: 300, lengthCm: 18, widthCm: 18, heightCm: 6, mpn: "", ageGroup: "adult", gender: "female", tags: "", brand: "Elle Jew", seoTitle: "", seoDescription: "" },
  variants: [],
  multiOptionsEnabled: false,
  optionGroups: [],
  visibility: "visible",
  trackStock: true,
  priceVisible: true,
  freeShipping: false,
  pixDiscountEnabled: false,
  pixDiscountPercent: 0,
  discountPercent: 0,
  personalizationEnabled: false,
  personalizationMaxChars: 20,
  price: "",
  compareAt: "",
  stock: "1",
  active: true,
  featured: false,
};

const emptyBanner = { id: "", title: "Foto da capa", subtitle: "", image: "", linkUrl: "", linkLabel: "", focalX: 50, focalY: 24 };
const emptyCoupon: CouponDraft = { id: "", code: "", name: "", description: "", discountType: "percentage", discountValue: "10", freeShipping: false, appliesTo: "all", productIds: [], minimumSubtotal: "", maximumDiscount: "", usageLimit: "", perCustomerLimit: "", startsAt: "", expiresAt: "", active: true };
const emptyReview: ReviewDraft = { id: "", customerName: "", location: "", rating: 0, body: "", productName: "", active: true };
const productDraftStorageKey = "elle-jew-admin-product-draft-v1";

function readSavedProductDraft() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(productDraftStorageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { draft?: Partial<ProductDraft>; step?: number };
    if (!saved.draft || typeof saved.draft !== "object") return null;
    const draft: ProductDraft = {
      ...emptyProduct,
      ...saved.draft,
      catalogData: { ...emptyProduct.catalogData, ...(saved.draft.catalogData ?? {}) },
      media: Array.isArray(saved.draft.media) ? saved.draft.media.slice(0, 5) as ProductMedia[] : [],
      variants: Array.isArray(saved.draft.variants) ? saved.draft.variants as ProductVariant[] : [],
      optionGroups: Array.isArray(saved.draft.optionGroups) ? saved.draft.optionGroups as ProductOptionGroup[] : [],
      categoryIds: Array.isArray(saved.draft.categoryIds) ? saved.draft.categoryIds.filter((id): id is string => typeof id === "string") : [],
    };
    if (!draft.name && !draft.description && !draft.media.length) return null;
    return { draft, step: Math.max(1, Math.min(5, Math.trunc(Number(saved.step) || 1))) };
  } catch {
    window.localStorage.removeItem(productDraftStorageKey);
    return null;
  }
}

function clearSavedProductDraft() {
  try {
    window.localStorage.removeItem(productDraftStorageKey);
  } catch {
    // The panel remains usable when the browser blocks local storage.
  }
}

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

const paymentLabel = (value: string) => value === "pix" ? "Pix" : value === "credit_card" || value === "card" ? "Cartão" : "Asaas (Pix ou cartão)";

function paymentStatusLabel(order: Order) {
  if (order.paymentStatus === "PAID_AFTER_CANCEL") return "⚠ Pago após cancelamento manual • avaliar estorno";
  if (order.paymentStatus === "AMOUNT_MISMATCH") return "⚠ Valor pago diferente do pedido • verificar no Asaas";
  if (order.stockIssue && ["pago", "em_separacao", "enviado", "concluido"].includes(order.status)) return "⚠ Pago, mas sem estoque • contatar cliente";
  if (["pago", "em_separacao", "enviado", "concluido"].includes(order.status)) return "Pagamento confirmado";
  if (order.paymentStatus === "CHECKOUT_EXPIRED") return "Não pago • cancelado após 1 hora";
  if (order.paymentStatus === "CHECKOUT_CANCELED") return "Checkout cancelado";
  if (order.paymentStatus === "CHECKOUT_ERROR") return "Falha ao iniciar pagamento";
  if (order.status === "aguardando_pagamento") return "Aguardando confirmação do Asaas";
  return order.paymentStatus || "Sem confirmação de pagamento";
}

const orderStatusTone: Record<string, "ok" | "warn" | "info" | "danger"> = {
  aguardando_pagamento: "warn",
  pago: "ok",
  em_separacao: "info",
  enviado: "info",
  concluido: "ok",
  cancelado: "danger",
};

const iconPaths: Record<string, string> = {
  inicio: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  produtos: "M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 18M15 3l-3 18",
  categorias: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  banners: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  cupons: "M3 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3zM14 6v12",
  avaliacoes: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  pedidos: "M5 7h14l-1 13H6zM9 7a3 3 0 0 1 6 0",
  lancamento: "M12 3v3M12 18v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M3 12h3M18 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  configuracoes: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  estoque: "M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5l9 4.5 9-4.5M12 12v9",
  alerta: "M12 3 2 20h20zM12 9v5M12 17h.01",
  relogio: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  vendas: "M4 19h16M7 15v-4M12 15V7M17 15v-6",
};

function AdminIcon({ name }: { name: keyof typeof iconPaths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={iconPaths[name]} /></svg>;
}

function orderStatusLabel(order: Order) {
  if (order.status === "cancelado" && order.paymentStatus === "CHECKOUT_EXPIRED") return "Cancelado • não pago";
  return statusLabels[order.status] ?? order.status;
}

function cents(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function localDateTime(value: string) {
  if (!value) return "";
  const dateValue = new Date(value);
  if (!Number.isFinite(dateValue.getTime())) return "";
  const local = new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function passkeyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === "NotAllowedError") return "A confirmação do Face ID foi cancelada ou expirou.";
  if (error instanceof Error && error.name === "InvalidStateError") return "Este Face ID já está cadastrado neste aparelho.";
  return error instanceof Error ? error.message : fallback;
}

export function AdminPanel() {
  const [teaserDraft, setTeaserDraft] = useState<string[] | null>(null);
  const stockSnapshotRef = useRef<{ id: string; stock: number; variants: Array<{ id: string; stock: number }> } | null>(null);
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
  const [passkeys, setPasskeys] = useState<AdminPasskey[]>([]);
  const [passkeyLoginAvailable, setPasskeyLoginAvailable] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [appInstalled, setAppInstalled] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct);
  const [productSearch, setProductSearch] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({ id: "", name: "", parentId: "", image: "" });
  const [bannerDraft, setBannerDraft] = useState(emptyBanner);
  const [bannerUploadProgress, setBannerUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [draggedBannerId, setDraggedBannerId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(emptyCoupon);
  const [couponProductSearch, setCouponProductSearch] = useState("");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(emptyReview);
  const [passwords, setPasswords] = useState({ current: "", next: "", repeat: "" });

  useEffect(() => {
    fetch("/api/admin", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.authenticated) {
          setAdminEmail(data.admin.email);
          setPasskeys(data.admin.passkeys ?? []);
          setPasskeyLoginAvailable((data.admin.passkeys ?? []).length > 0);
          setDashboard(data.dashboard);
          setAuth("authenticated");
          const saved = readSavedProductDraft();
          if (saved) {
            setDraft(saved.draft);
            setWizardStep(saved.step);
            setWizardOpen(true);
            setSection("produtos");
            setNotice({ type: "ok", text: "Seu cadastro anterior foi recuperado. Você pode continuar de onde parou." });
          }
        } else {
          setSetupConfigured(data.setupConfigured !== false);
          setPasskeyLoginAvailable(data.passkeyLoginAvailable === true);
          setAuth(data.setupRequired ? "setup" : "login");
        }
      })
      .catch((error) => {
        setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível abrir o painel." });
        setAuth("login");
      });
  }, []);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const detectDeviceCapabilities = () => {
      const navigatorStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setPasskeySupported(browserSupportsWebAuthn());
      setAppInstalled(standaloneQuery.matches || navigatorStandalone);
      setIosDevice(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    };
    const detectionFrame = window.requestAnimationFrame(detectDeviceCapabilities);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).catch(() => undefined);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
    };
    const handleDisplayMode = (event: MediaQueryListEvent) => setAppInstalled(event.matches);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    standaloneQuery.addEventListener("change", handleDisplayMode);
    return () => {
      window.cancelAnimationFrame(detectionFrame);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      standaloneQuery.removeEventListener("change", handleDisplayMode);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!wizardOpen) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(productDraftStorageKey, JSON.stringify({ draft, step: wizardStep, savedAt: Date.now() }));
      } catch {
        // The panel remains usable when the browser blocks local storage.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, wizardOpen, wizardStep]);

  function closeProductWizard() {
    clearSavedProductDraft();
    setWizardOpen(false);
  }

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

  async function saveLaunchTeasers(productIds: string[]) {
    setBusy("launchTeasers");
    try {
      const data = await post({ action: "saveLaunchTeasers", productIds });
      if (data.dashboard) setDashboard(data.dashboard);
      setTeaserDraft(null);
      setNotice({ type: "ok", text: productIds.length ? "Spoilers atualizados na tela de lançamento." : "Spoilers removidos. A tela usará as fotos padrão." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar os spoilers." });
    } finally {
      setBusy("");
    }
  }

  async function sendLaunchTest() {
    setBusy("launchTest");
    try {
      await post({ action: "sendLaunchTest" });
      setNotice({ type: "ok", text: `E-mail de teste enviado para ${adminEmail || "o seu e-mail de admin"}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar o teste." });
    } finally {
      setBusy("");
    }
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
      if (data.authenticated) {
        setAdminEmail(data.admin.email);
        setPasskeys(data.admin.passkeys ?? []);
        setPasskeyLoginAvailable((data.admin.passkeys ?? []).length > 0);
        setDashboard(data.dashboard);
        setLogin((current) => ({ ...current, password: "" }));
        setAuth("authenticated");
        setNotice({ type: "ok", text: "Acesso liberado. Bem-vinda ao painel." });
        const saved = readSavedProductDraft();
        if (saved) {
          setDraft(saved.draft);
          setWizardStep(saved.step);
          setWizardOpen(true);
          setSection("produtos");
          setNotice({ type: "ok", text: "Seu cadastro anterior foi recuperado. Você pode continuar de onde parou." });
        }
        return;
      }
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
      setPasskeys(data.admin.passkeys ?? []);
      setPasskeyLoginAvailable((data.admin.passkeys ?? []).length > 0);
      setDashboard(data.dashboard);
      setLogin((current) => ({ ...current, password: "" }));
      setAuth("authenticated");
      setNotice({ type: "ok", text: "Acesso confirmado. Bem-vinda ao painel." });
      const saved = readSavedProductDraft();
      if (saved) {
        setDraft(saved.draft);
        setWizardStep(saved.step);
        setWizardOpen(true);
        setSection("produtos");
        setNotice({ type: "ok", text: "Seu cadastro anterior foi recuperado. Você pode continuar de onde parou." });
      }
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Código inválido." });
    } finally {
      setBusy("");
    }
  }

  async function loginWithPasskey() {
    if (!passkeySupported) {
      setNotice({ type: "error", text: "Este navegador não oferece Face ID ou passkeys." });
      return;
    }
    setBusy("passkeyLogin");
    try {
      const begin = await post({ action: "beginPasskeyLogin" });
      const credential = await startAuthentication({ optionsJSON: begin.options });
      const data = await post({ action: "finishPasskeyLogin", challengeId: begin.challengeId, response: credential });
      setAdminEmail(data.admin.email);
      setPasskeys(data.admin.passkeys ?? []);
      setPasskeyLoginAvailable(true);
      setDashboard(data.dashboard);
      setAuth("authenticated");
      setNotice({ type: "ok", text: "Face ID confirmado. Bem-vinda ao painel." });
    } catch (error) {
      setNotice({ type: "error", text: passkeyErrorMessage(error, "Não foi possível entrar com Face ID.") });
    } finally {
      setBusy("");
    }
  }

  async function registerPasskey() {
    if (!passkeySupported) {
      setNotice({ type: "error", text: "Abra o painel pelo Safari em um aparelho compatível com Face ID ou passkeys." });
      return;
    }
    setBusy("registerPasskey");
    try {
      const begin = await post({ action: "beginPasskeyRegistration" });
      const credential = await startRegistration({ optionsJSON: begin.options });
      const data = await post({
        action: "finishPasskeyRegistration",
        challengeId: begin.challengeId,
        response: credential,
        label: iosDevice ? "Face ID do iPhone" : "Passkey deste aparelho",
      });
      setPasskeys(data.passkeys ?? []);
      setPasskeyLoginAvailable(true);
      setNotice({ type: "ok", text: "Face ID ativado. Nos próximos acessos, basta confirmar o rosto." });
    } catch (error) {
      setNotice({ type: "error", text: passkeyErrorMessage(error, "Não foi possível ativar o Face ID.") });
    } finally {
      setBusy("");
    }
  }

  async function removePasskey(passkey: AdminPasskey) {
    if (!window.confirm(`Remover “${passkey.label}” do acesso ao painel?`)) return;
    setBusy(`removePasskey-${passkey.id}`);
    try {
      const data = await post({ action: "deletePasskey", credentialId: passkey.id });
      setPasskeys(data.passkeys ?? []);
      setPasskeyLoginAvailable((data.passkeys ?? []).length > 0);
      setNotice({ type: "ok", text: "Acesso por Face ID removido deste aparelho." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível remover o Face ID." });
    } finally {
      setBusy("");
    }
  }

  async function installAdminApp() {
    if (appInstalled) {
      setNotice({ type: "ok", text: "O app Elle Jew Admin já está instalado neste aparelho." });
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return;
    }
    setNotice({
      type: "ok",
      text: iosDevice
        ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
        : "Abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.",
    });
  }

  async function logout() {
    setBusy("logout");
    try {
      await post({ action: "logout" });
      setDashboard(null);
      setPasskeys([]);
      setAuth("login");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível sair." });
    } finally {
      setBusy("");
    }
  }

  function openNewProduct() {
    const defaultCategory = dashboard?.categories.find((category) => category.active && category.parentId) ?? dashboard?.categories.find((category) => category.active) ?? dashboard?.categories[0];
    clearSavedProductDraft();
    setDraft({ ...emptyProduct, category: defaultCategory?.name ?? "", categoryIds: defaultCategory ? [defaultCategory.id] : [] });
    setWizardStep(1);
    setWizardOpen(true);
  }

  function editProduct(product: Product) {
    clearSavedProductDraft();
    stockSnapshotRef.current = { id: product.id, stock: product.stock, variants: (product.variants ?? []).map((variant) => ({ id: variant.id, stock: variant.stock })) };
    setDraft({
      id: product.id,
      name: product.name,
      category: product.category,
      categoryIds: product.categoryIds,
      badge: product.badge,
      description: product.description,
      material: product.material,
      image: product.image,
      video: product.video,
      media: product.media?.length ? product.media : product.image ? [{ type: "image" as const, url: product.image }] : [],
      slug: product.slug,
      catalogData: product.catalogData ?? emptyProduct.catalogData,
      variants: product.variants ?? [],
      multiOptionsEnabled: product.multiOptionsEnabled ?? false,
      optionGroups: product.optionGroups ?? [],
      visibility: product.visibility ?? (product.active ? "visible" : "hidden"),
      trackStock: product.trackStock ?? true,
      priceVisible: product.priceVisible ?? true,
      freeShipping: product.freeShipping ?? false,
      pixDiscountEnabled: product.pixDiscountEnabled ?? false,
      pixDiscountPercent: product.pixDiscountPercent ?? 0,
      discountPercent: product.discountPercent ?? 0,
      personalizationEnabled: product.personalizationEnabled ?? false,
      personalizationMaxChars: product.personalizationMaxChars ?? 20,
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

  async function uploadMediaFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    if (selected.length + draft.media.length > 10) {
      setNotice({ type: "error", text: "Cada produto pode ter no máximo 10 mídias." });
      return;
    }
    setBusy("media");
    try {
      const uploaded: Array<{ type: "image" | "video"; url: string }> = [];
      for (const file of selected) {
        const type = isVideoFile(file) ? "video" : "image";
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `Não foi possível enviar ${file.name}.`);
        uploaded.push({ type, url: data.url });
      }
      setDraft((current) => {
        const media = [...current.media, ...uploaded].slice(0, 10);
        return { ...current, media, image: media.find((item) => item.type === "image")?.url ?? "", video: media.find((item) => item.type === "video")?.url ?? "" };
      });
      setNotice({ type: "ok", text: `${uploaded.length} mídia(s) adicionada(s).` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar as mídias." });
    } finally {
      setBusy("");
    }
  }

  function removeDraftMedia(index: number) {
    setDraft((current) => {
      const media = current.media.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, media, image: media.find((item) => item.type === "image")?.url ?? "", video: media.find((item) => item.type === "video")?.url ?? "" };
    });
  }

  function moveDraftMedia(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.media.length) return current;
      const media = [...current.media];
      [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
      return { ...current, media, image: media[0]?.type === "image" ? media[0].url : (media.find((item) => item.type === "image")?.url ?? ""), video: media.find((item) => item.type === "video")?.url ?? "" };
    });
  }

  async function saveProduct() {
    setBusy("saveProduct");
    try {
      const product = {
        ...draft,
        priceCents: cents(draft.price),
        compareAtCents: draft.compareAt && !draft.discountPercent ? cents(draft.compareAt) : null,
        discountPercent: draft.discountPercent ?? 0,
        stock: Number(draft.stock),
      };
      const stockSnapshot = draft.id && stockSnapshotRef.current?.id === draft.id ? stockSnapshotRef.current : undefined;
      await post({ action: draft.id ? "updateProduct" : "createProduct", product: { ...product, stockSnapshot } });
      stockSnapshotRef.current = null;
      clearSavedProductDraft();
      setWizardOpen(false);
      setNotice({ type: "ok", text: draft.id ? "Produto atualizado e vitrine sincronizada." : "Produto cadastrado e publicado na vitrine." });
      setSection("produtos");
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const response = await fetch("/api/admin", { cache: "no-store", credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok || !data.authenticated) throw new Error(data.error ?? "Não foi possível atualizar a lista.");
        startTransition(() => setDashboard(data.dashboard));
      } catch {
        setNotice({ type: "ok", text: "Produto salvo com sucesso. Atualize a página para renovar a lista." });
      }
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

  async function uploadAllCategoryImage(file: File) {
    setBusy("uploadAllCategoryImage");
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadResponse = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", body: form });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadData.error ?? "Não foi possível enviar a foto.");
      const data = await post({ action: "updateAllCategoryImage", image: uploadData.url });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: "Foto do cartão \"Todas as joias\" atualizada." });
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
        form.append("context", "banner");
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

  async function previewStore() {
    const previewWindow = window.open("about:blank", "ellejew-store-preview");
    setBusy("storePreview");
    try {
      const data = await post({ action: "enableStorePreview" });
      const previewUrl = String(data.previewUrl ?? "/");
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location.replace(previewUrl);
      } else {
        window.location.assign(previewUrl);
      }
      setNotice({ type: "ok", text: "Pré-visualização liberada neste navegador por 30 minutos." });
    } catch (error) {
      previewWindow?.close();
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível abrir a pré-visualização." });
    } finally {
      setBusy("");
    }
  }

  async function moveProduct(index: number, direction: -1 | 1) {
    if (!dashboard || productSearch.trim()) return;
    const target = index + direction;
    if (target < 0 || target >= dashboard.products.length) return;
    const ordered = [...dashboard.products];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("reorderProducts");
    try {
      const data = await post({ action: "reorderProducts", orderedIds: ordered.map((product) => product.id) });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: "Ordem dos produtos atualizada na vitrine." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a ordem." });
    } finally {
      setBusy("");
    }
  }

  function updateCatalog<K extends keyof CatalogData>(key: K, value: CatalogData[K]) {
    setDraft((current) => ({ ...current, catalogData: { ...current.catalogData, [key]: value } }));
  }

  function addVariant() {
    setDraft((current) => ({ ...current, variants: [...current.variants, { id: `var_${crypto.randomUUID()}`, size: "", color: "", material: "", sku: "", priceCents: current.price ? cents(current.price) : 0, stock: 0, active: true }] }));
  }

  function updateVariant(index: number, changes: Partial<ProductVariant>) {
    setDraft((current) => ({ ...current, variants: current.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...changes } : variant) }));
  }

  function removeVariant(index: number) {
    setDraft((current) => ({ ...current, variants: current.variants.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function addOptionGroup() {
    setDraft((current) => ({ ...current, optionGroups: [...current.optionGroups, { id: `grp_${crypto.randomUUID().slice(0, 8)}`, name: "", options: [{ id: `opt_${crypto.randomUUID().slice(0, 8)}`, label: "", addedPriceCents: 0, active: true }] }] }));
  }

  function updateOptionGroup(index: number, changes: Partial<ProductOptionGroup>) {
    setDraft((current) => ({ ...current, optionGroups: current.optionGroups.map((group, itemIndex) => itemIndex === index ? { ...group, ...changes } : group) }));
  }

  function addOption(groupIndex: number) {
    setDraft((current) => ({ ...current, optionGroups: current.optionGroups.map((group, index) => index === groupIndex ? { ...group, options: [...group.options, { id: `opt_${crypto.randomUUID().slice(0, 8)}`, label: "", addedPriceCents: 0, active: true }] } : group) }));
  }

  function updateOption(groupIndex: number, optionIndex: number, changes: Partial<ProductOption>) {
    setDraft((current) => ({ ...current, optionGroups: current.optionGroups.map((group, index) => index === groupIndex ? { ...group, options: group.options.map((option, itemIndex) => itemIndex === optionIndex ? { ...option, ...changes } : option) } : group) }));
  }

  function removeOptionGroup(index: number) {
    setDraft((current) => ({ ...current, optionGroups: current.optionGroups.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    setDraft((current) => ({ ...current, optionGroups: current.optionGroups.map((group, index) => index === groupIndex ? { ...group, options: group.options.filter((_, itemIndex) => itemIndex !== optionIndex) } : group) }));
  }

  async function copyCatalogUrl(path: string) {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setNotice({ type: "ok", text: "Endereço do catálogo copiado." });
    } catch {
      setNotice({ type: "error", text: "Não foi possível copiar. Abra o catálogo e copie o endereço do navegador." });
    }
  }

  async function reorderBannersByDrop(sourceId: string, targetId: string) {
    if (!dashboard || sourceId === targetId || busy === "reorderBanners") return;
    const ordered = [...dashboard.banners];
    const sourceIndex = ordered.findIndex((banner) => banner.id === sourceId);
    const targetIndex = ordered.findIndex((banner) => banner.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    setBusy("reorderBanners");
    try {
      const data = await post({ action: "reorderBanners", orderedIds: ordered.map((banner) => banner.id) });
      setDashboard(data.dashboard);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a ordem." });
    } finally {
      setBusy("");
      setDraggedBannerId(null);
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

  function editCoupon(coupon: Coupon) {
    setCouponDraft({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountType === "fixed" ? (coupon.discountValue / 100).toFixed(2) : String(coupon.discountValue || ""),
      freeShipping: coupon.freeShipping,
      appliesTo: coupon.appliesTo,
      productIds: coupon.productIds,
      minimumSubtotal: coupon.minimumSubtotalCents ? (coupon.minimumSubtotalCents / 100).toFixed(2) : "",
      maximumDiscount: coupon.maximumDiscountCents ? (coupon.maximumDiscountCents / 100).toFixed(2) : "",
      usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
      perCustomerLimit: coupon.perCustomerLimit ? String(coupon.perCustomerLimit) : "",
      startsAt: localDateTime(coupon.startsAt),
      expiresAt: localDateTime(coupon.expiresAt),
      active: coupon.active,
    });
    setCouponProductSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleCouponProduct(productId: string) {
    setCouponDraft((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
  }

  async function saveCoupon(event: FormEvent) {
    event.preventDefault();
    setBusy("saveCoupon");
    try {
      const coupon = {
        ...couponDraft,
        code: couponDraft.code.toUpperCase(),
        discountValue: couponDraft.discountType === "fixed" ? cents(couponDraft.discountValue) : Number(couponDraft.discountValue || 0),
        minimumSubtotalCents: cents(couponDraft.minimumSubtotal),
        maximumDiscountCents: couponDraft.maximumDiscount ? cents(couponDraft.maximumDiscount) : null,
        usageLimit: couponDraft.usageLimit ? Number(couponDraft.usageLimit) : null,
        perCustomerLimit: couponDraft.perCustomerLimit ? Number(couponDraft.perCustomerLimit) : null,
        startsAt: couponDraft.startsAt ? new Date(couponDraft.startsAt).toISOString() : "",
        expiresAt: couponDraft.expiresAt ? new Date(couponDraft.expiresAt).toISOString() : "",
      };
      const data = await post({ action: couponDraft.id ? "updateCoupon" : "createCoupon", coupon });
      setDashboard(data.dashboard);
      setCouponDraft(emptyCoupon);
      setCouponProductSearch("");
      setNotice({ type: "ok", text: couponDraft.id ? "Cupom atualizado." : "Cupom criado e pronto para uso." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar o cupom." });
    } finally {
      setBusy("");
    }
  }

  async function toggleCoupon(coupon: Coupon) {
    setBusy(`coupon-${coupon.id}`);
    try {
      const data = await post({ action: "setCouponActive", couponId: coupon.id, active: !coupon.active });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: coupon.active ? "Cupom pausado." : "Cupom ativado." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar o cupom." });
    } finally {
      setBusy("");
    }
  }

  async function removeCoupon(coupon: Coupon) {
    if (!window.confirm(`Excluir o cupom ${coupon.code}?`)) return;
    setBusy(`coupon-${coupon.id}`);
    try {
      const data = await post({ action: "deleteCoupon", couponId: coupon.id });
      setDashboard(data.dashboard);
      if (couponDraft.id === coupon.id) setCouponDraft(emptyCoupon);
      setNotice({ type: "ok", text: "Cupom excluído." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível excluir o cupom." });
    } finally {
      setBusy("");
    }
  }

  function editReview(review: Review) {
    setReviewDraft({
      id: review.id,
      customerName: review.customerName,
      location: review.location,
      rating: review.rating,
      body: review.body,
      productName: review.productName,
      active: review.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    setBusy("saveReview");
    try {
      const data = await post({ action: reviewDraft.id ? "updateReview" : "createReview", review: reviewDraft });
      setDashboard(data.dashboard);
      setReviewDraft(emptyReview);
      setNotice({ type: "ok", text: reviewDraft.id ? "Avaliação atualizada." : "Avaliação cadastrada na página inicial." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar a avaliação." });
    } finally {
      setBusy("");
    }
  }

  async function toggleReview(review: Review) {
    setBusy(`review-${review.id}`);
    try {
      const data = await post({ action: "setReviewActive", reviewId: review.id, active: !review.active });
      setDashboard(data.dashboard);
      setNotice({ type: "ok", text: review.active ? "Avaliação ocultada." : "Avaliação publicada." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível atualizar a avaliação." });
    } finally {
      setBusy("");
    }
  }

  async function moveReview(index: number, direction: -1 | 1) {
    if (!dashboard) return;
    const target = index + direction;
    if (target < 0 || target >= dashboard.reviews.length) return;
    const ordered = [...dashboard.reviews];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("reorderReviews");
    try {
      const data = await post({ action: "reorderReviews", orderedIds: ordered.map((review) => review.id) });
      setDashboard(data.dashboard);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível alterar a ordem." });
    } finally {
      setBusy("");
    }
  }

  async function removeReview(review: Review) {
    if (!window.confirm(`Excluir a avaliação de ${review.customerName}?`)) return;
    setBusy(`review-${review.id}`);
    try {
      const data = await post({ action: "deleteReview", reviewId: review.id });
      setDashboard(data.dashboard);
      if (reviewDraft.id === review.id) setReviewDraft(emptyReview);
      setNotice({ type: "ok", text: "Avaliação excluída." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível excluir a avaliação." });
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
    return dashboard?.products.filter((product) => `${product.name} ${product.category} ${product.material} ${product.catalogData.sku} ${product.catalogData.tags} ${product.variants.map((item) => item.sku).join(" ")}`.toLowerCase().includes(query)) ?? [];
  }, [dashboard, productSearch]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.toLowerCase();
    return dashboard?.orders.filter((order) => `${order.id} ${order.customerName} ${order.email} ${order.phone}`.toLowerCase().includes(query)) ?? [];
  }, [dashboard, orderSearch]);

  const couponProducts = useMemo(() => {
    const query = couponProductSearch.trim().toLocaleLowerCase("pt-BR");
    return dashboard?.products.filter((product) => !query || `${product.name} ${product.category} ${product.material}`.toLocaleLowerCase("pt-BR").includes(query)) ?? [];
  }, [dashboard, couponProductSearch]);

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
              <p className={styles.authLead}>Entre com seu e-mail e senha para acessar o painel.</p>
              <form className={styles.authForm} onSubmit={submitLogin}>
                <label>E-mail<input type="email" autoComplete="username" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label>
                <label>Senha<input type="password" autoComplete="current-password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
                <button className={styles.primaryButton} disabled={busy === "login"}>{busy === "login" ? "Verificando…" : "Continuar"}</button>
              </form>
              {passkeyLoginAvailable && passkeySupported && <div className={styles.faceIdLogin}><span>ou entre sem digitar a senha</span><button type="button" disabled={busy === "passkeyLogin"} onClick={loginWithPasskey}><i aria-hidden="true">⌁</i>{busy === "passkeyLogin" ? "Confirmando…" : "Entrar com Face ID"}</button></div>}
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
          <button className={section === "inicio" ? styles.activeNav : ""} onClick={() => setSection("inicio")} aria-current={section === "inicio" ? "page" : undefined}><span><AdminIcon name="inicio" /></span>Visão geral</button>
          <button className={section === "produtos" ? styles.activeNav : ""} onClick={() => setSection("produtos")} aria-current={section === "produtos" ? "page" : undefined}><span><AdminIcon name="produtos" /></span>Produtos</button>
          <button className={section === "categorias" ? styles.activeNav : ""} onClick={() => setSection("categorias")} aria-current={section === "categorias" ? "page" : undefined}><span><AdminIcon name="categorias" /></span>Categorias</button>
          <button className={section === "banners" ? styles.activeNav : ""} onClick={() => setSection("banners")} aria-current={section === "banners" ? "page" : undefined}><span><AdminIcon name="banners" /></span>Fotos da capa</button>
          <button className={section === "cupons" ? styles.activeNav : ""} onClick={() => setSection("cupons")} aria-current={section === "cupons" ? "page" : undefined}><span><AdminIcon name="cupons" /></span>Cupons</button>
          <button className={section === "avaliacoes" ? styles.activeNav : ""} onClick={() => setSection("avaliacoes")} aria-current={section === "avaliacoes" ? "page" : undefined}><span><AdminIcon name="avaliacoes" /></span>Avaliações</button>
          <button className={section === "pedidos" ? styles.activeNav : ""} onClick={() => setSection("pedidos")} aria-current={section === "pedidos" ? "page" : undefined}><span><AdminIcon name="pedidos" /></span>Pedidos</button>
          <button className={section === "lancamento" ? styles.activeNav : ""} onClick={() => setSection("lancamento")} aria-current={section === "lancamento" ? "page" : undefined}><span><AdminIcon name="lancamento" /></span>Black Friday</button>
          <button className={section === "configuracoes" ? styles.activeNav : ""} onClick={() => setSection("configuracoes")} aria-current={section === "configuracoes" ? "page" : undefined}><span><AdminIcon name="configuracoes" /></span>Configurações</button>
        </nav>
        <div className={styles.sidebarBottom}>
          <button onClick={previewStore} disabled={busy === "storePreview"}>{busy === "storePreview" ? "Abrindo…" : "Testar loja ↗"}</button>
          <button onClick={logout} disabled={busy === "logout"}>Sair</button>
        </div>
      </aside>

      <section className={styles.adminMain}>
        <header className={styles.adminHeader}>
          <button className={styles.mobileMenu} onClick={() => setSection(section === "inicio" ? "produtos" : "inicio")}>Menu</button>
          <div data-initial={(adminEmail.trim()[0] ?? "E").toUpperCase()}><span>Painel administrativo</span><strong>{adminEmail}</strong></div>
          <button className={styles.previewButton} onClick={previewStore} disabled={busy === "storePreview"}>{busy === "storePreview" ? "Abrindo…" : "Testar loja"}</button>
          <button className={styles.headerAdd} onClick={openNewProduct}>+ Cadastrar produto</button>
        </header>

        {section === "inicio" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Hoje na Elle Jew</p><h1>Visão geral</h1></div><button className={styles.primaryButton} onClick={openNewProduct}>+ Novo produto</button></div>
            <div className={styles.statGrid}>
              <article><i><AdminIcon name="estoque" /></i><span>Produtos publicados</span><strong>{dashboard.stats.activeProducts}</strong><button onClick={() => setSection("produtos")}>Gerenciar coleção →</button></article>
              <article><i><AdminIcon name="alerta" /></i><span>Estoque baixo</span><strong>{dashboard.stats.lowStock}</strong><small>Produtos com até 3 unidades</small></article>
              <article><i><AdminIcon name="relogio" /></i><span>Aguardando pagamento</span><strong>{dashboard.stats.pendingOrders}</strong><button onClick={() => setSection("pedidos")}>Ver pedidos →</button></article>
              <article className={styles.revenueCard}><i><AdminIcon name="vendas" /></i><span>Vendas confirmadas</span><strong>{money(dashboard.stats.paidRevenueCents)}</strong><small>Novidades divulgadas pelo grupo do WhatsApp</small></article>
            </div>
            <div className={styles.dashboardGrid}>
              <section className={styles.panelCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Atenção agora</p><h2>Estoque reduzido</h2></div><button onClick={() => setSection("produtos")}>Ver todos</button></div>
                <div className={styles.compactList}>
                  {dashboard.products.filter((product) => product.active && product.trackStock && product.stock <= 3).slice(0, 5).map((product) => (
                    <button key={product.id} onClick={() => editProduct(product)}><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.category}</small></span><b>{product.stock} un.</b></button>
                  ))}
                  {!dashboard.products.some((product) => product.active && product.trackStock && product.stock <= 3) && <p className={styles.empty}>Nenhum produto com estoque baixo.</p>}
                </div>
              </section>
              <section className={styles.panelCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Últimas compras</p><h2>Pedidos recentes</h2></div><button onClick={() => setSection("pedidos")}>Ver todos</button></div>
                <div className={styles.compactOrders}>
                  {dashboard.orders.slice(0, 5).map((order) => (
                    <button key={order.id} onClick={() => { setExpandedOrder(order.id); setSection("pedidos"); }}><span><strong>{order.customerName}</strong><small>{order.id} • {date(order.createdAt)}</small></span><b>{money(order.totalCents)}</b><em data-tone={orderStatusTone[order.status]}>{statusLabels[order.status] ?? order.status}</em></button>
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
            <p className={styles.orderHelp}>Use as setas para organizar a vitrine e manter produtos de um mesmo conjunto lado a lado.{productSearch && " Limpe a busca para alterar a ordem."}</p>
            <div className={styles.productTable}>
              <div className={styles.tableHeader}><span>Ordem</span><span>Produto</span><span>Preço</span><span>Estoque</span><span>Status</span><span>Ações</span></div>
              {filteredProducts.map((product, index) => (
                <article key={product.id}>
                  <div className={styles.productOrder}><span>{index + 1}</span><button aria-label={`Mover ${product.name} para cima`} disabled={Boolean(productSearch.trim()) || index === 0 || busy === "reorderProducts"} onClick={() => moveProduct(index, -1)}>↑</button><button aria-label={`Mover ${product.name} para baixo`} disabled={Boolean(productSearch.trim()) || index === filteredProducts.length - 1 || busy === "reorderProducts"} onClick={() => moveProduct(index, 1)}>↓</button></div>
                  <div className={styles.tableProduct}><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.category} • {product.material}</small></span></div>
                  <div>{product.discountPercent ? <><strong>{money(applyProductDiscount(product.priceCents, product.discountPercent))}</strong><small>de {money(product.priceCents)} • {product.discountPercent}% off</small></> : <><strong>{money(product.priceCents)}</strong>{product.compareAtCents && <small>de {money(product.compareAtCents)}</small>}</>}{product.pixDiscountEnabled && <small>{product.pixDiscountPercent}% de desconto no Pix</small>}</div>
                  <div><strong>{product.trackStock ? product.stock : "∞"}</strong><small>{!product.trackStock ? "Estoque infinito" : product.stock <= 3 ? "Estoque baixo" : "Em estoque"}</small></div>
                  <div><span className={`${styles.statusPill} ${product.visibility !== "visible" ? styles.inactivePill : ""}`}>{product.visibility === "visible" ? "Publicado" : product.visibility === "unlisted" ? "Só por link" : "Oculto"}</span></div>
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
                <p>As categorias organizam o cadastro e aparecem como cartões clicáveis na página inicial. Black Friday já está disponível: marque essa categoria nos produtos que quiser reunir na seleção.</p>
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
                  <section className={styles.categoryGroup}>
                    <article className={styles.rootCategoryRow}>
                      <div className={styles.categoryPinnedThumb}>{dashboard.allCategoryImage ? <img src={dashboard.allCategoryImage} alt="Prévia do cartão Todas as joias" /> : <span>+</span>}</div>
                      <span><strong>Todas as joias</strong><small>Cartão fixo • primeiro da vitrine</small></span>
                      <em className={styles.statusPill}>Sempre visível</em>
                      <div className={styles.categoryActions}><label className={styles.pinnedImageTrigger}>{busy === "uploadAllCategoryImage" ? "Enviando…" : "Trocar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === "uploadAllCategoryImage"} onChange={(event) => event.target.files?.[0] && uploadAllCategoryImage(event.target.files[0])} /></label></div>
                    </article>
                  </section>
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
                <p>Estas fotos aparecem na capa e passam automaticamente. Depois de adicionar, você pode ajustar o foco para celular sem cortar a joia.</p>
                <form onSubmit={saveBanner}>
                  {bannerDraft.image ? <div className={styles.bannerFocusEditor}>
                    <button type="button" className={styles.bannerFocusPreview} aria-label="Toque na joia para definir o foco da foto" onPointerDown={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const focalX = Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100); const focalY = Math.round(Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) * 100); setBannerDraft((current) => ({ ...current, focalX, focalY })); }}>
                      <img src={bannerDraft.image} style={{ objectPosition: `${bannerDraft.focalX}% ${bannerDraft.focalY}%` }} alt="Prévia do enquadramento no celular" />
                      <span className={styles.bannerFocusMarker} style={{ left: `${bannerDraft.focalX}%`, top: `${bannerDraft.focalY}%` }} aria-hidden="true" />
                    </button>
                    <p className={styles.bannerFocusHint}><strong>Toque no brinco</strong> para colocá-lo no foco da capa do celular.</p>
                    <div className={styles.bannerFocusSliders}>
                      <label>Esquerda ou direita<input type="range" min="0" max="100" value={bannerDraft.focalX} onChange={(event) => setBannerDraft((current) => ({ ...current, focalX: Number(event.target.value) }))} /></label>
                      <label>Cima ou baixo<input type="range" min="0" max="100" value={bannerDraft.focalY} onChange={(event) => setBannerDraft((current) => ({ ...current, focalY: Number(event.target.value) }))} /></label>
                    </div>
                    <div className={styles.bannerFocusActions}><label className={styles.bannerReplaceButton}>Trocar o arquivo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files?.length) void uploadBannerFiles(event.target.files); event.currentTarget.value = ""; }} /></label><button type="button" className={styles.textButton} onClick={() => setBannerDraft((current) => ({ ...current, focalX: 50, focalY: 24 }))}>Centralizar</button></div>
                  </div> : <label className={styles.bannerUpload}><span><b>+</b> {bannerDraft.id ? "Escolher foto" : "Escolher várias fotos"}</span><input type="file" multiple={!bannerDraft.id} accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files?.length) void uploadBannerFiles(event.target.files); event.currentTarget.value = ""; }} /></label>}
                  {!bannerDraft.id && <p className={styles.categoryHelp}>{bannerUploadProgress ? `Enviando ${bannerUploadProgress.current} de ${bannerUploadProgress.total}…` : "Selecione todas as fotos de uma vez. Cada arquivo será adicionado automaticamente ao carrossel."}</p>}
                  <div><button className={styles.primaryButton} disabled={busy === "saveBanner" || busy === "uploadBanner" || !bannerDraft.image}>{busy === "uploadBanner" ? bannerUploadProgress ? `Enviando ${bannerUploadProgress.current}/${bannerUploadProgress.total}…` : "Enviando foto…" : busy === "saveBanner" ? "Salvando…" : bannerDraft.id ? "Salvar enquadramento" : "+ Adicionar foto"}</button>{bannerDraft.id && <button type="button" className={styles.textButton} onClick={() => setBannerDraft(emptyBanner)}>Cancelar</button>}</div>
                </form>
              </section>
              <section className={styles.bannerListCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Ordem de exibição</p><h2>{dashboard.banners.length} {dashboard.banners.length === 1 ? "foto" : "fotos"}</h2></div></div>
                <p className={styles.categoryHelp}>Arraste uma foto e solte sobre outra para mudar a ordem. As setas continuam disponíveis como alternativa.</p>
                <div className={styles.bannerList}>{dashboard.banners.map((banner, index) => <article key={banner.id} draggable onDragStart={() => setDraggedBannerId(banner.id)} onDragEnd={() => setDraggedBannerId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedBannerId) void reorderBannersByDrop(draggedBannerId, banner.id); }} className={draggedBannerId === banner.id ? styles.draggingBanner : ""}><span className={styles.bannerDragHandle} title="Arraste para reordenar" aria-label="Arraste para reordenar">⠿</span><img src={banner.image} style={{ objectPosition: `${banner.focalX}% ${banner.focalY}%` }} alt="" /><span><strong>Foto {index + 1}</strong><small>{banner.active ? "Aparece no carrossel" : "Oculta da capa"}</small></span><em className={`${styles.statusPill} ${!banner.active ? styles.inactivePill : ""}`}>{banner.active ? "Visível" : "Oculta"}</em><div className={styles.bannerOrder}><button disabled={index === 0 || busy === "reorderBanners"} onClick={() => moveBanner(index, -1)}>↑</button><button disabled={index === dashboard.banners.length - 1 || busy === "reorderBanners"} onClick={() => moveBanner(index, 1)}>↓</button></div><div className={styles.categoryActions}><button onClick={() => setBannerDraft({ id: banner.id, title: banner.title || "Foto da capa", subtitle: "", image: banner.image, linkUrl: "", linkLabel: "", focalX: banner.focalX, focalY: banner.focalY })}>Ajustar foco</button><button disabled={busy === `banner-${banner.id}`} onClick={() => toggleBanner(banner)}>{banner.active ? "Ocultar" : "Mostrar"}</button><button disabled={busy === `banner-${banner.id}`} onClick={() => removeBanner(banner)}>Excluir</button></div></article>)}</div>
                {!dashboard.banners.length && <p className={styles.empty}>Adicione a primeira foto da capa.</p>}
              </section>
            </div>
          </div>
        )}

        {section === "cupons" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Promoções</p><h1>Cupons</h1></div><button className={styles.primaryButton} onClick={() => { setCouponDraft(emptyCoupon); setCouponProductSearch(""); }}>+ Novo cupom</button></div>
            <div className={styles.couponLayout}>
              <section className={styles.couponFormCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>{couponDraft.id ? "Editando cupom" : "Novo cupom"}</p><h2>{couponDraft.id ? couponDraft.code : "Crie uma promoção"}</h2></div></div>
                <form onSubmit={saveCoupon}>
                  <div className={styles.formGrid}>
                    <label>Código do cupom<input required minLength={3} maxLength={32} value={couponDraft.code} onChange={(event) => setCouponDraft({ ...couponDraft, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="EX.: PRIMEIRACOMPRA" /></label>
                    <label>Nome interno<input required maxLength={80} value={couponDraft.name} onChange={(event) => setCouponDraft({ ...couponDraft, name: event.target.value })} placeholder="Boas-vindas 10%" /></label>
                    <label className={styles.fullField}>Descrição opcional<input maxLength={220} value={couponDraft.description} onChange={(event) => setCouponDraft({ ...couponDraft, description: event.target.value })} placeholder="Para identificar a campanha no painel" /></label>
                  </div>

                  <div className={styles.couponBlock}>
                    <strong>O que este cupom oferece?</strong>
                    <div className={styles.formGrid}>
                      <label>Desconto nos produtos<select value={couponDraft.discountType} onChange={(event) => setCouponDraft({ ...couponDraft, discountType: event.target.value as CouponDraft["discountType"], discountValue: event.target.value === "none" ? "" : couponDraft.discountValue || "10" })}><option value="percentage">Porcentagem (%)</option><option value="fixed">Valor em reais (R$)</option><option value="none">Sem desconto nos produtos</option></select></label>
                      {couponDraft.discountType !== "none" && <label>{couponDraft.discountType === "percentage" ? "Porcentagem" : "Valor do desconto"}<input required type="number" min={couponDraft.discountType === "percentage" ? 1 : 0.01} max={couponDraft.discountType === "percentage" ? 100 : undefined} step={couponDraft.discountType === "percentage" ? 1 : 0.01} inputMode="decimal" value={couponDraft.discountValue} onChange={(event) => setCouponDraft({ ...couponDraft, discountValue: event.target.value })} /></label>}
                      <label htmlFor="coupon-free-shipping" className={`${styles.switchLabel} ${styles.fullField}`}><span className={styles.visuallyHidden}>Dar frete grátis também</span><input id="coupon-free-shipping" type="checkbox" checked={couponDraft.freeShipping} onChange={(event) => setCouponDraft({ ...couponDraft, freeShipping: event.target.checked })} /><span><strong>Dar frete grátis também</strong><small>Pode ser usado sozinho ou junto com o desconto nos produtos.</small></span></label>
                    </div>
                  </div>

                  <div className={styles.couponBlock}>
                    <strong>Quais produtos participam?</strong>
                    <div className={styles.couponScope}>
                      <label htmlFor="coupon-scope-all" className={couponDraft.appliesTo === "all" ? styles.selectedScope : ""}><span className={styles.visuallyHidden}>Todos os produtos</span><input id="coupon-scope-all" type="radio" name="couponScope" checked={couponDraft.appliesTo === "all"} onChange={() => setCouponDraft({ ...couponDraft, appliesTo: "all", productIds: [] })} /><span><b>Todos os produtos</b><small>Inclui os atuais e os que forem cadastrados depois.</small></span></label>
                      <label htmlFor="coupon-scope-selected" className={couponDraft.appliesTo === "selected" ? styles.selectedScope : ""}><span className={styles.visuallyHidden}>Escolher produtos</span><input id="coupon-scope-selected" type="radio" name="couponScope" checked={couponDraft.appliesTo === "selected"} onChange={() => setCouponDraft({ ...couponDraft, appliesTo: "selected" })} /><span><b>Escolher produtos</b><small>O desconto será aplicado somente nas peças marcadas.</small></span></label>
                    </div>
                    {couponDraft.appliesTo === "selected" && <div className={styles.couponProductPicker}>
                      <div><input type="search" value={couponProductSearch} onChange={(event) => setCouponProductSearch(event.target.value)} placeholder="Buscar produto…" /><span>{couponDraft.productIds.length} selecionado(s)</span></div>
                      <div>{couponProducts.map((product) => <label htmlFor={`coupon-product-${product.id}`} key={product.id}><span className={styles.visuallyHidden}>Selecionar {product.name}</span><input id={`coupon-product-${product.id}`} type="checkbox" checked={couponDraft.productIds.includes(product.id)} onChange={() => toggleCouponProduct(product.id)} /><img src={product.image} alt="" loading="lazy" /><span><strong>{product.name}</strong><small>{product.category} • {money(product.priceCents)}</small></span></label>)}{!couponProducts.length && <p className={styles.empty}>Nenhum produto encontrado.</p>}</div>
                    </div>}
                  </div>

                  <div className={styles.couponBlock}>
                    <strong>Limites e validade</strong>
                    <div className={styles.formGrid}>
                      <label>Compra mínima (R$)<input type="number" min="0" step="0.01" inputMode="decimal" value={couponDraft.minimumSubtotal} onChange={(event) => setCouponDraft({ ...couponDraft, minimumSubtotal: event.target.value })} placeholder="Sem mínimo" /></label>
                      {couponDraft.discountType === "percentage" && <label>Desconto máximo (R$)<input type="number" min="0" step="0.01" inputMode="decimal" value={couponDraft.maximumDiscount} onChange={(event) => setCouponDraft({ ...couponDraft, maximumDiscount: event.target.value })} placeholder="Sem limite" /></label>}
                      <label>Limite total de usos<input type="number" min="1" step="1" inputMode="numeric" value={couponDraft.usageLimit} onChange={(event) => setCouponDraft({ ...couponDraft, usageLimit: event.target.value })} placeholder="Ilimitado" /></label>
                      <label>Limite por cliente<input type="number" min="1" step="1" inputMode="numeric" value={couponDraft.perCustomerLimit} onChange={(event) => setCouponDraft({ ...couponDraft, perCustomerLimit: event.target.value })} placeholder="Ilimitado" /></label>
                      <label>Começa em<input type="datetime-local" value={couponDraft.startsAt} onChange={(event) => setCouponDraft({ ...couponDraft, startsAt: event.target.value })} /></label>
                      <label>Termina em<input type="datetime-local" value={couponDraft.expiresAt} onChange={(event) => setCouponDraft({ ...couponDraft, expiresAt: event.target.value })} /></label>
                      <label htmlFor="coupon-active" className={`${styles.switchLabel} ${styles.fullField}`}><span className={styles.visuallyHidden}>Cupom ativo</span><input id="coupon-active" type="checkbox" checked={couponDraft.active} onChange={(event) => setCouponDraft({ ...couponDraft, active: event.target.checked })} /><span><strong>Cupom ativo</strong><small>Desative para preparar a campanha sem liberar o código.</small></span></label>
                    </div>
                  </div>
                  <div className={styles.couponFormActions}><button className={styles.primaryButton} disabled={busy === "saveCoupon"}>{busy === "saveCoupon" ? "Salvando…" : couponDraft.id ? "Salvar alterações" : "Criar cupom"}</button>{couponDraft.id && <button type="button" className={styles.textButton} onClick={() => setCouponDraft(emptyCoupon)}>Cancelar</button>}</div>
                </form>
              </section>

              <section className={styles.couponListCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Códigos criados</p><h2>{dashboard.coupons.length} {dashboard.coupons.length === 1 ? "cupom" : "cupons"}</h2></div></div>
                <div className={styles.couponList}>{dashboard.coupons.map((coupon) => <article key={coupon.id} className={!coupon.active ? styles.inactiveCoupon : ""}>
                  <header><span><code>{coupon.code}</code><strong>{coupon.name}</strong></span><em className={`${styles.statusPill} ${!coupon.active ? styles.inactivePill : ""}`}>{coupon.active ? "Ativo" : "Pausado"}</em></header>
                  <p>{coupon.discountType === "percentage" ? `${coupon.discountValue}% de desconto` : coupon.discountType === "fixed" ? `${money(coupon.discountValue)} de desconto` : "Sem desconto nos produtos"}{coupon.freeShipping ? " + frete grátis" : ""}</p>
                  <div><span>{coupon.appliesTo === "all" ? "Todos os produtos" : `${coupon.productIds.length} produto(s)`}</span><span>{coupon.usageLimit ? `${coupon.usageCount}/${coupon.usageLimit} usos` : `${coupon.usageCount} uso(s)`}</span>{coupon.expiresAt && <span>Até {new Intl.DateTimeFormat("pt-BR").format(new Date(coupon.expiresAt))}</span>}</div>
                  <footer><button onClick={() => editCoupon(coupon)}>Editar</button><button disabled={busy === `coupon-${coupon.id}`} onClick={() => toggleCoupon(coupon)}>{coupon.active ? "Pausar" : "Ativar"}</button><button disabled={busy === `coupon-${coupon.id}`} onClick={() => removeCoupon(coupon)}>Excluir</button></footer>
                </article>)}{!dashboard.coupons.length && <p className={styles.empty}>Nenhum cupom criado ainda.</p>}</div>
              </section>
            </div>
          </div>
        )}

        {section === "avaliacoes" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Confiança na vitrine</p><h1>Avaliações</h1></div></div>
            <div className={styles.reviewAdminLayout}>
              <section className={styles.reviewFormCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>{reviewDraft.id ? "Editando avaliação" : "Nova avaliação"}</p><h2>{reviewDraft.id ? reviewDraft.customerName : "Conte uma experiência real"}</h2></div></div>
                <p className={styles.reviewHonestyNote}>Cadastre somente avaliações enviadas por clientes. As quatro primeiras avaliações ativas aparecem na página inicial.</p>
                <form onSubmit={saveReview}>
                  <div className={styles.formGrid}>
                    <label>Nome da cliente<input required minLength={2} maxLength={80} value={reviewDraft.customerName} onChange={(event) => setReviewDraft({ ...reviewDraft, customerName: event.target.value })} placeholder="Ex.: Mariana S." /></label>
                    <label>Cidade (opcional)<input maxLength={80} value={reviewDraft.location} onChange={(event) => setReviewDraft({ ...reviewDraft, location: event.target.value })} placeholder="Ex.: Ribeirão Preto, SP" /></label>
                    <label>Nota<select value={reviewDraft.rating} onChange={(event) => setReviewDraft({ ...reviewDraft, rating: Number(event.target.value) })}><option value={0}>Sem nota informada</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{"★".repeat(rating)} ({rating}/5)</option>)}</select></label>
                    <label>Produto (opcional)<input maxLength={120} value={reviewDraft.productName} onChange={(event) => setReviewDraft({ ...reviewDraft, productName: event.target.value })} placeholder="Ex.: Colar Ponto Luz" /></label>
                    <label className={styles.fullField}>Texto da avaliação<textarea required minLength={10} maxLength={500} value={reviewDraft.body} onChange={(event) => setReviewDraft({ ...reviewDraft, body: event.target.value })} placeholder="Escreva exatamente como a cliente avaliou a compra." /><small>{reviewDraft.body.length}/500 caracteres</small></label>
                    <label htmlFor="review-active" className={`${styles.switchLabel} ${styles.fullField}`}><span className={styles.visuallyHidden}>Publicar avaliação</span><input id="review-active" type="checkbox" checked={reviewDraft.active} onChange={(event) => setReviewDraft({ ...reviewDraft, active: event.target.checked })} /><span><strong>Publicar na página inicial</strong><small>Desative para preparar ou guardar a avaliação sem exibi-la.</small></span></label>
                  </div>
                  <div className={styles.reviewFormActions}><button className={styles.primaryButton} disabled={busy === "saveReview"}>{busy === "saveReview" ? "Salvando…" : reviewDraft.id ? "Salvar alterações" : "Cadastrar avaliação"}</button>{reviewDraft.id && <button type="button" className={styles.textButton} onClick={() => setReviewDraft(emptyReview)}>Cancelar</button>}</div>
                </form>
              </section>

              <section className={styles.reviewListCard}>
                <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Ordem de exibição</p><h2>{dashboard.reviews.length} {dashboard.reviews.length === 1 ? "avaliação" : "avaliações"}</h2></div></div>
                <p className={styles.categoryHelp}>Use as setas para escolher quais avaliações aparecem primeiro na vitrine.</p>
                <div className={styles.reviewAdminList}>{dashboard.reviews.map((review, index) => <article key={review.id} className={!review.active ? styles.inactiveReview : ""}>
                  <header><span><strong>{review.customerName}</strong><small>{[review.location, review.productName].filter(Boolean).join(" • ") || "Cliente Elle Jew"}</small></span><em className={`${styles.statusPill} ${!review.active ? styles.inactivePill : ""}`}>{review.active ? "Publicada" : "Oculta"}</em></header>
                  <div className={styles.reviewAdminStars}>{review.rating > 0 ? <span aria-label={`${review.rating} de 5 estrelas`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span> : "Sem nota informada"}</div>
                  <blockquote>“{review.body}”</blockquote>
                  <footer><div className={styles.reviewOrder}><button aria-label={`Mover avaliação de ${review.customerName} para cima`} disabled={index === 0 || busy === "reorderReviews"} onClick={() => moveReview(index, -1)}>↑</button><button aria-label={`Mover avaliação de ${review.customerName} para baixo`} disabled={index === dashboard.reviews.length - 1 || busy === "reorderReviews"} onClick={() => moveReview(index, 1)}>↓</button></div><div><button onClick={() => editReview(review)}>Editar</button><button disabled={busy === `review-${review.id}`} onClick={() => toggleReview(review)}>{review.active ? "Ocultar" : "Publicar"}</button><button disabled={busy === `review-${review.id}`} onClick={() => removeReview(review)}>Excluir</button></div></footer>
                </article>)}{!dashboard.reviews.length && <p className={styles.empty}>Nenhuma avaliação cadastrada ainda. Os cards de qualidade continuarão aparecendo na loja.</p>}</div>
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
                    <span><small>Data do pedido</small><strong>{date(order.createdAt)}</strong></span>
                    <span><small>Total</small><strong>{money(order.totalCents)}</strong></span>
                    <em data-tone={orderStatusTone[order.status]}>{orderStatusLabel(order)}</em><b>{expandedOrder === order.id ? "−" : "+"}</b>
                  </button>
                  {expandedOrder === order.id && (
                    <div className={styles.orderDetails}>
                      <div><h3>Itens e personalizações</h3>{order.items.map((item) => <p key={item.id}><span className={styles.orderItemDetails}><strong>{item.quantity}× {item.productName}</strong>{item.variantLabel && <small>Opções escolhidas: {item.variantLabel}</small>}{item.personalizationText && <small className={styles.orderPersonalization}>Nome para gravação: <strong>{item.personalizationText}</strong></small>}</span><strong>{money(item.unitPriceCents * item.quantity)}</strong></p>)}</div>
                      <div><h3>Entrega</h3><p>{order.address}, {order.addressNumber}{order.complement ? ` • ${order.complement}` : ""}</p>{order.neighborhood && <p>{order.neighborhood}</p>}<p>{order.cep} • {order.city}/{order.state}</p><p>{order.superfreteServiceName || "SuperFrete"}{order.superfreteDeliveryDays ? ` • ${order.superfreteDeliveryDays} ${order.superfreteDeliveryDays === 1 ? "dia útil" : "dias úteis"}` : ""}</p></div>
                      <div><h3>Cliente</h3><p>{order.email}</p><p>{order.phone}</p>{order.cpf && <p>CPF: {order.cpf}</p>}</div>
                      <div><h3>Situação do pedido</h3><select value={order.status} disabled={busy === `order-${order.id}`} onChange={(event) => changeOrderStatus(order.id, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Pedido recebido em: {date(order.createdAt)}</small><small>Pagamento: {paymentStatusLabel(order)}</small><small>Meio: {paymentLabel(order.paymentMethod)}</small>{order.pixDiscountCents > 0 && <small>Desconto Pix: {money(order.pixDiscountCents)}</small>}<small>Confirmação atualizada automaticamente pelo Asaas.</small>{order.couponCode && <small>Cupom: {order.couponCode} • desconto {money(order.couponDiscountCents + order.shippingDiscountCents)}</small>}</div>
                      <div><h3>Etiqueta SuperFrete</h3><p>{order.superfreteStatus ? `Situação: ${order.superfreteStatus}` : "Ainda não preparada"}</p>{order.superfreteTrackingCode && <p>Rastreio: <strong>{order.superfreteTrackingCode}</strong></p>}{order.superfretePriceCents !== null && <p>Custo da etiqueta: <strong>{money(order.superfretePriceCents)}</strong></p>}<div className={styles.rowActions}>{!order.superfreteOrderId && ["pago", "em_separacao", "enviado", "concluido"].includes(order.status) && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "createSuperFreteShipment")}>Preparar etiqueta</button>}{order.superfreteOrderId && order.superfreteStatus === "pending" && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "paySuperFreteShipment")}>Pagar etiqueta</button>}{order.superfreteOrderId && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "refreshSuperFreteShipment")}>Atualizar</button>}{order.superfreteOrderId && ["released", "posted", "delivered"].includes(order.superfreteStatus) && <button disabled={busy === `shipping-${order.id}`} onClick={() => runSuperFreteAction(order, "printSuperFreteShipment")}>Imprimir etiqueta</button>}</div><small>O botão “Pagar etiqueta” usa o saldo disponível na conta SuperFrete.</small></div>
                    </div>
                  )}
                </article>
              ))}
              {!filteredOrders.length && <p className={styles.empty}>Nenhum pedido encontrado.</p>}
            </div>
          </div>
        )}

        {section === "lancamento" && dashboard.launch && (() => {
          const launch = dashboard.launch;
          const selected = teaserDraft ?? launch.teaserProductIds;
          const changed = teaserDraft !== null && JSON.stringify(teaserDraft) !== JSON.stringify(launch.teaserProductIds);
          const activeProducts = dashboard.products.filter((product) => product.active);
          const launchDate = launch.launchAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(new Date(launch.launchAt)) : "data não definida";
          const toggleTeaser = (id: string) => {
            const current = teaserDraft ?? launch.teaserProductIds;
            if (current.includes(id)) setTeaserDraft(current.filter((item) => item !== id));
            else if (current.length >= 6) setNotice({ type: "error", text: "Escolha no máximo 6 joias para o spoiler." });
            else setTeaserDraft([...current, id]);
          };
          return (
            <div className={styles.pageContent}>
              <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Tela de lançamento</p><h1>Black Friday</h1></div><a className={styles.secondaryButton} href="/" target="_blank" rel="noreferrer">Ver a tela</a></div>
              <div className={styles.statGrid}>
                <article><span>Na lista de espera</span><strong>{launch.waitlist.active}</strong><small>E-mails que pediram para ser avisados</small></article>
                <article><span>Avisos enviados</span><strong>{launch.waitlist.notified}</strong><small>{launch.waitlist.failed ? `${launch.waitlist.failed} com falha (nova tentativa automática)` : "Envio automático na abertura"}</small></article>
                <article><span>Descadastrados</span><strong>{launch.waitlist.unsubscribed}</strong><small>Não recebem mais avisos</small></article>
                <article className={styles.revenueCard}><span>Abertura</span><strong style={{ fontSize: "1.1rem" }}>{launchDate}</strong><small>Horário de Brasília</small></article>
              </div>
              <section className={styles.settingsCard}>
                <h2>Aviso por e-mail</h2>
                <p>Na hora da abertura, todas as pessoas da lista recebem automaticamente um e-mail com o link da loja (envio a cada 5 minutos, em lotes de 100). Quem se inscreve também recebe uma confirmação na hora.</p>
                {!launch.emailConfigured && <div className={styles.configAlert}>O Resend ainda não está configurado na Cloudflare. Sem ele, nenhum e-mail sai.</div>}
                <button type="button" className={styles.primaryButton} disabled={busy === "launchTest" || !launch.emailConfigured} onClick={sendLaunchTest}>{busy === "launchTest" ? "Enviando…" : "Enviar e-mail de teste para mim"}</button>
              </section>
              <section className={styles.settingsCard}>
                <h2>Joias do spoiler</h2>
                <p>Escolha até 6 joias. Elas aparecem desfocadas, com um cadeado, na ordem em que você selecionar. Sem nenhuma escolhida, a tela usa 3 fotos padrão.</p>
                <p><strong>{selected.length}/6 selecionadas</strong></p>
                <div className={styles.teaserPicker} role="group" aria-label="Joias do spoiler">
                  {activeProducts.map((product) => {
                    const position = selected.indexOf(product.id);
                    return (
                      <label key={product.id} className={position >= 0 ? styles.teaserSelected : ""}>
                        <input type="checkbox" checked={position >= 0} onChange={() => toggleTeaser(product.id)} />
                        <img src={product.image} alt="" />
                        <span>{product.name}</span>
                        {position >= 0 && <b aria-label={`Posição ${position + 1}`}>{position + 1}</b>}
                      </label>
                    );
                  })}
                  {!activeProducts.length && <p className={styles.empty}>Publique produtos para escolher os spoilers.</p>}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <button type="button" className={styles.primaryButton} disabled={!changed || busy === "launchTeasers"} onClick={() => saveLaunchTeasers(selected)}>{busy === "launchTeasers" ? "Salvando…" : "Salvar spoilers"}</button>
                  {changed && <button type="button" className={styles.secondaryButton} onClick={() => setTeaserDraft(null)}>Descartar mudanças</button>}
                </div>
              </section>
            </div>
          );
        })()}

        {section === "configuracoes" && (
          <div className={styles.pageContent}>
            <div className={styles.pageTitle}><div><p className={styles.eyebrow}>Loja e conta</p><h1>Configurações</h1></div></div>
            <section className={styles.settingsCard}>
              <div className={styles.settingsTitleRow}><div><h2>Checkout Asaas</h2><p>Pix e cartão são processados no ambiente protegido do Asaas. As chaves ficam guardadas como segredos na Cloudflare e não aparecem no painel.</p></div><span className={styles.readyBadge}>Integração preparada</span></div>
              <small>Antes de publicar, configure a chave da API, o token do webhook e o ambiente correto na Cloudflare.</small>
            </section>
            <section className={styles.settingsCard}>
              <h2>Google Shopping e Instagram</h2><p>Os catálogos são atualizados automaticamente quando um produto é publicado, alterado ou fica sem estoque.</p>
              <div className={styles.catalogCards}>
                <article><span>Google Merchant Center</span><strong>Catálogo XML</strong><code>/api/catalog/google.xml</code><div><a href="/api/catalog/google.xml" target="_blank" rel="noreferrer">Abrir</a><button type="button" onClick={() => copyCatalogUrl("/api/catalog/google.xml")}>Copiar endereço</button></div></article>
                <article><span>Meta Commerce Manager</span><strong>Catálogo para Instagram</strong><code>/api/catalog/meta.csv</code><div><a href="/api/catalog/meta.csv" target="_blank" rel="noreferrer">Abrir</a><button type="button" onClick={() => copyCatalogUrl("/api/catalog/meta.csv")}>Copiar endereço</button></div></article>
              </div>
              <small>Cadastre esses endereços como fonte programada nas duas plataformas. Produtos ocultos ou com preço sob consulta não são enviados.</small>
            </section>
            <section className={styles.settingsCard}>
              <div className={styles.settingsTitleRow}><div><h2>App no iPhone</h2><p>Instale o painel na Tela de Início para abrir em tela cheia, como um aplicativo.</p></div><span className={appInstalled ? styles.readyBadge : styles.pendingBadge}>{appInstalled ? "Instalado" : "Disponível"}</span></div>
              <button type="button" className={styles.primaryButton} onClick={installAdminApp}>{appInstalled ? "App já instalado" : iosDevice ? "Como instalar no iPhone" : "Instalar aplicativo"}</button>
              <small>O app continua usando o mesmo painel e o mesmo banco. É necessário estar com internet para salvar produtos e enviar mídias.</small>
            </section>
            <section className={styles.settingsCard}>
              <div className={styles.settingsTitleRow}><div><h2>Face ID</h2><p>Depois de ativar neste aparelho, você poderá entrar no painel confirmando o rosto, sem digitar a senha.</p></div><span className={passkeys.length ? styles.readyBadge : styles.pendingBadge}>{passkeys.length ? "Ativo" : "Não ativado"}</span></div>
              <button type="button" className={styles.primaryButton} disabled={!passkeySupported || busy === "registerPasskey"} onClick={registerPasskey}>{busy === "registerPasskey" ? "Abrindo Face ID…" : "+ Ativar Face ID neste aparelho"}</button>
              {!passkeySupported && <small>Este navegador não oferece passkeys. No iPhone, abra o painel pelo Safari.</small>}
              <div className={styles.passkeyList}>{passkeys.map((passkey) => <article key={passkey.id}><span><strong>{passkey.label}</strong><small>Cadastrado em {date(passkey.createdAt)}{passkey.lastUsedAt ? ` • último acesso em ${date(passkey.lastUsedAt)}` : ""}</small></span><button type="button" disabled={busy === `removePasskey-${passkey.id}`} onClick={() => removePasskey(passkey)}>Remover</button></article>)}</div>
            </section>
            <section className={styles.settingsCard}>
              <h2>Alterar senha</h2><p>Depois da alteração, todas as sessões serão encerradas e você precisará entrar novamente.</p>
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
            <header><button type="button" onClick={closeProductWizard}>Fechar</button><img src="/brand/logo.webp" alt="Elle Jew" /><span>{draft.id ? "Editar produto" : "Novo produto"}</span></header>
            <div className={styles.wizardSteps}>{["Informações", "Mídias", "Preço e estoque", "Opções e envio", "Publicação"].map((label, index) => { const step = index + 1; return <div key={label} className={wizardStep >= step ? styles.currentStep : ""}><i>{wizardStep > step ? "✓" : step}</i><span>{label}</span></div>; })}</div>
            <div className={styles.wizardBody}>
              {wizardStep === 1 && <div className={styles.wizardForm}>
                <p className={styles.eyebrow}>Etapa 1 de 5</p><h1>Nome e descrição</h1><p>As informações principais da joia, do jeito que a cliente verá na loja.</p>
                <section className={styles.productSectionCard}><div className={styles.formGrid}>
                  <label className={styles.fullField}>Nome do produto<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Riviera Oval Moissanite" /></label>
                  <label className={styles.fullField}>Descrição<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Conte como é a peça, seus detalhes e por que ela é especial…" maxLength={3000} /><small>{draft.description.length}/3000 caracteres</small></label>
                  <label className={styles.fullField}>Material e acabamento<input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} placeholder="Prata 925 • Zircônias premium" /></label>
                  <label>Selo na vitrine (opcional)<input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} placeholder="Ex.: Novidade" maxLength={50} /></label>
                </div></section>
                <section className={`${styles.productSectionCard} ${styles.categoryPicker}`}><strong>Categorias do produto</strong><small>Marque quantas forem necessárias. Para incluir a joia na seleção Black Friday, marque “Black Friday”.</small>{dashboard.categories.filter((item) => !item.parentId).map((root) => { const children = dashboard.categories.filter((item) => item.parentId === root.id); const options = children.length ? children : [root]; return <fieldset key={root.id}><legend>{root.name}</legend>{options.map((item) => <label key={item.id}><input type="checkbox" checked={draft.categoryIds.includes(item.id)} onChange={() => toggleDraftCategory(item)} /><span>{item.name}{item.active ? "" : " (oculta)"}</span></label>)}</fieldset>; })}</section>
              </div>}
              {wizardStep === 2 && <div className={styles.wizardForm}>
                <p className={styles.eyebrow}>Etapa 2 de 5</p><h1>Fotos e vídeos</h1><p>Adicione até 10 mídias. A primeira foto será a capa da vitrine e os vídeos podem ter até 5 segundos.</p>
                <section className={styles.productSectionCard}><label className={styles.mediaPickerButton}><strong>+ Selecionar fotos ou vídeos</strong><small>Fotos JPG, PNG ou WebP até 8 MB • vídeos MP4, WebM ou MOV até 80 MB</small><input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov" onChange={(event) => { if (event.target.files) void uploadMediaFiles(event.target.files); event.currentTarget.value = ""; }} /></label><div className={styles.mediaPreviewGrid}>{draft.media.map((media, index) => <article key={`${media.url}-${index}`} className={styles.mediaPreviewItem}>{media.type === "video" ? <><video src={media.url} muted playsInline preload="metadata" /><i className={styles.mediaVideoBadge} aria-hidden="true">▶</i></> : <img src={media.url} alt={`Mídia ${index + 1}`} loading="lazy" />}<span>{media.type === "image" && draft.media.findIndex((item) => item.type === "image") === index ? "Capa" : media.type === "video" ? "Vídeo" : "Foto"}</span><div><button type="button" onClick={() => moveDraftMedia(index, -1)} disabled={index === 0}>←</button><button type="button" onClick={() => moveDraftMedia(index, 1)} disabled={index === draft.media.length - 1}>→</button><button type="button" onClick={() => removeDraftMedia(index)}>Remover</button></div></article>)}</div>{draft.media.length > 0 && !draft.media.some((item) => item.type === "image") && <p className={styles.mediaMissingPhoto}>Adicione também uma foto. Um vídeo sozinho não pode ser a capa da vitrine.</p>}</section>
              </div>}
              {wizardStep === 3 && <div className={styles.wizardForm}>
                <p className={styles.eyebrow}>Etapa 3 de 5</p><h1>Preço e estoque</h1><p>Defina o valor de venda e como o estoque deve ser controlado.</p>
                <section className={styles.productSectionCard}><h2>Preços</h2><div className={styles.formGrid}>
                  <label>Preço de venda (R$)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="298,00" /></label>
                  <label>Desconto no preço (%)<input type="number" min="0" max={MAX_PRODUCT_DISCOUNT_PERCENT} step="1" inputMode="numeric" value={draft.discountPercent || ""} onChange={(event) => setDraft({ ...draft, discountPercent: normalizeDiscountPercent(event.target.value) })} placeholder="0" /><small>{draft.discountPercent && cents(draft.price) > 0 ? <>Na loja: <s>{money(cents(draft.price))}</s> por <strong>{money(applyProductDiscount(cents(draft.price), draft.discountPercent))}</strong>. Vale também para variações e opções.</> : "Deixe vazio para vender pelo preço normal."}</small></label>
                  <label>Preço promocional anterior<input type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.discountPercent ? "" : draft.compareAt} disabled={Boolean(draft.discountPercent)} onChange={(event) => setDraft({ ...draft, compareAt: event.target.value })} placeholder={draft.discountPercent ? "Calculado pelo desconto" : "350,00"} /></label>
                  <label>Custo da peça (R$)<input type="number" min="0" step="0.01" inputMode="decimal" value={(draft.catalogData.costCents / 100).toString()} onChange={(event) => updateCatalog("costCents", cents(event.target.value))} /></label>
                  <div className={styles.calculatedField}><span>Margem estimada</span><strong>{(() => { const sale = applyProductDiscount(cents(draft.price), draft.discountPercent ?? 0); return sale > 0 ? `${Math.round(((sale - draft.catalogData.costCents) / sale) * 100)}%` : "0%"; })()}</strong><small>Uso interno, não aparece na loja.</small></div>
                  <label className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Ativar desconto no Pix" type="checkbox" checked={draft.pixDiscountEnabled} onChange={(event) => setDraft({ ...draft, pixDiscountEnabled: event.target.checked, pixDiscountPercent: event.target.checked && draft.pixDiscountPercent === 0 ? 5 : draft.pixDiscountPercent })} /><span><strong>Oferecer desconto no Pix</strong><small>O preço com desconto será aplicado somente se a cliente escolher Pix no checkout.</small></span></label>
                  {draft.pixDiscountEnabled && <label>Desconto no Pix (%)<input type="number" min="1" max="90" step="1" inputMode="numeric" value={draft.pixDiscountPercent || ""} onChange={(event) => setDraft({ ...draft, pixDiscountPercent: Math.max(0, Math.min(90, Math.trunc(Number(event.target.value) || 0))) })} /><small>Prévia no Pix: {money(Math.round(applyProductDiscount(cents(draft.price), draft.discountPercent ?? 0) * (100 - draft.pixDiscountPercent) / 100))}. O preço normal continua no cartão.</small></label>}
                  <label className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Exibir o preço na loja" type="checkbox" checked={draft.priceVisible} onChange={(event) => setDraft({ ...draft, priceVisible: event.target.checked })} /><span><strong>Exibir o preço na loja</strong><small>Se desligar, a cliente será direcionada ao WhatsApp.</small></span></label>
                </div></section>
                <section className={styles.productSectionCard}><h2>Estoque e códigos</h2><div className={styles.formGrid}>
                  <label className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Estoque infinito" type="checkbox" checked={!draft.trackStock} onChange={(event) => setDraft({ ...draft, trackStock: !event.target.checked })} /><span><strong>Estoque infinito</strong><small>Use quando não quiser controlar quantidade.</small></span></label>
                  {draft.trackStock && (!draft.variants.length || draft.multiOptionsEnabled) && <label>Quantidade disponível<input type="number" min="0" step="1" inputMode="numeric" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value })} /></label>}
                  <label>SKU<input value={draft.catalogData.sku} onChange={(event) => updateCatalog("sku", event.target.value)} placeholder="ELJ-ANEL-001" /></label>
                  <label>Código de barras<input inputMode="numeric" value={draft.catalogData.barcode} onChange={(event) => updateCatalog("barcode", event.target.value.replace(/\D/g, "").slice(0, 32))} placeholder="7890000000000" /></label>
                </div></section>
              </div>}
              {wizardStep === 4 && <div className={styles.wizardForm}>
                <p className={styles.eyebrow}>Etapa 4 de 5</p><h1>Opções e envio</h1><p>Cadastre tamanhos, cores ou materiais. Cada opção pode ter preço, SKU e estoque próprios.</p>
                <section className={styles.productSectionCard}><div className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Ativar múltiplas opções" type="checkbox" checked={draft.multiOptionsEnabled} onChange={(event) => setDraft({ ...draft, multiOptionsEnabled: event.target.checked })} /><span><strong>Ativar múltiplas opções</strong><small>Permita escolher uma alternativa em cada grupo, com acréscimo de preço opcional.</small></span></div>
                  {draft.multiOptionsEnabled ? <>
                    {draft.variants.length > 0 && <div className={styles.emptyVariants}><strong>Este produto ainda possui variações simples.</strong>{draft.variants.map((variant, index) => <span key={variant.id}>{[variant.size, variant.color, variant.material].filter(Boolean).join(" • ") || `Opção ${index + 1}`} <button type="button" onClick={() => removeVariant(index)}>Remover</button></span>)}</div>}
                    <div className={styles.sectionCardHeading}><div><h2>Grupos de opções</h2><p>Exemplo: modelo da joia e quantidade de letras.</p></div><button type="button" className={styles.secondaryButton} onClick={addOptionGroup}>+ Adicionar grupo</button></div>
                    {!draft.optionGroups.length && <div className={styles.emptyVariants}><strong>Nenhum grupo configurado.</strong><span>Adicione ao menos um grupo e suas alternativas.</span></div>}
                    {draft.optionGroups.map((group, groupIndex) => <article className={styles.variantCard} key={group.id}><header><strong>Grupo {groupIndex + 1}</strong><button type="button" onClick={() => removeOptionGroup(groupIndex)}>Remover grupo</button></header><label>Nome do grupo<input value={group.name} maxLength={60} onChange={(event) => updateOptionGroup(groupIndex, { name: event.target.value })} placeholder="Ex.: Quantidade de letras" /></label>
                      <div className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Definir automaticamente pelo nome" type="checkbox" checked={group.selectionMode === "personalizationLength"} onChange={(event) => updateOptionGroup(groupIndex, { selectionMode: event.target.checked ? "personalizationLength" : "manual" })} /><span><strong>Definir automaticamente pelo nome</strong><small>Use em faixas de letras: o cliente não escolhe essa opção; o preço é calculado pelo texto digitado.</small></span></div>
                      {group.options.map((option, optionIndex) => <div className={styles.formGrid} key={option.id}>
                        <label>Alternativa<input value={option.label} maxLength={100} onChange={(event) => updateOption(groupIndex, optionIndex, { label: event.target.value })} placeholder="Ex.: 2 a 6 letras" /></label>
                        <label>Acréscimo ao preço (R$)<input type="number" min="0" step="0.01" inputMode="decimal" value={(option.addedPriceCents / 100).toFixed(2)} onChange={(event) => updateOption(groupIndex, optionIndex, { addedPriceCents: cents(event.target.value) })} /><small>Somado ao preço-base do produto.</small></label>
                        <button type="button" className={styles.secondaryButton} onClick={() => removeOption(groupIndex, optionIndex)}>Remover alternativa</button>
                      </div>)}<button type="button" className={styles.secondaryButton} onClick={() => addOption(groupIndex)}>+ Adicionar alternativa</button>
                    </article>)}
                  </> : <>
                  <div className={styles.sectionCardHeading}><div><h2>Variações simples</h2><p>Exemplo: aro 16, prata, ródio.</p></div><button type="button" className={styles.secondaryButton} onClick={addVariant}>+ Adicionar opção</button></div>
                  {!draft.variants.length && <div className={styles.emptyVariants}><strong>Este produto não tem variações.</strong><span>Adicione apenas se a cliente precisar escolher uma opção.</span></div>}
                  <div className={styles.variantList}>{draft.variants.map((variant, index) => <article className={styles.variantCard} key={variant.id}><header><strong>Opção {index + 1}</strong><button type="button" onClick={() => removeVariant(index)}>Remover</button></header><div className={styles.formGrid}>
                    <label>Tamanho<input value={variant.size} onChange={(event) => updateVariant(index, { size: event.target.value })} placeholder="Ex.: Aro 16" /></label>
                    <label>Cor<input value={variant.color} onChange={(event) => updateVariant(index, { color: event.target.value })} placeholder="Ex.: Prata" /></label>
                    <label className={styles.fullField}>Material<input value={variant.material} onChange={(event) => updateVariant(index, { material: event.target.value })} placeholder="Ex.: Prata 925 com banho de ródio" /></label>
                    <label>SKU da opção<input value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} placeholder="ELJ-ANEL-16" /></label>
                    <label>Preço (R$)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={(variant.priceCents / 100).toString()} onChange={(event) => updateVariant(index, { priceCents: cents(event.target.value) })} /></label>
                    {draft.trackStock && <label>Estoque<input type="number" min="0" step="1" inputMode="numeric" value={variant.stock} onChange={(event) => updateVariant(index, { stock: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>}
                    <label className={styles.switchLabel}><input aria-label={`Opção ${index + 1} disponível`} type="checkbox" checked={variant.active} onChange={(event) => updateVariant(index, { active: event.target.checked })} /><span><strong>Opção disponível</strong><small>Desligue sem precisar apagar.</small></span></label>
                  </div></article>)}</div>
                  </>}
                </section>
                <section className={styles.productSectionCard}><h2>Personalização</h2><p className={styles.fieldHint}>Ative apenas nas peças em que é possível gravar nomes.</p><div className={styles.formGrid}>
                  <label className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Permitir gravação personalizada" type="checkbox" checked={draft.personalizationEnabled} onChange={(event) => setDraft({ ...draft, personalizationEnabled: event.target.checked })} /><span><strong>Permitir gravação de nome</strong><small>A cliente poderá informar o nome na página desta peça.</small></span></label>
                  {draft.personalizationEnabled && <label>Máximo de caracteres<input type="number" min="1" max="80" step="1" value={draft.personalizationMaxChars} onChange={(event) => setDraft({ ...draft, personalizationMaxChars: Math.max(1, Math.min(80, Math.trunc(Number(event.target.value) || 1))) })} /><small>De 1 a 80 caracteres; sugerido: 20.</small></label>}
                </div></section>
                <section className={styles.productSectionCard}><h2>Peso e dimensões da embalagem</h2><p className={styles.fieldHint}>Esses dados são usados no cálculo real do frete.</p><div className={styles.formGrid}>
                  <label>Peso (gramas)<input type="number" min="1" step="1" inputMode="numeric" value={draft.catalogData.weightGrams} onChange={(event) => updateCatalog("weightGrams", Number(event.target.value))} /></label>
                  <label>Comprimento (cm)<input type="number" min="1" step="1" inputMode="numeric" value={draft.catalogData.lengthCm} onChange={(event) => updateCatalog("lengthCm", Number(event.target.value))} /></label>
                  <label>Largura (cm)<input type="number" min="1" step="1" inputMode="numeric" value={draft.catalogData.widthCm} onChange={(event) => updateCatalog("widthCm", Number(event.target.value))} /></label>
                  <label>Altura (cm)<input type="number" min="1" step="1" inputMode="numeric" value={draft.catalogData.heightCm} onChange={(event) => updateCatalog("heightCm", Number(event.target.value))} /></label>
                  <label className={`${styles.switchLabel} ${styles.fullField}`}><input aria-label="Este produto tem frete grátis" type="checkbox" checked={draft.freeShipping} onChange={(event) => setDraft({ ...draft, freeShipping: event.target.checked })} /><span><strong>Este produto tem frete grátis</strong><small>Pedidos formados somente por itens assim não pagam frete.</small></span></label>
                </div></section>
              </div>}
              {wizardStep === 5 && <div className={styles.wizardForm}>
                <p className={styles.eyebrow}>Etapa 5 de 5</p><h1>Catálogo e publicação</h1><p>Prepare o produto para Google, Instagram e mecanismos de busca.</p>
                <section className={styles.productSectionCard}><h2>Google e Instagram</h2><div className={styles.formGrid}>
                  <label>Marca<input value={draft.catalogData.brand} onChange={(event) => updateCatalog("brand", event.target.value)} placeholder="Elle Jew" /></label>
                  <label>MPN (opcional)<input value={draft.catalogData.mpn} onChange={(event) => updateCatalog("mpn", event.target.value)} placeholder="Código do fabricante" /></label>
                  <label>Faixa etária<select value={draft.catalogData.ageGroup} onChange={(event) => updateCatalog("ageGroup", event.target.value)}><option value="adult">Adulto</option><option value="kids">Infantil</option></select></label>
                  <label>Gênero<select value={draft.catalogData.gender} onChange={(event) => updateCatalog("gender", event.target.value)}><option value="female">Feminino</option><option value="male">Masculino</option><option value="unisex">Unissex</option></select></label>
                  <label className={styles.fullField}>Tags de busca<input value={draft.catalogData.tags} onChange={(event) => updateCatalog("tags", event.target.value)} placeholder="riviera, prata 925, presente" /></label>
                </div></section>
                <section className={styles.productSectionCard}><h2>SEO e endereço do produto</h2><div className={styles.formGrid}>
                  <label className={styles.fullField}>Título para Google<input maxLength={70} value={draft.catalogData.seoTitle} onChange={(event) => updateCatalog("seoTitle", event.target.value)} placeholder={draft.name || "Nome do produto"} /><small>{draft.catalogData.seoTitle.length}/70 caracteres</small></label>
                  <label className={styles.fullField}>Descrição para Google<textarea maxLength={160} value={draft.catalogData.seoDescription} onChange={(event) => updateCatalog("seoDescription", event.target.value)} placeholder="Resumo atraente para os resultados de busca." /><small>{draft.catalogData.seoDescription.length}/160 caracteres</small></label>
                  <label className={styles.fullField}>URL do produto<div className={styles.urlField}><span>/produtos/</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") })} placeholder="gerada-pelo-nome" /></div></label>
                </div></section>
                <section className={styles.productSectionCard}><h2>Visibilidade</h2><div className={styles.visibilityOptions}>{[
                  { value: "visible", title: "Visível", text: "Aparece na loja, busca e catálogos." },
                  { value: "unlisted", title: "Não listado", text: "Só abre pelo link direto." },
                  { value: "hidden", title: "Oculto", text: "Fica salvo apenas no painel." },
                ].map((option) => <label key={option.value} className={draft.visibility === option.value ? styles.selectedVisibility : ""}><input aria-label={option.title} type="radio" name="visibility" value={option.value} checked={draft.visibility === option.value} onChange={() => setDraft({ ...draft, visibility: option.value, active: option.value !== "hidden" })} /><span><strong>{option.title}</strong><small>{option.text}</small></span></label>)}</div>
                  <label className={styles.switchLabel}><input aria-label="Destacar na página inicial" type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /><span><strong>Destacar na página inicial</strong><small>Mostra a joia na seleção de destaques.</small></span></label>
                </section>
                <div className={styles.productReview}>{draft.image && <img src={draft.image} alt="" />}<span><strong>{draft.name || "Nome da joia"}</strong><small>{draft.category} • {draft.material}</small></span><b>{draft.priceVisible && draft.price ? money(cents(draft.price)) : "Sob consulta"}</b></div>
              </div>}
            </div>
            <footer><button type="button" className={styles.secondaryButton} onClick={() => wizardStep === 1 ? closeProductWizard() : setWizardStep(wizardStep - 1)}>{wizardStep === 1 ? "Cancelar" : "← Voltar"}</button>{wizardStep < 5 ? <button type="button" className={styles.primaryButton} disabled={(wizardStep === 1 && (!draft.name.trim() || !draft.description.trim() || !draft.material.trim() || !draft.categoryIds.length)) || (wizardStep === 2 && (!draft.media.some((item) => item.type === "image") || busy === "media")) || (wizardStep === 3 && (!draft.price || (draft.trackStock && (!draft.variants.length || draft.multiOptionsEnabled) && draft.stock === "")))} onClick={() => setWizardStep(wizardStep + 1)}>{busy === "media" ? "Enviando mídia…" : "Continuar →"}</button> : <button type="button" className={styles.primaryButton} disabled={busy === "saveProduct" || !draft.price || (draft.trackStock && (!draft.variants.length || draft.multiOptionsEnabled) && draft.stock === "")} onClick={saveProduct}>{busy === "saveProduct" ? "Salvando…" : draft.id ? "Salvar alterações" : draft.visibility === "visible" ? "Cadastrar e publicar" : "Salvar produto"}</button>}</footer>
          </section>
        </div>
      )}

      {notice && <div className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : ""}`}>{notice.text}</div>}
    </main>
  );
}
