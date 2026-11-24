"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
    const finish = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile indisponível"));
    const existing = document.querySelector<HTMLScriptElement>('script[data-ellejew-turnstile="true"]');
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile indisponível")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.ellejewTurnstile = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile indisponível")), { once: true });
    document.head.appendChild(script);
  });
  return turnstileLoader;
}

export function Turnstile({
  siteKey,
  action,
  onToken,
  onError,
  className,
}: {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  onError: () => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Verificando sua conexão com segurança...");
  const emitToken = useEffectEvent(onToken);
  const emitError = useEffectEvent(onError);

  useEffect(() => {
    let active = true;
    let widgetId = "";
    emitToken("");

    loadTurnstile()
      .then((api) => {
        if (!active || !container.current) return;
        widgetId = api.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          size: "flexible",
          theme: "light",
          language: "pt-br",
          callback: (token: string) => {
            if (!active) return;
            setStatus("Verificação de segurança concluída.");
            emitToken(token);
          },
          "expired-callback": () => {
            if (!active) return;
            setStatus("A verificação expirou. Aguarde a renovação.");
            emitToken("");
          },
          "error-callback": () => {
            if (!active) return;
            setStatus("Não foi possível concluir a verificação.");
            emitToken("");
            emitError();
          },
        });
      })
      .catch(() => {
        if (!active) return;
        setStatus("Não foi possível carregar a verificação de segurança.");
        emitError();
      });

    return () => {
      active = false;
      emitToken("");
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, siteKey]);

  return (
    <div className={className}>
      <div ref={container} />
      <span role="status" aria-live="polite">{status}</span>
    </div>
  );
}
