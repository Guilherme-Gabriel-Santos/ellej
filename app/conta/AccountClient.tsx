"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Turnstile } from "../Turnstile";
import styles from "./account.module.css";

type Mode = "account" | "login" | "register";
type Flow = "login" | "register" | "verify" | "forgot" | "reset";
type Account = { userId: string; name: string; email: string; phone: string };
type OrderItem = { name: string; variantLabel: string | null; personalizationText: string | null; unitPriceCents: number; quantity: number; image: string | null };
type Order = {
  id: string;
  totalCents: number;
  status: string;
  paymentStatus: string | null;
  shippingName: string;
  deliveryDays: number | null;
  trackingCode: string | null;
  shippingStatus: string | null;
  createdAt: string;
  items: OrderItem[];
};
type AccountApiResponse = {
  error?: string;
  challengeId?: string;
  emailHint?: string;
  localCode?: string;
  message?: string;
  turnstileSiteKey?: string;
};

const turnstileActions: Partial<Record<Flow, string>> = {
  login: "customer_login",
  register: "customer_register",
  forgot: "password_reset_request",
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function safeReturnTo() {
  const value = new URLSearchParams(window.location.search).get("returnTo") || "/conta";
  // Resolve a URL de verdade: "/\evil.com" vira "//evil.com" no navegador e precisa ser recusado.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/conta";
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/conta";
  } catch {
    return "/conta";
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    aguardando_pagamento: "Aguardando pagamento",
    pago: "Pagamento confirmado",
    em_separacao: "Em separação",
    enviado: "Pedido enviado",
    concluido: "Entregue",
    cancelado: "Pedido cancelado",
  };
  return labels[status] ?? "Pedido recebido";
}

function statusStep(status: string) {
  return ({ aguardando_pagamento: 0, pago: 1, em_separacao: 2, enviado: 3, concluido: 4 } as Record<string, number>)[status] ?? 0;
}

async function post(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json() as AccountApiResponse;
  if (!response.ok) throw new Error(String(data.error || "Não foi possível concluir agora."));
  return data;
}

