"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { installmentPlan } from "../lib/pricing";
import { marketingConsentGranted, trackMetaEvent } from "./marketing";

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
  catalogData?: { sku?: string; weightGrams?: number; lengthCm?: number; widthCm?: number; heightCm?: number; brand?: string };
  variants?: ProductVariant[];
  multiOptionsEnabled?: boolean;
  optionGroups?: ProductOptionGroup[];
  visibility?: string;
  trackStock?: boolean;
  priceVisible?: boolean;
  freeShipping?: boolean;
  pixDiscountEnabled?: boolean;
  pixDiscountPercent?: number;
  personalizationEnabled?: boolean;
  personalizationMaxChars?: number;
  badge: string | null;
  priceCents: number;
  compareAtCents: number | null;
  discountPercent?: number;
  listPriceCents?: number;
  stock: number;
  featured: boolean;
};

type ProductVariant = { id: string; size: string; color: string; material: string; sku: string; priceCents: number; listPriceCents?: number; stock: number; active: boolean };
type ProductOption = { id: string; label: string; addedPriceCents: number; listAddedPriceCents?: number; active: boolean };
type ProductOptionGroup = { id: string; name: string; options: ProductOption[]; selectionMode?: "manual" | "personalizationLength" };
type CartItem = Product & { quantity: number; variantId: string; variantLabel: string; personalizationText: string };
type Category = { id: string; name: string; slug: string; parentId: string | null; image: string | null };
type Banner = { id: string; title: string; subtitle: string; image: string; linkUrl: string | null; linkLabel: string | null; focalX: number; focalY: number };
type Review = { id: string; customerName: string; location: string; rating: number; body: string; productName: string };
type CustomerAccount = { userId: string; name: string; email: string; phone: string };
type StoreData = { products: Product[]; categories: Category[]; banners: Banner[]; reviews: Review[]; favoriteIds: string[]; cart: CartItem[]; allCategoryImage: string | null; account: CustomerAccount | null };
type Drawer = "cart" | "favorites" | null;
type Order = { id: string; totalCents: number; status: string; paymentMethod: string; checkoutUrl?: string };
type ShippingOption = { id: string; name: string; priceCents: number; deliveryDays: number };
type CouponPreview = { id: string; code: string; name: string; productDiscountCents: number; shippingDiscountCents: number; totalDiscountCents: number; shippingCents: number; subtotalCents: number; totalCents: number };

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

type Media = { type: "image" | "video"; url: string };

function galleryOf(product: Product): Media[] {
  const media = (product.media ?? []).filter((item) => item && item.url);
  if (media.length) return media;
  const fallback: Media[] = [];
  if (product.image) fallback.push({ type: "image", url: product.image });
  if (product.video) fallback.push({ type: "video", url: product.video });
  return fallback;
}

function isMoissaniteProduct(product: Product) {
  if (product.id === "prd_cb3e7b5a-8720-4640-af20-5ebac5c81f09") return false;
  return [product.name, product.material, product.description, ...(product.variants ?? []).map((variant) => variant.material)]
    .some((value) => /moissan/i.test(value ?? ""));
}

function personalizationRangeError(product: Product, optionIds: Record<string, string>, value: string) {
  const groups = product.multiOptionsEnabled ? product.optionGroups ?? [] : [];
  for (const group of groups) {
    if (!/letras?|caracteres?/i.test(group.name)) continue;
    const option = group.options.find((item) => item.id === optionIds[group.id] && item.active);
    const range = option?.label.match(/(\d+)\s*(?:-|–|—|a|até)\s*(\d+)/i);
    if (!range || !option) continue;
    const minimum = Number(range[1]);
    const maximum = Number(range[2]);
    const letterCount = value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    if (letterCount < minimum || letterCount > maximum) {
      return `A opção “${option.label}” aceita de ${minimum} a ${maximum} letras.`;
    }
  }
  return "";
}

function optionForPersonalizationLength(group: ProductOptionGroup, value: string) {
  const letterCount = value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (!letterCount) return null;
  return group.options.find((option) => {
    if (!option.active) return false;
    const range = option.label.match(/(\d+)\s*(?:-|–|—|a|até)\s*(\d+)/i);
    return Boolean(range && letterCount >= Number(range[1]) && letterCount <= Number(range[2]));
  }) ?? null;
}

function CountUp({ to, duration = 1800 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(to);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      setValue(0);
      frame = window.requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [to, duration]);
  return <span ref={ref} className="count-up">{value.toLocaleString("pt-BR")}</span>;
}

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const formatCep = (value: string) => onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const formatCpf = (value: string) => onlyDigits(value).slice(0, 11)
  .replace(/^(\d{3})(\d)/, "$1.$2")
  .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
  .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

