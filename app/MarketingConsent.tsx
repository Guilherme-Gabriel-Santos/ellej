"use client";

import { useEffect, useState } from "react";
import { initializeMetaPixel, marketingConsentKey } from "./marketing";

type TrackingConfig = { enabled: boolean; pixelId?: string };

export function MarketingConsent() {
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/tracking/config", { cache: "force-cache" })
      .then((response) => response.json() as Promise<TrackingConfig>)
      .then((value) => {
        if (!active || !value.enabled || !value.pixelId) return;
        setConfig(value);
        const consent = window.localStorage.getItem(marketingConsentKey);
        if (consent === "accepted") initializeMetaPixel(value.pixelId);
        else if (consent !== "rejected") setOpen(true);
      })
      .catch(() => undefined);
    const showPreferences = () => setOpen(true);
    window.addEventListener("ellejew:privacy", showPreferences);
    return () => {
      active = false;
      window.removeEventListener("ellejew:privacy", showPreferences);
    };
  }, []);

  if (!config?.pixelId || !open) return null;
  return (
    <aside className="consent-banner" aria-label="Preferências de privacidade">
      <div><strong>Sua privacidade importa.</strong><p>Usamos tecnologias opcionais da Meta para medir anúncios e melhorar a experiência. A loja, o carrinho e o pagamento funcionam normalmente sem elas.</p><a href="/privacidade">Ver Política de Privacidade</a></div>
      <div><button type="button" className="consent-essential" onClick={() => { window.localStorage.setItem(marketingConsentKey, "rejected"); setOpen(false); }}>Somente essenciais</button><button type="button" className="consent-accept" onClick={() => { window.localStorage.setItem(marketingConsentKey, "accepted"); initializeMetaPixel(config.pixelId!); setOpen(false); }}>Aceitar e continuar</button></div>
    </aside>
  );
}