export function AccountClient({ mode }: { mode: Mode }) {
  const [flow, setFlow] = useState<Flow>(mode === "register" ? "register" : "login");
  const [account, setAccount] = useState<Account | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(mode === "account");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "", code: "" });

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setTurnstileSiteKey(String(data.turnstileSiteKey ?? ""));
        if (mode !== "account") return;
        if (!data.account) {
          window.location.replace("/conta/entrar?returnTo=%2Fconta");
          return;
        }
        setAccount(data.account);
        setOrders(data.orders ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar seus pedidos."))
      .finally(() => { if (mode === "account") setLoading(false); });
  }, [mode]);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const turnstileAction = turnstileActions[flow];
    try {
      if (turnstileAction && !turnstileToken) throw new Error("Aguarde a verificação de segurança antes de continuar.");
      if (flow === "register") {
        if (form.password !== form.confirmPassword) throw new Error("As senhas não são iguais.");
        const data = await post("register", { name: form.name, email: form.email, phone: form.phone, password: form.password, turnstileToken });
        setChallengeId(data.challengeId ?? "");
        setEmailHint(data.emailHint || form.email);
        setFlow("verify");
        setMessage(data.localCode ? `Código local: ${data.localCode}` : "Enviamos um código para confirmar seu e-mail.");
      } else if (flow === "verify") {
        await post("verify", { challengeId, code: form.code });
        window.location.assign(safeReturnTo());
      } else if (flow === "login") {
        await post("login", { email: form.email, password: form.password, turnstileToken });
        window.location.assign(safeReturnTo());
      } else if (flow === "forgot") {
        const data = await post("forgotPassword", { email: form.email, turnstileToken });
        setChallengeId(data.challengeId ?? "");
        setEmailHint(data.emailHint || "seu e-mail");
        setFlow("reset");
        setMessage(data.localCode ? `Código local: ${data.localCode}` : (data.message ?? "Enviamos um código de recuperação para o seu e-mail."));
      } else if (flow === "reset") {
        if (form.password !== form.confirmPassword) throw new Error("As senhas não são iguais.");
        await post("resetPassword", { challengeId, code: form.code, password: form.password });
        window.location.assign(safeReturnTo());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir agora.");
    } finally {
      if (turnstileAction) {
        setTurnstileToken("");
        setTurnstileAttempt((current) => current + 1);
      }
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await post("logout");
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível sair agora.");
      setBusy(false);
    }
  }

  if (mode === "account") {
    return (
      <main className={styles.page}>
        <AccountHeader />
        <section className={styles.accountHero}>
          <div><p>Minha conta</p><h1>{loading ? "Carregando…" : `Olá, ${account?.name.split(" ")[0] || "cliente"}.`}</h1><span>Acompanhe seus pedidos e encontre os códigos de rastreio em um só lugar.</span></div>
          {account && <div className={styles.profile}><small>Conta confirmada</small><strong>{account.name}</strong><span>{account.email}</span>{account.phone && <span>{account.phone}</span>}<button onClick={logout} disabled={busy}>Sair da conta</button></div>}
        </section>
        <section className={styles.ordersSection}>
          <div className={styles.ordersHeading}><p>Seus pedidos</p><span>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</span></div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {!loading && !orders.length && !error && <div className={styles.empty}><span>◇</span><h2>Sua história com a Elle Jew começa aqui.</h2><p>Quando você fizer uma compra, todos os detalhes aparecerão nesta página.</p><Link href="/#colecao">Descobrir a coleção</Link></div>}
          <div className={styles.orderList}>
            {orders.map((order) => {
              const step = statusStep(order.status);
              const canceled = order.status === "cancelado";
              return <article className={styles.orderCard} key={order.id}>
                <header><div><small>Pedido</small><strong>{order.id}</strong></div><div><small>Data</small><strong>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${order.createdAt.replace(" ", "T")}Z`))}</strong></div><div><small>Total</small><strong>{money(order.totalCents)}</strong></div><span className={canceled ? styles.canceled : styles.status}>{statusLabel(order.status)}</span></header>
                {!canceled && <div className={styles.timeline} aria-label={`Situação: ${statusLabel(order.status)}`}>
                  {["Pedido", "Pago", "Separação", "Enviado", "Entregue"].map((label, index) => <div className={index <= step ? styles.complete : ""} key={label}><i /><span>{label}</span></div>)}
                </div>}
                <div className={styles.orderBody}>
                  <div className={styles.orderItems}>{order.items.map((item, index) => <div key={`${item.name}-${index}`}>{item.image ? <img src={item.image} alt="" /> : <span className={styles.itemFallback}>EJ</span>}<p><strong>{item.name}</strong>{item.variantLabel && <small>{item.variantLabel}</small>}{item.personalizationText && <small>Gravação: {item.personalizationText}</small>}<span>{item.quantity} × {money(item.unitPriceCents)}</span></p></div>)}</div>
                  <aside><small>Entrega</small><strong>{order.shippingName}</strong>{order.deliveryDays && <span>Prazo estimado: {order.deliveryDays} dias úteis</span>}{order.trackingCode ? <><small>Código de rastreio</small><code>{order.trackingCode}</code><button onClick={() => navigator.clipboard.writeText(order.trackingCode || "")}>Copiar código</button></> : <span>O rastreio aparecerá aqui após a postagem.</span>}</aside>
                </div>
              </article>;
            })}
          </div>
        </section>
      </main>
    );
  }

  const title = flow === "register" ? "Criar uma conta" : flow === "verify" ? "Confirme seu e-mail" : flow === "forgot" ? "Recuperar senha" : flow === "reset" ? "Crie uma nova senha" : "Entrar na sua conta";
  const subtitle = flow === "register" ? "Compre mais rápido e acompanhe seus pedidos em um só lugar." : flow === "verify" || flow === "reset" ? `Digite o código enviado para ${emailHint}.` : flow === "forgot" ? "Enviaremos um código de recuperação para o seu e-mail." : "Acesse seus pedidos e continue sua compra com segurança.";

  return (
    <main className={styles.authPage}>
      <AccountHeader />
      <section className={styles.authShell}>
        <div className={styles.authEditorial}><p>Elle Jew</p><h2>Seu brilho,<br /><em>sempre por perto.</em></h2><span>Uma área reservada para acompanhar cada etapa da sua escolha.</span></div>
        <div className={styles.authCard}>
          <div className={styles.breadcrumb}><Link href="/">Início</Link><span>Minha conta</span>{flow === "register" && <span>Cadastre-se</span>}</div>
          <p className={styles.eyebrow}>{flow === "register" ? "Primeiro acesso" : "Área da cliente"}</p>
          <h1>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          <form onSubmit={submit}>
            {flow === "register" && <label>Nome completo<input autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Maria Silva" required /></label>}
            {!["verify", "reset"].includes(flow) && <label>E-mail<input type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="seuemail@exemplo.com.br" required /></label>}
            {flow === "register" && <label>Telefone <span>(opcional)</span><input inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="(16) 99999-9999" /></label>}
            {["login", "register", "reset"].includes(flow) && <label>Senha<div className={styles.passwordField}><input type={showPassword ? "text" : "password"} autoComplete={flow === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => update("password", event.target.value)} placeholder={flow === "login" ? "Sua senha" : "10 caracteres, letras e números"} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Ver"}</button></div></label>}
            {["register", "reset"].includes(flow) && <label>Confirmar senha<input type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} required /></label>}
            {["verify", "reset"].includes(flow) && <label>Código de 6 números<input className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={form.code} onChange={(event) => update("code", event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required /></label>}
            {turnstileActions[flow] && turnstileSiteKey && <Turnstile key={`${flow}-${turnstileAttempt}`} siteKey={turnstileSiteKey} action={turnstileActions[flow]} onToken={setTurnstileToken} onError={() => setError("Não foi possível concluir a verificação de segurança. Atualize a página e tente novamente.")} className={styles.turnstile} />}
            {turnstileActions[flow] && !turnstileSiteKey && <p className={styles.securityUnavailable} role="alert">A verificação de segurança está indisponível. Atualize a página em instantes.</p>}
            {message && <p className={styles.message} role="status">{message}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} disabled={busy || Boolean(turnstileActions[flow] && !turnstileToken)}>{busy ? "Aguarde…" : flow === "register" ? "Criar minha conta" : flow === "verify" ? "Confirmar conta" : flow === "forgot" ? "Enviar código" : flow === "reset" ? "Salvar nova senha" : "Entrar"}</button>
          </form>
          {flow === "login" && <><button className={styles.textButton} onClick={() => { setFlow("forgot"); setTurnstileToken(""); setError(""); }}>Esqueci minha senha</button><p className={styles.switch}>Ainda não tem conta? <button onClick={() => { setFlow("register"); setTurnstileToken(""); setError(""); }}>Cadastre-se</button></p></>}
          {flow !== "login" && <p className={styles.switch}>Já possui uma conta? <button onClick={() => { setFlow("login"); setTurnstileToken(""); setError(""); setMessage(""); }}>Faça login</button></p>}
        </div>
      </section>
    </main>
  );
}

function AccountHeader() {
  return <header className={styles.header}><Link href="/" aria-label="Voltar para a loja"><img src="/brand/logo.webp" alt="Elle Jew" /></Link><nav><Link href="/">Loja</Link><Link href="/conta">Meus pedidos</Link><a href="https://wa.me/5516992939739" target="_blank" rel="noreferrer">Ajuda</a></nav></header>;
}