export function Storefront({ initialProductSlug = "", initialStore, initialCategory = "Destaques", blackFridayLanding = false, blackFridayHome = false }: { initialProductSlug?: string; initialStore?: StoreData; initialCategory?: string; blackFridayLanding?: boolean; blackFridayHome?: boolean }) {
  const [store, setStore] = useState<StoreData>(() => initialStore ?? { products: [], categories: [], banners: [], reviews: [], favoriteIds: [], cart: [], allCategoryImage: null, account: null });
  const blackFridayCategory = store.categories.find((item) => item.slug === "black-friday");
  const blackFridayCategoryIds = new Set(blackFridayCategory
    ? [blackFridayCategory.id, ...store.categories.filter((item) => item.parentId === blackFridayCategory.id).map((item) => item.id)]
    : []);
  const blackFridayProducts = store.products.filter((product) => product.categoryIds.some((id) => blackFridayCategoryIds.has(id)));
  const blackFridayProduct = blackFridayProducts[0];
  const [loading, setLoading] = useState(!initialStore);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(() => initialProductSlug ? initialStore?.products.find((product) => product.slug === initialProductSlug) ?? null : null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string>>({});
  const [personalizationWanted, setPersonalizationWanted] = useState(false);
  const [personalizationText, setPersonalizationText] = useState("");
  const [personalizationDrafts, setPersonalizationDrafts] = useState<Record<string, string>>({});
  const [activeMedia, setActiveMedia] = useState<{ productId: string; index: number } | null>(null);
  const [category, setCategory] = useState(initialCategory);
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [checkout, setCheckout] = useState(initialCheckout);
  const [order, setOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState("");
  const [lastLookupCep, setLastLookupCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingStatus, setShippingStatus] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null);
  const [couponStatus, setCouponStatus] = useState("");
  const [bannerIndex, setBannerIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [blackFridayProductIndex, setBlackFridayProductIndex] = useState(0);
  const [previousBlackFridayProductIndex, setPreviousBlackFridayProductIndex] = useState<number | null>(null);
  const [blackFridayCarouselPaused, setBlackFridayCarouselPaused] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [productOrderDraft, setProductOrderDraft] = useState<string[] | null>(null);
  const mediaSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const blackFridayTransitionTimer = useRef<number | null>(null);

  function selectBlackFridayProduct(nextIndex: number) {
    if (blackFridayProducts.length < 2) return;
    const normalizedIndex = (nextIndex + blackFridayProducts.length) % blackFridayProducts.length;
    if (normalizedIndex === blackFridayProductIndex) return;
    setPreviousBlackFridayProductIndex(blackFridayProductIndex);
    setBlackFridayProductIndex(normalizedIndex);
    if (blackFridayTransitionTimer.current !== null) window.clearTimeout(blackFridayTransitionTimer.current);
    blackFridayTransitionTimer.current = window.setTimeout(() => {
      setPreviousBlackFridayProductIndex(null);
      blackFridayTransitionTimer.current = null;
    }, 900);
  }
  useEffect(() => {
    const requestedProduct = initialProductSlug || new URLSearchParams(window.location.search).get("produto") || "";
    const resumeCheckout = new URLSearchParams(window.location.search).get("checkout") === "1";
    const loadVisitorStateOnly = Boolean(initialStore && requestedProduct);
    const loadPublicCatalogOnly = !requestedProduct && !initialStore;
    const loadData = async () => {
      if (loadPublicCatalogOnly) {
        const [catalogResponse, stateResponse] = await Promise.all([
          fetch("/api/catalog", { cache: "default" }),
          fetch("/api/store?state=1", { cache: "no-store" }),
        ]);
        const [catalog, state] = await Promise.all([catalogResponse.json(), stateResponse.json()]);
        if (!catalogResponse.ok) throw new Error(catalog.error);
        if (!stateResponse.ok) throw new Error(state.error);
        return { ...catalog, ...state };
      }
      const storeUrl = loadVisitorStateOnly
        ? "/api/store?state=1"
        : requestedProduct ? `/api/store?product=${encodeURIComponent(requestedProduct)}` : "/api/store";
      const response = await fetch(storeUrl, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data;
    };
    loadData()
      .then((data) => {
        setStore((current) => loadVisitorStateOnly || loadPublicCatalogOnly ? { ...current, ...data } : data);
        if (data.account) {
          setCheckout((current) => ({
            ...current,
            customerName: current.customerName || data.account.name,
            email: data.account.email,
            phone: current.phone || data.account.phone,
          }));
        }
        const product = requestedProduct && Array.isArray(data.products) ? data.products.find((item: Product) => item.slug === requestedProduct) : null;
        if (product) {
          setSelectedProduct(product);
          const variants = (product.variants ?? []).filter((item: ProductVariant) => item.active);
          setSelectedVariantId(variants.length === 1 ? variants[0].id : "");
          setSelectedOptionIds({});
        }
        if (resumeCheckout && data.account && data.cart.length) {
          setCheckoutStep(1);
          setCheckoutOpen(true);
          window.history.replaceState({}, "", "/");
        }
      })
      .catch(() => setToast("A vitrine está visível, mas não foi possível sincronizar seus dados agora."))
      .finally(() => setLoading(false));
  }, [initialProductSlug, initialStore]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/storefront", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (active && response.ok && data.authenticated) setAdminEmail(String(data.admin?.email ?? ""));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (store.banners.length < 2 || carouselPaused) return;
    const timer = window.setInterval(() => setBannerIndex((current) => (current + 1) % store.banners.length), 5500);
    return () => window.clearInterval(timer);
  }, [store.banners.length, carouselPaused]);

  useEffect(() => {
    if (blackFridayProducts.length < 2 || blackFridayCarouselPaused) return;
    const timer = window.setInterval(() => selectBlackFridayProduct(blackFridayProductIndex + 1), 4000);
    return () => window.clearInterval(timer);
  }, [blackFridayProducts.length, blackFridayCarouselPaused, blackFridayProductIndex]);

  useEffect(() => {
    if (blackFridayProducts.length < 2) return;
    const nextProduct = blackFridayProducts[(blackFridayProductIndex + 1) % blackFridayProducts.length];
    const preload = new window.Image();
    preload.decoding = "async";
    preload.src = nextProduct.image;
  }, [blackFridayProducts.length, blackFridayProductIndex]);

  useEffect(() => () => {
    if (blackFridayTransitionTimer.current !== null) window.clearTimeout(blackFridayTransitionTimer.current);
  }, []);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (!payment) return;
    const messages: Record<string, string> = {
      success: "Pagamento enviado. Estamos confirmando a aprovação e atualizaremos o pedido automaticamente.",
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
      if (event.key === "Escape") {
        if (selectedProduct) closeProduct();
        else if (drawer) setDrawer(null);
        else if (checkoutOpen && checkoutStep < 3) setCheckoutOpen(false);
        return;
      }
      if (!selectedProduct || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const items = galleryOf(selectedProduct);
      if (items.length < 2) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setActiveMedia((current) => {
        const currentIndex = current?.productId === selectedProduct.id ? current.index : 0;
        return {
          productId: selectedProduct.id,
          index: (currentIndex + direction + items.length) % items.length,
        };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, selectedProduct, checkoutOpen, checkoutStep]);

  const cartCount = store.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = store.cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const availablePixDiscount = store.cart.reduce((sum, item) => item.pixDiscountEnabled ? sum + (item.priceCents - Math.round(item.priceCents * (100 - (item.pixDiscountPercent ?? 0)) / 100)) * item.quantity : sum, 0);
  const pixDiscount = checkout.paymentMethod === "pix" ? availablePixDiscount : 0;
  const checkoutSubtotal = subtotal - pixDiscount;
  const couponDiscount = appliedCoupon?.productDiscountCents ?? 0;
  const selectedShipping = shippingOptions.find((option) => option.id === checkout.shippingMethod);
  const freeShipping = store.cart.length > 0 && store.cart.every((item) => item.freeShipping);
  const baseShipping = subtotal >= 39900 || freeShipping ? 0 : selectedShipping?.priceCents ?? 0;
  const shippingDiscount = appliedCoupon?.shippingDiscountCents ?? 0;
  const shipping = Math.max(0, baseShipping - shippingDiscount);
  const total = checkoutSubtotal - couponDiscount + shipping;
  const favoriteProducts = store.products.filter((product) => store.favoriteIds.includes(product.id));
  const orderedProducts = productOrderDraft
    ? productOrderDraft.map((id) => store.products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product))
    : store.products;
  const gallery = selectedProduct ? galleryOf(selectedProduct) : [];
  const mediaIndex = activeMedia && selectedProduct && activeMedia.productId === selectedProduct.id
    ? Math.min(activeMedia.index, Math.max(gallery.length - 1, 0))
    : 0;
  const currentMedia = gallery[mediaIndex] ?? null;
  const selectedVariant = selectedProduct?.variants?.find((item) => item.id === selectedVariantId && item.active) ?? null;
  const selectedOptionGroups = selectedProduct?.multiOptionsEnabled ? selectedProduct.optionGroups ?? [] : [];
  const automaticOptionIds = Object.fromEntries(selectedOptionGroups
    .filter((group) => group.selectionMode === "personalizationLength")
    .map((group) => [group.id, optionForPersonalizationLength(group, personalizationText)?.id ?? ""]));
  const effectiveOptionIds = { ...selectedOptionIds, ...automaticOptionIds };
  const visibleOptionGroups = selectedOptionGroups.filter((group) => group.selectionMode !== "personalizationLength");
  const selectedOptionAdditional = selectedOptionGroups.reduce((sum, group) => sum + (group.options.find((option) => option.id === effectiveOptionIds[group.id] && option.active)?.addedPriceCents ?? 0), 0);
  const selectedOptionCount = selectedOptionGroups.filter((group) => group.options.some((option) => option.id === effectiveOptionIds[group.id] && option.active)).length;
  const automaticOptionMissing = selectedOptionGroups.some((group) => group.selectionMode === "personalizationLength" && !automaticOptionIds[group.id]);
  const automaticPriceSummary = selectedProduct ? selectedOptionGroups
    .filter((group) => group.selectionMode === "personalizationLength")
    .flatMap((group) => group.options.filter((option) => option.active).map((option) => `${option.label}: ${money(selectedProduct.priceCents + option.addedPriceCents)}`)) : [];
  const engravingRequired = Boolean(selectedProduct?.multiOptionsEnabled && selectedProduct.personalizationEnabled);
  const selectedOptionVariantId = JSON.stringify(Object.fromEntries(selectedOptionGroups.filter((group) => effectiveOptionIds[group.id]).map((group) => [group.id, effectiveOptionIds[group.id]])));
  const selectedProductPrice = selectedProduct?.multiOptionsEnabled ? (selectedProduct.priceCents ?? 0) + selectedOptionAdditional : selectedVariant?.priceCents || selectedProduct?.priceCents || 0;
  // Preço cheio (antes do desconto % do produto) da combinação escolhida, para mostrar riscado.
  const selectedOptionListAdditional = selectedOptionGroups.reduce((sum, group) => {
    const option = group.options.find((item) => item.id === effectiveOptionIds[group.id] && item.active);
    return sum + (option?.listAddedPriceCents ?? option?.addedPriceCents ?? 0);
  }, 0);
  const selectedProductListPrice = !selectedProduct?.discountPercent ? 0 : selectedProduct.multiOptionsEnabled
    ? (selectedProduct.listPriceCents ?? selectedProduct.priceCents) + selectedOptionListAdditional
    : selectedVariant?.listPriceCents || selectedProduct.listPriceCents || 0;
  const selectedProductCompareAt = selectedProduct?.discountPercent ? (selectedProductListPrice > selectedProductPrice ? selectedProductListPrice : null) : selectedProduct?.compareAtCents ?? null;
  const selectedProductPixPrice = selectedProduct && selectedProduct.pixDiscountEnabled ? Math.round(selectedProductPrice * (100 - (selectedProduct.pixDiscountPercent ?? 0)) / 100) : selectedProductPrice;
  const selectedProductInstallments = installmentPlan(selectedProductPrice);
  const selectedProductIsMoissanite = selectedProduct ? isMoissaniteProduct(selectedProduct) : false;
  const selectedProductStock = selectedProduct?.trackStock === false ? 999_999 : selectedVariant?.stock ?? selectedProduct?.stock ?? 0;
  const rootCategories = store.categories.filter((item) => !item.parentId && item.slug !== "black-friday");
  const showcaseCategories = rootCategories;
  const selectedRoot = rootCategories.find((item) => item.id === category || item.slug === category);
  const selectedSubcategory = store.categories.find((item) => (item.id === category || item.slug === category) && item.parentId);
  const activeRootId = selectedRoot?.id ?? selectedSubcategory?.parentId ?? null;
  const subcategories = activeRootId ? store.categories.filter((item) => item.parentId === activeRootId) : [];
  const categoryIds = category === "Todos" || category === "Destaques"
    ? null
    : selectedRoot
      ? new Set([selectedRoot.id, ...store.categories.filter((item) => item.parentId === selectedRoot.id).map((item) => item.id)])
      : new Set([category]);
  const filteredProducts = orderedProducts.filter((product) => {
    const categoryMatch = !categoryIds || product.categoryIds.some((id) => categoryIds.has(id));
    const productCategoryNames = store.categories.filter((item) => product.categoryIds.includes(item.id)).map((item) => item.name).join(" ");
    const searchMatch = `${product.name} ${product.category} ${productCategoryNames} ${product.material}`.toLowerCase().includes(search.toLowerCase());
    return categoryMatch && searchMatch;
  });
  const featuredProducts = orderedProducts.filter((product) => product.featured);
  const displayedProducts = loading ? [] : search.trim()
    ? filteredProducts
    : category === "Destaques"
      ? (featuredProducts.length ? featuredProducts : orderedProducts)
      : filteredProducts;
  const selectedCategoryName = category === "Destaques"
    ? "Destaques da Elle"
    : category === "Todos"
      ? "Todas as joias"
      : store.categories.find((item) => item.id === category || item.slug === category)?.name ?? "Joias";
  const categoryImage = (item: Category) => {
    if (item.image) return item.image;
    const childIds = new Set([item.id, ...store.categories.filter((child) => child.parentId === item.id).map((child) => child.id)]);
    return store.products.find((product) => product.categoryIds.some((id) => childIds.has(id)))?.image ?? "/brand/editorial-silver.webp";
  };
  function changeProductMedia(direction: -1 | 1) {
    if (!selectedProduct) return;
    const items = galleryOf(selectedProduct);
    if (items.length < 2) return;
    setActiveMedia((current) => {
      const currentIndex = current?.productId === selectedProduct.id ? current.index : 0;
      return {
        productId: selectedProduct.id,
        index: (currentIndex + direction + items.length) % items.length,
      };
    });
  }

  function beginMediaSwipe(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    mediaSwipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function finishMediaSwipe(event: React.TouchEvent<HTMLDivElement>) {
    const start = mediaSwipeStart.current;
    const touch = event.changedTouches[0];
    mediaSwipeStart.current = null;
    if (!start || !touch) return;
    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    if (Math.abs(horizontalDistance) < 48 || Math.abs(horizontalDistance) < Math.abs(verticalDistance) * 1.2) return;
    changeProductMedia(horizontalDistance < 0 ? 1 : -1);
  }

  function chooseCategory(categoryId: string) {
    if (productOrderDraft) {
      setToast("Salve ou cancele a organização da vitrine antes de trocar o filtro.");
      return;
    }
    setCategory(categoryId);
    setSearch("");
    window.setTimeout(() => document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function beginProductOrdering() {
    if (loading || !adminEmail) return;
    setCategory("Todos");
    setSearch("");
    setProductOrderDraft(store.products.map((product) => product.id));
    setToast("Arraste os produtos ou use as setas. Salve quando terminar.");
  }

  function reorderProductDraft(sourceId: string, targetId: string) {
    if (sourceId === targetId || busy === "storefront-order") return;
    setProductOrderDraft((current) => {
      if (!current) return current;
      const ordered = [...current];
      const sourceIndex = ordered.indexOf(sourceId);
      const targetIndex = ordered.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);
      return ordered;
    });
  }

  function moveProductDraft(index: number, direction: -1 | 1) {
    setProductOrderDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const ordered = [...current];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered;
    });
  }

  async function saveProductOrdering() {
    if (!productOrderDraft) return;
    setBusy("storefront-order");
    try {
      const response = await fetch("/api/admin/storefront", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorderProducts", orderedIds: productOrderDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a ordem.");
      const productsById = new Map(store.products.map((product) => [product.id, product]));
      const products = productOrderDraft.map((id) => productsById.get(id)).filter((product): product is Product => Boolean(product));
      setStore((current) => ({ ...current, products }));
      setProductOrderDraft(null);
      setToast("Nova ordem da vitrine publicada.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("sessão administrativa")) setAdminEmail("");
      setToast(error instanceof Error ? error.message : "Não foi possível salvar a ordem.");
    } finally {
      setBusy(null);
    }
  }

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setPersonalizationWanted(false);
    setPersonalizationText("");
    const variants = (product.variants ?? []).filter((item) => item.active);
    setSelectedVariantId(variants.length === 1 ? variants[0].id : "");
    setSelectedOptionIds({});
    window.history.replaceState({}, "", `/produtos/${encodeURIComponent(product.slug)}`);
    trackMetaEvent("ViewContent", { content_ids: [product.id], content_name: product.name, content_type: "product", currency: "BRL", value: product.priceCents / 100 });
  }

  function closeProduct() {
    setSelectedProduct(null);
    setSelectedVariantId("");
    setSelectedOptionIds({});
    setPersonalizationWanted(false);
    setPersonalizationText("");
    setActiveMedia(null);
    window.history.replaceState({}, "", "/");
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

  async function setCartQuantity(product: Product | CartItem, quantity: number, open = false, variantId?: string, personalization?: string, previousPersonalization?: string) {
    const chosenVariantId = variantId ?? ("variantId" in product ? product.variantId : "");
    const chosenPersonalization = (personalization ?? ("personalizationText" in product ? product.personalizationText : "")).trim();
    const previousQuantity = store.cart.find((item) => item.id === product.id && item.variantId === chosenVariantId && item.personalizationText === chosenPersonalization)?.quantity ?? 0;
    let unitPrice = product.variants?.find((variant) => variant.id === chosenVariantId)?.priceCents || product.priceCents;
    if (product.multiOptionsEnabled) {
      try {
        const choices = JSON.parse(chosenVariantId) as Record<string, string>;
        unitPrice = product.priceCents + (product.optionGroups ?? []).reduce((sum, group) => sum + (group.options.find((option) => option.id === choices[group.id])?.addedPriceCents ?? 0), 0);
      } catch { /* The server validates the authoritative selection and price. */ }
    }
    setBusy(`cart-${product.id}`);
    try {
      const data = await post({ action: "cart", productId: product.id, variantId: chosenVariantId, quantity, personalizationText: chosenPersonalization, ...(previousPersonalization !== undefined ? { previousPersonalizationText: previousPersonalization } : {}) });
      setStore(data.store);
      setShippingOptions([]);
      setShippingStatus("");
      setAppliedCoupon(null);
      setCouponStatus("");
      setCheckout((current) => ({ ...current, shippingMethod: "" }));
      if (quantity > 0) setToast(`${product.name} está na sua sacola.`);
      if (previousPersonalization === undefined && quantity > previousQuantity) trackMetaEvent("AddToCart", { content_ids: [product.id], content_name: product.name, content_type: "product", currency: "BRL", value: (unitPrice * (quantity - previousQuantity)) / 100 });
      if (open) {
        closeProduct();
        setDrawer("cart");
      }
    } catch (error) {
      if (previousPersonalization !== undefined) {
        const draftKey = `${product.id}:${chosenVariantId}:${previousPersonalization}`;
        setPersonalizationDrafts((current) => ({ ...current, [draftKey]: previousPersonalization }));
      }
      setToast(error instanceof Error ? error.message : "Não foi possível atualizar a sacola.");
    } finally {
      setBusy(null);
    }
  }

  function addToCart(product: Product, open = true, variantId = "", personalization = "") {
    const variants = (product.variants ?? []).filter((item) => item.active);
    const groups = product.multiOptionsEnabled ? product.optionGroups ?? [] : [];
    if ((groups.length && (product.id !== selectedProduct?.id || selectedOptionCount !== groups.length)) || (variants.length && !variantId) || (product.personalizationEnabled && product.id !== selectedProduct?.id)) {
      openProduct(product);
      return;
    }
    if (product.multiOptionsEnabled) variantId = selectedOptionVariantId;
    const personalizedName = product.personalizationEnabled ? personalization.trim() : "";
    if (personalizedName.length > (product.personalizationMaxChars ?? 20)) {
      setToast(`A gravação permite até ${product.personalizationMaxChars ?? 20} caracteres.`);
      return;
    }
    const personalizationError = personalizationRangeError(product, effectiveOptionIds, personalizedName);
    if (personalizationError) {
      setToast(personalizationError);
      return;
    }
    const current = store.cart.find((item) => item.id === product.id && item.variantId === variantId && item.personalizationText === personalizedName)?.quantity ?? 0;
    return setCartQuantity(product, current + 1, open, variantId, personalizedName);
  }

  function openCheckout() {
    if (!store.cart.length) {
      setToast("Escolha ao menos uma joia para continuar.");
      return;
    }
    setDrawer(null);
    setCheckoutStep(1);
    setOrder(null);
    setAppliedCoupon(null);
    setCouponStatus("");
    setCheckoutOpen(true);
    trackMetaEvent("InitiateCheckout", { content_ids: store.cart.map((item) => item.id), content_type: "product", currency: "BRL", value: total / 100, num_items: cartCount });
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (checkout.coupon.trim() && appliedCoupon?.code !== checkout.coupon.trim().toUpperCase()) {
      setCheckoutError("Clique em Aplicar para validar o cupom antes de continuar.");
      return;
    }
    if (!store.account) {
      window.location.assign("/conta/entrar?returnTo=%2F%3Fcheckout%3D1");
      return;
    }
    setCheckoutError(null);
    setBusy("checkout");
    try {
      const data = await post({ action: "checkout", ...checkout, marketingConsent: marketingConsentGranted() });
      setOrder(data.order);
      setStore(data.store);
      trackMetaEvent("AddPaymentInfo", { content_ids: store.cart.map((item) => item.id), content_type: "product", currency: "BRL", value: total / 100 });
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
    if (cep.length !== 8) {
      setShippingStatus("Informe um CEP válido para calcular o frete.");
      return;
    }
    setShippingLoading(true);
    setShippingStatus("Calculando as melhores opções…");
    setShippingOptions([]);
    setAppliedCoupon(null);
    setCouponStatus("");
    setCheckout((current) => ({ ...current, shippingMethod: "" }));
    try {
      const data = await post({ action: "shippingQuote", cep });
      const options = data.options as ShippingOption[];
      setShippingOptions(options);
      setCheckout((current) => ({ ...current, shippingMethod: options[0]?.id ?? "" }));
      setShippingStatus(options.length ? "Valores e prazos calculados pelo SuperFrete." : "Nenhuma modalidade disponível para este CEP.");
    } catch (error) {
      setShippingStatus(error instanceof Error ? error.message : "Não foi possível calcular o frete.");
    } finally {
      setShippingLoading(false);
    }
  }

  function updateShippingCep(value: string) {
    const cep = formatCep(value);
    setLastLookupCep("");
    setShippingOptions([]);
    setShippingStatus("");
    setAppliedCoupon(null);
    setCouponStatus("");
    setCheckout((current) => ({ ...current, cep, shippingMethod: "" }));
    return cep;
  }

  function calculateCartShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookupShipping(checkout.cep);
  }

  async function applyCheckoutCoupon() {
    if (!checkout.coupon.trim()) {
      setCouponStatus("Digite um cupom.");
      return;
    }
    setBusy("coupon");
    setCouponStatus("Validando cupom…");
    try {
      const data = await post({ action: "validateCoupon", coupon: checkout.coupon, cep: checkout.cep, shippingMethod: checkout.shippingMethod, paymentMethod: checkout.paymentMethod });
      setAppliedCoupon(data.coupon);
      setCheckout((current) => ({ ...current, coupon: data.coupon.code }));
      setCouponStatus(`${data.coupon.code} aplicado com sucesso.`);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponStatus(error instanceof Error ? error.message : "Cupom inválido.");
    } finally {
      setBusy(null);
    }
  }

  const updateCheckout = (field: keyof typeof checkout, value: string) => {
    if (field === "coupon" || field === "shippingMethod" || field === "cep" || field === "paymentMethod") {
      setAppliedCoupon(null);
      setCouponStatus("");
    }
    setCheckout((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    document.documentElement.classList.add("scroll-reveal-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [loading, category, search, store.products.length, store.categories.length]);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty("--scroll-progress", String(Math.min(1, window.scrollY / max)));
      root.classList.toggle("header-scrolled", window.scrollY > 48);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.classList.remove("header-scrolled");
    };
  }, []);

  function trackHeroPointer(event: React.MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
    event.currentTarget.style.setProperty("--my", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
  }

  const heroTitleWords = ["A", "elegância", "que", "eterniza", "momentos"];
  const announcements = ["Frete grátis acima de R$ 399", "Prata 925 legítima com garantia de 1 ano", "Até 10x no cartão", "Envio em até 3 dias úteis", "Troca fácil em até 7 dias"];

  return (
    <main>
      {!blackFridayLanding && <div className="announce-bar" role="region" aria-label="Avisos da loja">
        <div className="announce-track">
          {[0, 1].map((copy) => <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
            {announcements.map((item) => <li key={item}><i aria-hidden="true">✦</i>{item}</li>)}
          </ul>)}
        </div>
      </div>}
      <header className="site-header">
        <span className="scroll-progress" aria-hidden="true" />
        <a className="brand" href="#top" aria-label="Elle Jew — início">
          <img src="/brand/logo.webp" alt="Elle Jew" />
        </a>
        <nav aria-label="Navegação principal">
          <a href="#colecao">{blackFridayLanding ? "Black Friday" : "Coleção"}</a>
          {!blackFridayLanding && <><a href="#editorial">Editorial</a><a href="#sobre">Nossa essência</a></>}
        </nav>
        <div className="header-actions">
          <button className="header-icon-action search-action" onClick={() => { const input = document.querySelector<HTMLInputElement>("#busca-produtos"); input?.scrollIntoView({ behavior: "smooth", block: "center" }); window.setTimeout(() => input?.focus(), 450); }} aria-label="Buscar produtos">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.75" /><path d="m16 16 4.25 4.25" /></svg>
          </button>
          <a className="header-icon-action account-action" href={store.account ? "/conta" : "/conta/entrar"} aria-label={store.account ? `Minha conta, ${store.account.name}` : "Entrar ou criar uma conta"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.75" /><path d="M4.75 20c.55-4.05 3.1-6.25 7.25-6.25s6.7 2.2 7.25 6.25" /></svg>
          </a>
          <button className="icon-action" onClick={() => setDrawer("favorites")} aria-label={`Favoritos: ${store.favoriteIds.length} itens`}>
            <span aria-hidden="true">♡</span><em>{store.favoriteIds.length}</em>
          </button>
          <button className="bag-action" onClick={() => setDrawer("cart")} aria-label={`Sacola: ${cartCount} itens`}>
            Sacola <strong>{cartCount}</strong>
          </button>
        </div>
      </header>

      {blackFridayLanding || blackFridayHome ? <section className={`black-friday-hero ${blackFridayHome ? "black-friday-home-hero" : ""}`} id="top" aria-labelledby="black-friday-title">
        <div className="black-friday-copy">
          <p className="eyebrow dark">{blackFridayHome ? "Curadoria especial • Black Friday" : "Black Friday • Curadoria Elle Jew"}</p>
          <h1 id="black-friday-title"><span>Black</span><em>Friday</em></h1>
          <p className="black-friday-lead">{blackFridayHome ? "Joias selecionadas em prata 925, com condições especiais por tempo limitado." : "Uma seleção especial para encontrar sua próxima joia Elle Jew."}</p>
          <a className="button button-primary" href={blackFridayHome ? "/black-friday" : "#colecao"}>{blackFridayHome ? "CONHECER A SELEÇÃO" : "VER AS JOIAS"} <span aria-hidden="true">→</span></a>
          <small>Prata 925 <i>•</i> Joias selecionadas <i>•</i> Elle Jew</small>
        </div>
        <div className="black-friday-art" onMouseEnter={() => setBlackFridayCarouselPaused(true)} onMouseLeave={() => setBlackFridayCarouselPaused(false)} onFocus={() => setBlackFridayCarouselPaused(true)} onBlur={() => setBlackFridayCarouselPaused(false)}>
          <div className="black-friday-image-frame">
            {blackFridayProducts.length ? blackFridayProducts.map((product, index) => {
              const isCurrent = index === blackFridayProductIndex % blackFridayProducts.length;
              const isLeaving = index === previousBlackFridayProductIndex;
              const isMounted = isCurrent || isLeaving;
              return <img key={product.id} className={`black-friday-product-slide${isCurrent ? " active" : isLeaving ? " leaving" : ""}`} src={isMounted ? product.image : undefined} alt={isCurrent ? `${product.name} na seleção Black Friday` : ""} aria-hidden={!isCurrent} fetchPriority={isCurrent ? "high" : "auto"} loading={isMounted ? "eager" : "lazy"} decoding="async" />;
            }) : <img src={blackFridayCategory ? categoryImage(blackFridayCategory) : "/brand/editorial-ellej-rings.webp"} alt="Joia selecionada Elle Jew para a Black Friday" fetchPriority="high" />}
            <span className="black-friday-seal">BLACK<br />FRIDAY</span>
            <p>{blackFridayProduct?.name || "Uma joia para guardar"}</p>
            {blackFridayProducts.length > 1 && <div className="black-friday-carousel-controls" aria-label="Navegação das joias Black Friday">
              <button type="button" onClick={() => selectBlackFridayProduct(blackFridayProductIndex - 1)} aria-label="Joia anterior">‹</button>
              <span aria-live="polite">{String((blackFridayProductIndex % blackFridayProducts.length) + 1).padStart(2, "0")} / {String(blackFridayProducts.length).padStart(2, "0")}</span>
              <button type="button" onClick={() => selectBlackFridayProduct(blackFridayProductIndex + 1)} aria-label="Próxima joia">›</button>
            </div>}
          </div>
        </div>
      </section> : <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Prata 925 Legítima • Garantia de 1 ano</p>
          <h1 aria-label={heroTitleWords.join(" ")}>
            {heroTitleWords.map((word, index) => <span className="hero-word" key={word} aria-hidden="true" style={{ "--word-index": index } as React.CSSProperties}>{word === "eterniza" ? <em>{word}</em> : <span>{word}</span>}</span>)}
          </h1>
          <p className="hero-lead">Joias em prata 925 com design de Alta Joalheria</p>
          <div className="hero-ctas">
            <a className="button button-primary" href="#colecao">Ver Coleção Completa</a>
          <button className="button button-ghost" onClick={() => store.products[0] && openProduct(store.products[0])} disabled={loading}>Ver Mais Vendidos</button>
          </div>
          <div className="hero-proof">
            <div className="avatars" aria-hidden="true"><span>E</span><span>J</span><span>★</span></div>
            <p><strong>Mais de <CountUp to={1500} /> clientes satisfeitas</strong><br />em todo o Brasil</p>
          </div>
        </div>
        <div className={`hero-visual ${carouselPaused ? "is-paused" : ""}`} aria-roledescription="carrossel" aria-label="Fotos da coleção" onMouseMove={trackHeroPointer} onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={(event) => { setCarouselPaused(false); event.currentTarget.style.setProperty("--mx", "0"); event.currentTarget.style.setProperty("--my", "0"); }} onFocus={() => setCarouselPaused(true)} onBlur={() => setCarouselPaused(false)}>
          <div className="hero-sparkles" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
          {loading ? <div className="hero-slide-loading" aria-hidden="true" /> : (store.banners.length ? store.banners : [{ id: "fallback", image: "/brand/hero.webp", title: "", subtitle: "", linkUrl: null, linkLabel: null, focalX: 50, focalY: 24 }]).map((banner, index, photos) => <img key={banner.id} className={`hero-slide ${index === bannerIndex % photos.length ? "active" : ""}`} src={banner.image} style={{ objectPosition: `${banner.focalX}% ${banner.focalY}%` }} alt={index === bannerIndex % photos.length ? "Modelo usando joias Elle Jew" : ""} aria-hidden={index !== bannerIndex % photos.length} loading={index === bannerIndex % photos.length ? "eager" : "lazy"} fetchPriority={index === bannerIndex % photos.length ? "high" : "auto"} decoding="async" />)}
          {!loading && <div className="hero-card">
            <span>Destaques da Semana</span>
            <strong>Rivieras e Pontos de Luz</strong>
            <a href="#colecao">Ver destaques →</a>
          </div>}
          <div className="hero-seal"><span>925</span>prata de lei</div>
          {store.banners.length > 1 && <><button className="hero-gallery-arrow previous" onClick={() => setBannerIndex((bannerIndex - 1 + store.banners.length) % store.banners.length)} aria-label="Foto anterior">‹</button><button className="hero-gallery-arrow next" onClick={() => setBannerIndex((bannerIndex + 1) % store.banners.length)} aria-label="Próxima foto">›</button><div className="hero-gallery-dots" aria-label="Escolher foto">{store.banners.map((banner, index) => <button key={banner.id} className={index === bannerIndex % store.banners.length ? "active" : ""} onClick={() => setBannerIndex(index)} aria-label={`Mostrar foto ${index + 1}`} />)}</div></>}
        </div>
      </section>}

      {!blackFridayLanding && <section className="trust-strip" aria-label="Benefícios da loja">
        <div data-reveal="up"><svg className="trust-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l3 5-9 13L3 8l3-5Z" /><path d="M3 8h18M9 3l3 18 3-18" /></svg><strong>Prata 925 Legítima</strong><span>Garantia de 1 ano</span></div>
        <div data-reveal="up"><svg className="trust-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h12v10H2zM14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg><strong>Envio em até 3 dias úteis</strong><span>Após a confirmação do pagamento</span></div>
        <div data-reveal="up"><svg className="trust-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></svg><strong>Pagamento Facilitado</strong><span>Pix ou cartão em até 10x</span></div>
        <div data-reveal="up"><svg className="trust-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" /></svg><strong>Troca Fácil e Grátis</strong><span>Até 7 dias após receber</span></div>
      </section>}

      {!blackFridayLanding && <section className="category-showcase section" aria-labelledby="category-showcase-title">
        <div className="section-heading category-showcase-heading" data-reveal="heading">
          <div><h2 id="category-showcase-title">Compre por categoria.</h2></div>
        </div>
        <div className="category-card-grid">
          <Link className="category-card" data-reveal="card" href="/?categoria=todos#colecao" onClick={(event) => { event.preventDefault(); chooseCategory("Todos"); }}>
            <img src={store.allCategoryImage || store.products[0]?.image || "/brand/editorial-gold.webp"} alt="Seleção de joias Elle Jew" loading="lazy" decoding="async" />
            <span><small>Descubra toda a coleção</small><strong>Todas as joias</strong><em>Ver tudo</em></span>
          </Link>
          {loading && <p role="status">Carregando categorias…</p>}
          {showcaseCategories.map((item) => (
            <button className="category-card" data-reveal="card" key={item.id} onClick={() => chooseCategory(item.id)}>
              <img src={categoryImage(item)} alt={`Categoria ${item.name}`} loading="lazy" decoding="async" />
              <span><small>Curadoria Elle Jew</small><strong>{item.name}</strong><em>Ver {item.name.toLocaleLowerCase("pt-BR")}</em></span>
            </button>
          ))}
        </div>
      </section>}

      <section className={`collection section ${blackFridayLanding ? "black-friday-collection" : ""}`} id="colecao">
        <div className="section-heading" data-reveal="heading">
          <div>
            <p className="eyebrow dark">{blackFridayLanding ? "Seleção especial Elle Jew" : "Curadoria da vez"}</p>
            <h2>{selectedCategoryName}</h2>
          </div>
          <p className="section-intro">{blackFridayLanding ? "Peças selecionadas para celebrar a Black Friday com o brilho e a elegância Elle Jew." : "Moissanites selecionadas para revelar um brilho intenso, sofisticado e incomparável"}</p>
        </div>

        {adminEmail && <div className={`storefront-admin-bar ${productOrderDraft ? "editing" : ""}`}>
          <div>
            <strong>Modo administrativo</strong>
            <span>{productOrderDraft ? "Arraste os cards ou use as setas para definir a ordem." : `Sessão ativa: ${adminEmail}`}</span>
          </div>
          <div className="storefront-admin-actions">
            {productOrderDraft
              ? <>
                  <button type="button" onClick={() => { setProductOrderDraft(null); setToast("Organização cancelada."); }} disabled={busy === "storefront-order"}>Cancelar</button>
                  <button type="button" className="primary" onClick={() => void saveProductOrdering()} disabled={busy === "storefront-order"}>{busy === "storefront-order" ? "Salvando..." : "Salvar ordem"}</button>
                </>
              : <button type="button" className="primary" onClick={beginProductOrdering} disabled={loading}>Organizar vitrine</button>}
            <a href="/admin">Abrir painel</a>
          </div>
        </div>}

        <div className="shop-tools" data-reveal="up">
          {!blackFridayLanding && <div className="category-tabs" aria-label="Filtrar por categoria">
            <button className={category === "Destaques" ? "active" : ""} onClick={() => setCategory("Destaques")} disabled={Boolean(productOrderDraft)}>Destaques</button>
            <Link className={category === "Todos" ? "active" : ""} href="/?categoria=todos#colecao" onClick={(event) => { event.preventDefault(); chooseCategory("Todos"); }} aria-current={category === "Todos" ? "page" : undefined}>Todos</Link>
            {rootCategories.map((item) => (
              <button key={item.id} className={activeRootId === item.id ? "active" : ""} onClick={() => setCategory(item.id)} disabled={Boolean(productOrderDraft)}>{item.name}</button>
            ))}
          </div>}
          {!blackFridayLanding && subcategories.length > 0 && <div className="category-tabs subcategory-tabs" aria-label="Filtrar por subcategoria">
            <button className={selectedRoot ? "active" : ""} onClick={() => setCategory(activeRootId!)} disabled={Boolean(productOrderDraft)}>Ver tudo</button>
            {subcategories.map((item) => <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)} disabled={Boolean(productOrderDraft)}>{item.name}</button>)}
          </div>}
          <label className="search-box" htmlFor="busca-produtos">
            <span>⌕</span>
            <input id="busca-produtos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar joia ou material..." disabled={Boolean(productOrderDraft)} />
          </label>
        </div>

        {loading && <div className="loading-line" aria-label="Carregando produtos" />}
        <div className="product-grid">
          {displayedProducts.map((product, index) => {
            const favorite = store.favoriteIds.includes(product.id);
            const productInstallments = installmentPlan(product.priceCents);
            const productIsMoissanite = isMoissaniteProduct(product);
            return (
              <article
                className="product-card"
                data-admin-order={productOrderDraft ? "true" : undefined}
                data-reveal="product"
                key={product.id}
                onDragOver={(event) => {
                  if (!productOrderDraft) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (!productOrderDraft) return;
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  if (sourceId) reorderProductDraft(sourceId, product.id);
                }}
              >
                {productOrderDraft && <div className="product-order-controls">
                  <button
                    type="button"
                    className="product-drag-handle"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", product.id);
                      const card = event.currentTarget.closest<HTMLElement>(".product-card");
                      if (card) event.dataTransfer.setDragImage(card, Math.min(card.clientWidth / 2, 120), 20);
                    }}
                    aria-label={`Arrastar ${product.name}`}
                  >Arrastar</button>
                  <span>{index + 1}</span>
                  <button type="button" onClick={() => moveProductDraft(index, -1)} disabled={index === 0} aria-label={`Mover ${product.name} uma posição antes`}>←</button>
                  <button type="button" onClick={() => moveProductDraft(index, 1)} disabled={index === displayedProducts.length - 1} aria-label={`Mover ${product.name} uma posição depois`}>→</button>
                </div>}
                <div className="product-media">
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                  {productIsMoissanite && <span className="moissanite-mark product-moissanite-mark" role="img" aria-label="Moissanite"><i aria-hidden="true" /><b aria-hidden="true">Moissanite</b></span>}
                  <button className={`heart-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(product)} disabled={busy === `favorite-${product.id}`} aria-label={favorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}>{favorite ? "♥" : "♡"}</button>
                  <button className="product-image-button" onClick={() => openProduct(product)} aria-label={`Ver detalhes de ${product.name}`}>
                    <img src={product.image} alt={product.name} loading="lazy" decoding="async" />
                    {(() => {
                      const alternate = galleryOf(product).find((item) => item.type === "image" && item.url !== product.image);
                      return alternate ? <img className="product-alt-image" src={alternate.url} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null;
                    })()}
                    <span className="product-quick-view" aria-hidden="true">Ver joia</span>
                    {galleryOf(product).some((item) => item.type === "video") && <span className="product-video-flag" aria-hidden="true">▶ vídeo</span>}
                  </button>
                </div>
                <div className="product-info">
                  <div><span>{product.category}</span><button onClick={() => openProduct(product)}>Detalhes +</button></div>
                  <h3>{product.name}</h3>
                  <p className="product-price">
                    {product.priceVisible === false ? <strong>Preço sob consulta</strong> : <>{product.compareAtCents && <del>{money(product.compareAtCents)}</del>}{product.discountPercent ? <em className="discount-tag">-{product.discountPercent}%</em> : null}<strong>{product.multiOptionsEnabled && <span>A partir de </span>}<span>{productInstallments.count}x de</span> {money(productInstallments.installmentCents)}</strong></>}
                  </p>
            <p className="installment">{product.priceVisible === false ? "Fale com a Elle Jew pelo WhatsApp" : `${product.multiOptionsEnabled ? "A partir de " : "ou "}${money(product.priceCents)} à vista`}</p>
            {product.priceVisible !== false && product.pixDiscountEnabled && <p className="pix-discount-note">{money(Math.round(product.priceCents * (100 - (product.pixDiscountPercent ?? 0)) / 100))} no Pix • {product.pixDiscountPercent}% off</p>}
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !displayedProducts.length && <p className="empty-search">Nenhuma joia encontrada. Tente uma busca diferente.</p>}
      </section>

      {!blackFridayLanding && <>
      <div className="brand-marquee" aria-hidden="true">
        {[["Prata 925", "Moissanite", "Banho de Ródio", "Alta Joalheria", "Feito para durar"], ["Você é a ocasião", "Pontos de luz", "Rivieras", "Presente perfeito", "Elle Jew"]].map((row, rowIndex) => (
          <div className={`brand-marquee-row ${rowIndex ? "reverse" : ""}`} key={rowIndex}>
            {[0, 1].map((copy) => <span key={copy}>{row.map((word, index) => <b key={word} className={index % 2 ? "outline" : ""}>{word}<i>✦</i></b>)}</span>)}
          </div>
        ))}
      </div>

      <section className="editorial" id="editorial">
        <div className="editorial-image editorial-main" data-reveal="left"><img src="/brand/editorial-ellej-box.webp" alt="Modelo apresentando uma joia Elle Jew" loading="lazy" decoding="async" /></div>
        <div className="editorial-copy" data-reveal="up">
          <p className="eyebrow">Qualidade & Acabamento</p>
          <h2>O brilho do ouro branco com<br /><em>a durabilidade da Prata 925.</em></h2>
          <p>Trabalhamos com Joias em prata 925 com banho de Ródio e Pedras lapidadas cuidadosamente para um brilho intenso. Joias Eternas, com acabamento premium de alta joalheria.</p>
          <a className="button button-light" href="#colecao">Conhecer Lançamentos</a>
          <div className="editorial-quote">“O Luxo pode estar nos momentos mais comuns”</div>
        </div>
        <div className="editorial-image editorial-side" data-reveal="right"><img src="/brand/editorial-ellej-rings.webp" alt="Modelo usando anéis e brincos Elle Jew" loading="lazy" decoding="async" /></div>
      </section>

      <section className="social section" id="sobre">
        <div className="social-heading" data-reveal="heading">
          <div><p className="eyebrow dark">No Instagram</p><h2>Joias que transformam cada momento</h2></div>
          <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">@ellejew_ ↗</a>
        </div>
        <div className="social-grid">
          <a data-reveal="card" href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-riviera.webp" alt="Riviera Elle Jew em close" loading="lazy" decoding="async" /><span>Colares Riviera cravejados</span></a>
          <a data-reveal="card" href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-rings.webp" alt="Anéis e colares Elle Jew em uso" loading="lazy" decoding="async" /><span>Mix de colares e anéis</span></a>
          <a data-reveal="card" href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-bastidores.webp" alt="Embalagens Elle Jew sendo preparadas" loading="lazy" decoding="async" /><span>Embaladas com carinho</span></a>
          <a data-reveal="card" href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer"><img src="/brand/instagram-look.webp" alt="Colar Riviera Elle Jew" loading="lazy" decoding="async" /><span>Brilho radiante em cada detalhe</span></a>
        </div>
      </section>

      <section className="reviews section">
        <div className="reviews-heading" data-reveal="heading"><p className="eyebrow dark">{store.reviews.length ? "Experiências reais" : "Por que escolher a Elle Jew?"}</p><h2>{store.reviews.length ? <>Feedbacks de quem<br />escolheu Elle Jew</> : <>Qualidade garantida e<br />carinho em cada detalhe.</>}</h2></div>
        <div className="review-cards">
          {store.reviews.length ? store.reviews.map((review) => <article data-reveal="card" key={review.id}><p className="stars">DEPOIMENTO DE CLIENTE</p><blockquote>“{review.body}”</blockquote><footer><strong>{review.customerName}</strong><span>{[review.location, review.productName].filter(Boolean).join(" • ") || "Experiência Elle Jew"}</span></footer></article>) : <>
            <article data-reveal="card"><p className="stars">★★★★★</p><blockquote>Peças confeccionadas em prata de lei 925 legítima, revestidas para manter a cor e o brilho intenso por muito mais tempo.</blockquote><footer><strong>PRATA 925 LEGÍTIMA</strong><span>Garantia e durabilidade</span></footer></article>
            <article data-reveal="card"><p className="stars">★★★★★</p><blockquote>Zircônias cristal de alta lapidação com o mesmo brilho e precisão dos diamantes, perfeitas para qualquer ocasião.</blockquote><footer><strong>LAPIDAÇÃO PREMIUM</strong><span>Cravejamento impecável</span></footer></article>
            <article data-reveal="card"><p className="stars">★★★★★</p><blockquote>Cada pedido é embalado à mão em caixa personalizada com saquinho aveludado protetor e um aroma exclusivo da marca.</blockquote><footer><strong>EMBALAGEM ESPECIAL</strong><span>Pronta para presentear</span></footer></article>
          </>}
        </div>
      </section>

      <section className="whatsapp-club-section">
        <div data-reveal="left"><p className="eyebrow">GRUPO ELLE JEW</p><h2>Novidades que chegam primeiro no seu WhatsApp.</h2><p>Entre no nosso grupo para acompanhar lançamentos, reposições e conteúdos exclusivos da marca.</p></div>
        <div className="whatsapp-club-card" data-reveal="right">
          <div className="whatsapp-club-heading">
            <span className="whatsapp-club-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.6a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4A8 8 0 1 1 20 11.6Z" /><path d="M8.4 8.1c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3 0 .5-.2.7l-.6.7c.8 1.5 1.9 2.5 3.4 3.2l.6-.7c.2-.2.4-.3.7-.2l1.7.8c.3.1.4.3.4.6v.5c0 .3-.1.6-.4.8-.5.4-1.2.6-1.8.6-2.9-.2-6.9-3.7-7-6.7 0-.7.2-1.4.8-1.9Z" /></svg></span>
            <div><strong>Grupo de novidades Elle Jew</strong><small>Lançamentos, reposições e curadoria em primeira mão.</small></div>
          </div>
          <a href="https://chat.whatsapp.com/DbBWIoQJrEsLQuFe2jqGzJ?s=cl&amp;p=i&amp;mlu=4" target="_blank" rel="noreferrer">Entrar no grupo do WhatsApp <span>↗</span></a>
        </div>
      </section>
      </>}

      <footer className="footer">
        <div className="footer-brand"><img src="/brand/logo.webp" alt="Elle Jew" /><p>Eternizando elegância por meio de joias.</p></div>
        <div><h3>Comprar</h3><a href="#colecao">Colares</a><a href="#colecao">Conjuntos</a><a href="#colecao">Brincos</a><a href="#colecao">Lançamentos</a></div>
        <div><h3>Atendimento</h3><a href="https://wa.me/5516992939739" target="_blank" rel="noreferrer">WhatsApp</a><a href="mailto:contato@ellejew.com.br">E-mail</a><a href="/trocas-e-devolucoes">Trocas e devoluções</a><a href="/entrega">Política de entrega</a><a href="mailto:contato@ellejew.com.br?subject=Cuidados%20com%20minha%20joia">Cuidados com sua joia</a></div>
        <div><h3>Elle Jew</h3><a href="/conta">Minha conta</a><a href="#sobre">Nossa essência</a><a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noreferrer">Instagram</a><a href="/privacidade">Privacidade</a><a href="/termos">Termos</a><button className="privacy-settings" type="button" onClick={() => window.dispatchEvent(new Event("ellejew:privacy"))}>Preferências de privacidade</button></div>
        <p className="footer-wordmark" aria-hidden="true">Elle Jew</p>
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
                <div className="drawer-progress"><div><span style={{ width: `${freeShipping ? 100 : Math.min(100, (subtotal / 39900) * 100)}%` }} /></div><p>{subtotal >= 39900 || freeShipping ? "Você desbloqueou frete grátis." : `Faltam ${money(39900 - subtotal)} para o frete grátis.`}</p></div>
                <div className="drawer-list">
                  {store.cart.map((item) => (
                    <article className="drawer-item" key={`${item.id}-${item.variantId}-${item.personalizationText}`}><img src={item.image} alt={item.name} /><div><span>{item.category}</span><h3>{item.name}</h3>{item.variantLabel && <small className="cart-variant">{item.variantLabel}</small>}{item.personalizationText && <small className="cart-variant">Gravação: {item.personalizationText}</small>}<strong>{money(item.priceCents)}</strong><div className="quantity"><button onClick={() => setCartQuantity(item, item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => setCartQuantity(item, item.quantity + 1)} disabled={item.quantity >= item.stock} aria-label={`Aumentar quantidade de ${item.name}`}>+</button></div></div><button className="remove" onClick={() => setCartQuantity(item, 0)} aria-label={`Remover ${item.name}`}>×</button></article>
                  ))}
                  {store.cart.length > 0 && (
                    <form className="cart-shipping-calculator" onSubmit={calculateCartShipping}>
                      <div className="cart-shipping-heading"><div><strong>Calcule o frete</strong><small>Consulte valores e prazos para sua região.</small></div><span>SuperFrete</span></div>
                      <div className="cart-shipping-fields"><label htmlFor="cart-shipping-cep">CEP<input id="cart-shipping-cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={checkout.cep} onChange={(event) => updateShippingCep(event.target.value)} /></label><button type="submit" disabled={shippingLoading || onlyDigits(checkout.cep).length !== 8}>{shippingLoading ? "Calculando…" : "Calcular"}</button></div>
                      {shippingOptions.length > 0 && <div className="cart-shipping-results" aria-label="Opções de entrega">{shippingOptions.map((option) => <label key={option.id} className={`cart-shipping-option ${checkout.shippingMethod === option.id ? "selected" : ""}`}><input type="radio" name="cart-shipping" value={option.id} checked={checkout.shippingMethod === option.id} onChange={(event) => updateCheckout("shippingMethod", event.target.value)} /><span><strong>{option.name}</strong><small>Até {option.deliveryDays} {option.deliveryDays === 1 ? "dia útil" : "dias úteis"}</small></span><b>{subtotal >= 39900 || freeShipping ? "Grátis" : money(option.priceCents)}</b></label>)}</div>}
                      {shippingStatus && <p className="cart-shipping-status" role="status" aria-live="polite">{shippingStatus}</p>}
                    </form>
                  )}
                  {!store.cart.length && <div className="empty-drawer"><span>◇</span><h3>Sua sacola está esperando.</h3><p>Comece pelas peças que estão no radar de todo mundo.</p><button onClick={() => setDrawer(null)}>Ver mais desejados</button></div>}
                </div>
                {store.cart.length > 0 && <div className="drawer-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>{selectedShipping ? `${selectedShipping.name}: ${baseShipping ? money(baseShipping) : "grátis"}. Confirme o endereço no checkout.` : "Calcule o frete pelo CEP antes de continuar."}</small><button className="button button-primary full" onClick={openCheckout}>Ir para o checkout seguro</button><p>Compra protegida • Troca em 7 dias</p></div>}
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
        <div className="overlay product-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProduct(); }}>
          <section className="product-modal" key={selectedProduct.id} role="dialog" aria-modal="true" aria-label={`Detalhes de ${selectedProduct.name}`}>
            <button className="modal-close" onClick={closeProduct} aria-label="Fechar">×</button>
            <div
              className="modal-image"
              onTouchStart={beginMediaSwipe}
              onTouchEnd={finishMediaSwipe}
              onTouchCancel={() => { mediaSwipeStart.current = null; }}
            >
              {currentMedia?.type === "video"
                ? <video key={currentMedia.url} src={currentMedia.url} controls autoPlay muted loop playsInline preload="metadata" />
                : <img key={currentMedia?.url ?? selectedProduct.image} src={currentMedia?.url ?? selectedProduct.image} alt={selectedProduct.name} draggable={false} />}
              {selectedProduct.badge && <span className="modal-product-badge">{selectedProduct.badge}</span>}
              {selectedProductIsMoissanite && <span className="moissanite-mark modal-moissanite-mark" role="img" aria-label="Moissanite"><i aria-hidden="true" /><b aria-hidden="true">Moissanite</b></span>}
              {gallery.length > 1 && (
                <>
                  <button type="button" className="modal-media-arrow previous" onClick={() => changeProductMedia(-1)} aria-label="Ver mídia anterior">‹</button>
                  <button type="button" className="modal-media-arrow next" onClick={() => changeProductMedia(1)} aria-label="Ver próxima mídia">›</button>
                  <output className="modal-media-count" aria-live="polite">{mediaIndex + 1} / {gallery.length}</output>
                  <div className="modal-thumbs">
                    {gallery.map((item, index) => (
                      <button
                        key={item.url + index}
                        type="button"
                        className={index === mediaIndex ? "active" : ""}
                        onClick={() => setActiveMedia({ productId: selectedProduct.id, index })}
                        aria-label={(item.type === "video" ? "Ver vídeo " : "Ver foto ") + (index + 1) + " de " + selectedProduct.name}
                      >
                        {item.type === "video"
                          ? <><video src={item.url} muted playsInline preload="metadata" /><i aria-hidden="true">▶</i></>
                          : <img src={item.url} alt="" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-copy">
              <p className="eyebrow dark">{selectedProduct.category} • Elle Jew</p>
              <h2 className={selectedProduct.multiOptionsEnabled ? "configurable-product-title" : undefined}>{selectedProduct.name}</h2>
              <p className="modal-description">{selectedProduct.description}</p>
              <p className="modal-material">◇ {selectedProduct.material}</p>
              {selectedProduct.priceVisible === false ? <div className="modal-price"><strong>Preço sob consulta</strong><span>Nossa equipe responde rapidamente pelo WhatsApp.</span></div> : <div className="modal-price">{selectedProductCompareAt && <del>{money(selectedProductCompareAt)}</del>}{selectedProduct.discountPercent ? <em className="discount-tag">-{selectedProduct.discountPercent}% off</em> : null}<strong><small>{selectedProductInstallments.count}x de</small> {money(selectedProductInstallments.installmentCents)}</strong><span>ou {money(selectedProductPrice)} à vista • cartão</span>{selectedProduct.pixDiscountEnabled && <span className="pix-discount-note">{money(selectedProductPixPrice)} no Pix • desconto de {selectedProduct.pixDiscountPercent}%</span>}</div>}
              {selectedProduct.multiOptionsEnabled ? visibleOptionGroups.map((group) => <fieldset className="variant-picker multi-option-picker" key={group.id}><legend>{group.name}</legend>{group.options.filter((option) => option.active).map((option) => <label key={option.id} className={selectedOptionIds[group.id] === option.id ? "selected" : ""}><input type="radio" name={`product-option-${group.id}`} value={option.id} checked={selectedOptionIds[group.id] === option.id} onChange={() => setSelectedOptionIds((current) => ({ ...current, [group.id]: option.id }))} /><span><strong>{option.label}</strong>{option.addedPriceCents > 0 && <small>+ {money(option.addedPriceCents)}</small>}</span></label>)}</fieldset>) : (selectedProduct.variants ?? []).some((item) => item.active) && <fieldset className="variant-picker"><legend>Escolha sua opção</legend>{(selectedProduct.variants ?? []).filter((item) => item.active).map((variant) => { const label = [variant.size, variant.color, variant.material].filter(Boolean).join(" • ") || "Opção"; return <label key={variant.id} className={selectedVariantId === variant.id ? "selected" : ""}><input aria-label={label} type="radio" name="product-variant" value={variant.id} checked={selectedVariantId === variant.id} disabled={selectedProduct.trackStock !== false && variant.stock < 1} onChange={() => setSelectedVariantId(variant.id)} /><span><strong>{label}</strong><small>{selectedProduct.trackStock !== false && variant.stock < 1 ? "Esgotado" : variant.priceCents ? money(variant.priceCents) : money(selectedProduct.priceCents)}</small></span></label>; })}</fieldset>}
              {selectedProduct.personalizationEnabled && (engravingRequired
                ? <fieldset className="personalization-picker required-personalization"><legend>Nome <span aria-hidden="true">*</span></legend><label className="personalization-name"><textarea required rows={2} value={personalizationText} maxLength={selectedProduct.personalizationMaxChars ?? 20} autoComplete="off" placeholder="Digite aqui" onChange={(event) => setPersonalizationText(event.target.value)} /><small>{personalizationText.length}/{selectedProduct.personalizationMaxChars ?? 20} caracteres. Confira a grafia antes de adicionar.</small>{automaticPriceSummary.length > 0 && <small className="personalization-price-guide">Faixas de preço: {automaticPriceSummary.join(" • ")}. O valor é calculado pelo nome digitado.</small>}</label></fieldset>
                : <fieldset className="personalization-picker"><legend>Personalização da peça</legend><label><input type="checkbox" checked={personalizationWanted} onChange={(event) => { setPersonalizationWanted(event.target.checked); if (!event.target.checked) setPersonalizationText(""); }} /><span>Quero gravar um nome nesta peça</span></label>{personalizationWanted && <label className="personalization-name">Nome para gravação<input type="text" value={personalizationText} maxLength={selectedProduct.personalizationMaxChars ?? 20} autoComplete="off" placeholder="Digite exatamente como deseja gravar" onChange={(event) => setPersonalizationText(event.target.value)} /><small>{personalizationText.length}/{selectedProduct.personalizationMaxChars ?? 20} caracteres. Confira a grafia antes de adicionar.</small></label>}</fieldset>)}
              {selectedProduct.priceVisible === false
                ? <a className="button button-primary full" href={`https://wa.me/5516992939739?text=${encodeURIComponent(`Oi, quero saber o preço de ${selectedProduct.name}.`)}`} target="_blank" rel="noreferrer">Consultar pelo WhatsApp</a>
                : <button className="button button-primary full" onClick={() => { if ((engravingRequired || personalizationWanted) && !personalizationText.trim()) { setToast(engravingRequired ? "Informe o nome para personalizar a peça." : "Digite o nome que deseja gravar ou desmarque a personalização."); return; } void addToCart(selectedProduct, true, selectedVariantId, (engravingRequired || personalizationWanted) ? personalizationText : ""); }} disabled={busy === `cart-${selectedProduct.id}` || selectedProductStock < 1 || (selectedProduct.multiOptionsEnabled ? selectedOptionCount !== selectedOptionGroups.length : (selectedProduct.variants ?? []).some((item) => item.active) && !selectedVariantId) || (engravingRequired && !personalizationText.trim())}>{busy === `cart-${selectedProduct.id}` ? "Adicionando…" : automaticOptionMissing ? "Digite de 2 a 10 letras" : selectedProduct.multiOptionsEnabled && selectedOptionCount !== selectedOptionGroups.length ? "Escolha o banho" : engravingRequired && !personalizationText.trim() ? "Informe o nome" : (selectedProduct.variants ?? []).some((item) => item.active) && !selectedVariantId ? "Escolha uma opção" : selectedProductStock < 1 ? "Produto esgotado" : "Adicionar à sacola"}</button>}
              <button className="modal-favorite" onClick={() => toggleFavorite(selectedProduct)}>{store.favoriteIds.includes(selectedProduct.id) ? "♥ Salvo nos favoritos" : "♡ Salvar nos favoritos"}</button>
              <div className="modal-benefits"><span>Envio em até 3 dias úteis</span><span>Troca fácil</span><span>Compra segura</span></div>
            </div>
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
                    <p className="eyebrow dark">Entrega</p>
                    <div className="form-section"><h2>Contato</h2><div className="field-grid"><label className="span-2">Nome completo<input required autoComplete="name" value={checkout.customerName} onChange={(event) => updateCheckout("customerName", event.target.value)} /></label><label>E-mail da conta<input type="email" required autoComplete="email" value={checkout.email} readOnly /></label><label>WhatsApp<input required autoComplete="tel" placeholder="(16) 99999-9999" value={checkout.phone} onChange={(event) => updateCheckout("phone", event.target.value)} /></label><label>CPF do comprador<input required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" pattern="\d{3}\.\d{3}\.\d{3}-\d{2}" value={checkout.cpf} onChange={(event) => updateCheckout("cpf", formatCpf(event.target.value))} /></label></div></div>
                    <div className="form-section"><h2>Endereço de entrega</h2><div className="field-grid"><label>CEP<input required inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" pattern="\d{5}-\d{3}" value={checkout.cep} onBlur={() => lookupCheckoutCep()} onChange={(event) => { const value = updateShippingCep(event.target.value); if (onlyDigits(value).length === 8) void lookupCheckoutCep(value); }} />{cepStatus && <small>{cepStatus}</small>}</label><label className="span-2">Rua ou avenida<input required autoComplete="address-line1" value={checkout.address} onChange={(event) => updateCheckout("address", event.target.value)} /></label><label>Número<input required autoComplete="address-line2" value={checkout.addressNumber} onChange={(event) => updateCheckout("addressNumber", event.target.value)} /></label><label>Bairro<input required value={checkout.neighborhood} onChange={(event) => updateCheckout("neighborhood", event.target.value)} /></label><label>Complemento<input value={checkout.complement} onChange={(event) => updateCheckout("complement", event.target.value)} /></label><label>Cidade<input required autoComplete="address-level2" value={checkout.city} onChange={(event) => updateCheckout("city", event.target.value)} /></label><label>UF<input required maxLength={2} autoComplete="address-level1" value={checkout.state} onChange={(event) => updateCheckout("state", event.target.value.toUpperCase())} /></label></div></div>
                    <div className="form-section"><h2>Forma de entrega</h2>{shippingOptions.map((option) => <label key={option.id} className={`shipping-option ${checkout.shippingMethod === option.id ? "selected" : ""}`}><input type="radio" name="shipping" value={option.id} checked={checkout.shippingMethod === option.id} onChange={(event) => updateCheckout("shippingMethod", event.target.value)} /><span><strong>{option.name}</strong><small>{option.deliveryDays} {option.deliveryDays === 1 ? "dia útil" : "dias úteis"} • rastreamento incluso</small></span><b>{subtotal >= 39900 || freeShipping ? "Grátis" : money(option.priceCents)}</b></label>)}{shippingStatus && <p className="shipping-status">{shippingStatus}</p>}{!shippingOptions.length && !shippingStatus && <p className="shipping-status">Informe o CEP para calcular o frete.</p>}</div>
                    <button className="button button-primary checkout-next" type="submit" disabled={!checkout.shippingMethod}>Continuar para pagamento</button>
                  </form>
                ) : (
                  <form id="payment-form" onSubmit={submitOrder}>
                    <p className="eyebrow dark">Pagamento</p><h1>Último passo. Seu pedido está pronto.</h1>
                    <div className="form-section"><h2>Forma de pagamento</h2><label className={`shipping-option ${checkout.paymentMethod === "pix" ? "selected" : ""}`}><input type="radio" name="payment-method" value="pix" aria-label="Pix" checked={checkout.paymentMethod === "pix"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span><strong>Pix</strong><small>{availablePixDiscount > 0 ? `Você economiza ${money(availablePixDiscount)} neste pedido.` : "Pagamento protegido pelo Asaas."}</small></span></label><label className={`shipping-option ${checkout.paymentMethod === "credit_card" ? "selected" : ""}`}><input type="radio" name="payment-method" value="credit_card" aria-label="Cartão de crédito" checked={checkout.paymentMethod === "credit_card"} onChange={(event) => updateCheckout("paymentMethod", event.target.value)} /><span><strong>Cartão de crédito</strong><small>Parcelamento disponível no Asaas. O desconto Pix não se aplica.</small></span></label></div>
                    <div className="pix-box"><strong>Pagamento seguro pelo Asaas</strong><p>{checkout.paymentMethod === "pix" ? "O checkout será aberto já configurado para Pix." : "O checkout será aberto já configurado para cartão de crédito."} A Elle Jew não recebe nem armazena os dados do seu cartão.</p><span>Confirmação automática do pagamento</span></div>
                    <div className="coupon"><label htmlFor="coupon">Tem um cupom?</label><div><input id="coupon" value={checkout.coupon} onChange={(event) => updateCheckout("coupon", event.target.value)} placeholder="Digite o código" /><button type="button" disabled={busy === "coupon" || !checkout.shippingMethod} onClick={applyCheckoutCoupon}>{busy === "coupon" ? "Validando…" : appliedCoupon ? "Aplicado" : "Aplicar"}</button></div>{couponStatus && <small className={appliedCoupon ? "coupon-ok" : "coupon-error"}>{couponStatus}</small>}</div>
                    <button className="button button-primary checkout-next" type="submit" disabled={busy === "checkout" || Boolean(busy?.startsWith("cart-"))}>{busy === "checkout" ? "Abrindo pagamento seguro…" : busy?.startsWith("cart-") ? "Salvando personalização…" : `Ir para o pagamento • ${money(total)}`}</button>
                    {checkoutError && <p className="checkout-payment-error" role="alert">{checkoutError}</p>}
                    <button className="back-link" type="button" onClick={() => setCheckoutStep(1)}>← Alterar entrega</button>
                  </form>
                )}
              </div>
              <aside className="checkout-summary"><h2>Seu pedido</h2><div className="checkout-items">{store.cart.map((item) => {
                const draftKey = `${item.id}:${item.variantId}:${item.personalizationText}`;
                const engraving = personalizationDrafts[draftKey] ?? item.personalizationText;
                const unitPrice = checkout.paymentMethod === "pix" && item.pixDiscountEnabled ? Math.round(item.priceCents * (100 - (item.pixDiscountPercent ?? 0)) / 100) : item.priceCents;
                return <div key={draftKey}><div><img src={item.image} alt="" /><span>{item.quantity}</span></div><p><strong>{item.name}</strong><small>{item.variantLabel || item.material}</small>{item.personalizationEnabled && <label className="checkout-personalization">Deseja personalizar? Informe o nome abaixo.<input type="text" value={engraving} maxLength={item.personalizationMaxChars ?? 20} autoComplete="off" placeholder="Deixe em branco se não quiser gravar" onChange={(event) => setPersonalizationDrafts((current) => ({ ...current, [draftKey]: event.target.value }))} onBlur={() => { if (engraving.trim() !== item.personalizationText) void setCartQuantity(item, item.quantity, false, item.variantId, engraving, item.personalizationText); }} /><small>Até {item.personalizationMaxChars ?? 20} caracteres. Confira a grafia.</small></label>}{item.personalizationText && <small>Gravação: {item.personalizationText}</small>}</p><b>{money(unitPrice * item.quantity)}</b></div>;
              })}</div><div className="summary-lines"><p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>{pixDiscount > 0 && <p className="discount-line"><span>Desconto no Pix</span><strong>− {money(pixDiscount)}</strong></p>}<p><span>Entrega</span><strong>{selectedShipping ? shipping ? money(shipping) : "Grátis" : "A calcular"}</strong></p>{couponDiscount > 0 && <p className="discount-line"><span>Cupom {appliedCoupon?.code}</span><strong>− {money(couponDiscount)}</strong></p>}{shippingDiscount > 0 && <p className="discount-line"><span>Frete grátis • {appliedCoupon?.code}</span><strong>− {money(shippingDiscount)}</strong></p>}<div><span>Total</span><strong>{money(total)}</strong></div><small>{checkout.paymentMethod === "pix" ? "Pagamento via Pix pelo Asaas" : "Cartão de crédito pelo Asaas"}</small></div><div className="summary-trust"><span>Compra protegida</span><span>Troca em 7 dias</span><span>Dados seguros</span></div></aside>
            </div>
          ) : (
              <section className="success-screen"><div className="success-mark">✓</div><p className="eyebrow dark">Pedido recebido</p><h1>Sua próxima assinatura<br />já tem número.</h1><p>Pedido <strong>{order?.id}</strong> recebido com sucesso. A situação do pagamento será atualizada automaticamente.</p><div className="success-order"><span>Total</span><strong>{money(order?.totalCents ?? total)}</strong><small>Pagamento protegido pelo Asaas</small></div><a className="button button-primary" href="/conta">Acompanhar em minha conta</a><button className="back-link" onClick={() => { setCheckoutOpen(false); setCheckout(initialCheckout); setAppliedCoupon(null); setCouponStatus(""); }}>Voltar para a loja</button></section>
          )}
        </div>
      )}
    </main>
  );
}
