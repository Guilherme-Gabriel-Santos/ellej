export const marketingConsentKey = "ellejew_marketing_consent";

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

export function marketingConsentGranted() {
  return typeof window !== "undefined" && window.localStorage.getItem(marketingConsentKey) === "accepted";
}

export function initializeMetaPixel(pixelId: string) {
  if (typeof window === "undefined" || !/^\d{8,20}$/.test(pixelId)) return;
  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    }) as MetaPixelFunction;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/pt_BR/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("consent", "grant");
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

export function trackMetaEvent(name: string, parameters: Record<string, unknown>) {
  if (!marketingConsentGranted() || !window.fbq) return;
  window.fbq("track", name, parameters);
}
