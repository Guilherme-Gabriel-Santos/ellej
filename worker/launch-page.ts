const timeZone = "America/Sao_Paulo";
const whatsappGroup = "https://chat.whatsapp.com/DbBWIoQJrEsLQuFe2jqGzJ";

type LaunchAudience = "public" | "vip";
export type LaunchTeaser = { name: string; image: string };
export type LaunchPageOptions = { teasers?: LaunchTeaser[]; turnstileSiteKey?: string };

const defaultTeasers: LaunchTeaser[] = [
  { image: "/brand/choker-coracoes.webp", name: "Choker" },
  { image: "/brand/conjunto-ametista.webp", name: "Conjunto" },
  { image: "/brand/colar-ponto-luz.webp", name: "Ponto de luz" },
];

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeImage(value: string) {
  return /^\/(?:brand|api\/media)\/[A-Za-z0-9._/-]+$/.test(value)
    || /^\/api\/media\?key=[A-Za-z0-9._-]+$/.test(value)
    || /^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>]*$/.test(value) ? value : "";
}

/** Nome curto para o cartão do spoiler: "Colar Nome Personalizado Moissanite e Prata 925 - 2-10 letras" -> "Colar Nome Personalizado". */
function teaserLabel(name: string) {
  const base = name.replace(/\([^)]*\)/g, " ").split(/\s+-\s+/)[0].trim();
  return base.split(/\s+/).slice(0, 3).join(" ") || name.slice(0, 30);
}

function launchParts(launchAt: string) {
  const date = new Date(launchAt);
  if (!Number.isFinite(date.getTime())) return { label: "Em breve", short: "em breve", iso: launchAt, dayMonth: "", opening: "Em breve a loja abre" };
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone, ...options }).format(date);
  const weekday = part({ weekday: "long" }).replace("-feira", "");
  const day = part({ day: "numeric" });
  const month = part({ month: "long" });
  const hourRaw = part({ hour: "2-digit", hourCycle: "h23" });
  const minute = part({ minute: "2-digit" }).padStart(2, "0");
  const hour = `${hourRaw}h${minute === "00" ? "" : minute}`;
  const capitalWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return {
    label: `${capitalWeekday} · ${day} de ${month} · ${hour}`,
    short: `${day} de ${month}, às ${hour}`,
    iso: date.toISOString(),
    dayMonth: `${day.padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    opening: `${capitalWeekday}, dia ${day}, ${hour === "00h" ? "à meia-noite" : `às ${hour}`}, a loja abre`,
  };
}

export function renderLaunchPage(launchAt: string, requestMethod: string, audience: LaunchAudience = "public", options: LaunchPageOptions = {}): Response {
  const isVip = audience === "vip";
  const target = JSON.stringify(launchAt);
  const when = launchParts(launchAt);
  const intro = isVip
    ? "Seu acesso antecipado está garantido. Você entra antes de todo mundo."
    : `Estamos preparando a maior Black Friday da Elle Jew.<br>Prata 925, Moissanites, joias inspiradas na alta joalheria com condições que só acontecem uma vez por ano.<br><strong class="intro-highlight">Todo o site com desconto!!</strong>`;
  const spark = `<svg class="spark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c.6 4.2 3.8 7.4 8 8-4.2.6-7.4 3.8-8 8-.6-4.2-3.8-7.4-8-8 4.2-.6 7.4-3.8 8-8z"/></svg>`;
  const marqueeItem = ["Black Friday", "Elle Jew", when.dayMonth || "Em breve"].map((label) => `<span>${label}</span>${spark}`).join("");
  const chosen = (options.teasers ?? []).map((item) => ({ name: teaserLabel(item.name), image: safeImage(item.image) })).filter((item) => item.image).slice(0, 6);
  const teasers = chosen.length ? chosen : defaultTeasers;
  const siteKey = /^[0-9A-Za-z_-]{10,100}$/.test(options.turnstileSiteKey ?? "") ? options.turnstileSiteKey! : "";
  const body = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Elle Jew | Black Friday${when.dayMonth ? ` · ${when.dayMonth}` : ""}</title>
  <meta name="description" content="A Black Friday Elle Jew abre em ${when.short}. Prepare-se.">
  <meta name="theme-color" content="#05070b">
  <meta property="og:title" content="Elle Jew | Black Friday está chegando">
  <meta property="og:description" content="O cadeado abre em ${when.short}. A noite mais brilhante do ano.">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:url" content="https://ellejew.com.br/">
  <meta property="og:image" content="https://ellejew.com.br/brand/editorial-ellej-rings.webp">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <link rel="canonical" href="https://ellejew.com.br/">
  <link rel="icon" href="/brand/logo.webp">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: dark;
      --black: #05070b;
      --coal: #0d0c0a;
      --gold: #c9a45f;
      --gold-light: #f1dca8;
      --gold-deep: #8a6a2f;
      --ivory: #fffaf1;
      --muted: rgba(255, 250, 241, .62);
      --ease: cubic-bezier(.16, 1, .3, 1);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100svh;
      overflow-x: hidden;
      background: var(--black);
      color: var(--ivory);
      font-family: "Jost", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    #sparks { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: -1;
      background:
        radial-gradient(ellipse 60% 45% at 50% 38%, rgba(201, 164, 95, .2), transparent 70%),
        linear-gradient(180deg, rgba(5, 7, 11, .55), rgba(5, 7, 11, .92) 70%, var(--black)),
        url("/brand/editorial-ellej-rings.webp") center 40% / cover no-repeat var(--black);
      animation: breathe 18s ease-in-out infinite alternate;
    }
    /* Computador: tela dividida. A foto (retrato 1066x1600) ocupa a lateral direita na altura da tela, sem ser esticada; o conteúdo fica à esquerda. */
    @media (min-width: 1024px) {
      :root { --panel: min(46vw, calc(100vh * .6662)); }
      .backdrop {
        inset: 0 0 0 auto;
        width: var(--panel);
        background:
          linear-gradient(90deg, var(--black) 0, var(--black) 4%, rgba(5, 7, 11, .7) 20%, transparent 55%),
          linear-gradient(0deg, var(--black) 0, transparent 30%),
          url("/brand/editorial-ellej-rings.webp") center top / cover no-repeat var(--black);
        transform-origin: 70% 30%;
      }
      .backdrop::after { display: none; }
      body { background: radial-gradient(ellipse 45% 55% at 28% 40%, rgba(201, 164, 95, .12), transparent 70%), var(--black); }
      .stage > header, .hero { width: calc(100% - var(--panel) + clamp(20px, 5vw, 64px)); align-self: flex-start; }
    }
    .backdrop::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 42%, transparent 0, rgba(5, 7, 11, .5) 45%, var(--black) 85%);
    }
    .grain {
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .14;
      z-index: 5;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E");
    }
    .stage {
      position: relative;
      z-index: 2;
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: clamp(22px, 3.5vw, 44px) clamp(20px, 5vw, 64px) 0;
      text-align: center;
    }
    header { width: 100%; display: flex; justify-content: center; }
    .brand {
      width: clamp(112px, 10vw, 156px);
      filter: brightness(0) saturate(100%) invert(75%) sepia(27%) saturate(695%) hue-rotate(359deg) brightness(89%) contrast(86%);
      animation: rise .9s var(--ease) both;
    }
    .hero { flex: 1; width: 100%; max-width: 1100px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: clamp(18px, 3.5vh, 56px) 0; }
    .lock {
      width: clamp(48px, min(6vw, 7vh), 78px);
      height: auto;
      margin-bottom: clamp(16px, 2.6vh, 28px);
      overflow: visible;
      filter: drop-shadow(0 0 22px rgba(241, 220, 168, .45));
      animation: rise .9s .1s var(--ease) both, sway 4.5s 1.2s ease-in-out infinite;
      transform-origin: 50% 0;
    }
    .lock .shackle { transition: transform .9s var(--ease); transform-origin: 70% 100%; }
    .lock.open .shackle { transform: translateY(-9px) rotate(-28deg); }
    .lock.open { animation: unlock-pop .9s var(--ease) both; }
    .eyebrow {
      margin: 0 0 clamp(14px, 2vh, 22px);
      display: inline-flex;
      align-items: center;
      gap: 14px;
      color: var(--gold-light);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: .28em;
      text-transform: uppercase;
      animation: rise .9s .2s var(--ease) both;
    }
    .eyebrow::before, .eyebrow::after { content: ""; width: 34px; height: 1px; background: linear-gradient(90deg, transparent, var(--gold)); }
    .eyebrow::after { transform: scaleX(-1); }
    h1 {
      margin: 0;
      font-family: "Jost", sans-serif;
      font-weight: 600;
      font-size: clamp(54px, min(11.5vw, 15vh), 178px);
      line-height: .86;
      letter-spacing: -.02em;
      text-transform: uppercase;
    }
    h1 .line { display: block; overflow: hidden; padding: 0 .04em; }
    h1 .char {
      display: inline-block;
      background: linear-gradient(100deg, var(--gold-deep) 0%, var(--gold) 22%, #fff4d6 38%, var(--gold-light) 46%, var(--gold) 62%, var(--gold-deep) 100%);
      background-size: 250% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: letter-in 1.1s var(--ease) both, shimmer 5s linear infinite;
      animation-delay: calc(.32s + var(--i) * .055s), calc(1.6s + var(--i) * .06s);
    }
    h1 .line.thin .char { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 400; font-style: italic; text-transform: none; letter-spacing: 0; }
    .intro {
      max-width: 560px;
      margin: clamp(18px, 3vh, 30px) auto 0;
      color: var(--muted);
      font-size: clamp(14px, 1.15vw, 17px);
      font-weight: 300;
      line-height: 1.75;
      animation: rise 1s 1s var(--ease) both;
    }
    .intro-highlight { display: inline-block; margin-top: 6px; color: var(--gold-light); font-weight: 500; letter-spacing: .04em; }
    .countdown {
      margin-top: clamp(26px, 4.5vh, 50px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: clamp(8px, 1.6vw, 22px);
      animation: rise 1s 1.15s var(--ease) both;
    }
    .unit { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .digits {
      position: relative;
      min-width: clamp(76px, 9.5vw, 136px);
      padding: clamp(14px, 1.7vw, 24px) clamp(10px, 1.2vw, 16px);
      border: 1px solid transparent;
      border-radius: 16px;
      background:
        linear-gradient(165deg, #211c14 0%, #0f0e0d 55%, #08090c 100%) padding-box,
        linear-gradient(160deg, rgba(255, 240, 200, .9), rgba(201, 164, 95, .12) 42%, rgba(201, 164, 95, .12) 62%, rgba(241, 220, 168, .7)) border-box;
      box-shadow: 0 26px 60px rgba(0, 0, 0, .6), 0 0 46px rgba(201, 164, 95, .1), inset 0 1px 0 rgba(255, 244, 214, .12);
      perspective: 500px;
      overflow: hidden;
    }
    .digits strong {
      position: relative;
      display: block;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: clamp(40px, min(6.2vw, 8vh), 96px);
      font-weight: 600;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      text-align: center;
      background: linear-gradient(180deg, #fff7e0 0%, #f1dca8 38%, #c9a45f 72%, #a07d3e 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      filter: drop-shadow(0 2px 12px rgba(201, 164, 95, .28));
      transform-origin: 50% 50%;
      backface-visibility: hidden;
    }
    .digits strong.tick { animation: flip .62s var(--ease); }
    .bar { display: block; width: 64%; height: 2px; border-radius: 2px; background: rgba(201, 164, 95, .16); overflow: hidden; }
    .bar b { display: block; height: 100%; width: calc(var(--p, 0) * 100%); background: linear-gradient(90deg, #a07d3e, #f1dca8); box-shadow: 0 0 10px rgba(241, 220, 168, .6); transition: width .9s linear; }
    .unit span { color: var(--gold-light); font-size: 12px; font-weight: 500; letter-spacing: .18em; text-transform: uppercase; }
    .sep { display: flex; flex-direction: column; gap: 12px; margin-top: clamp(30px, min(3.6vw, 4.6vh), 54px); animation: pulse 2s ease-in-out infinite; }
    .sep i { width: 6px; height: 6px; background: var(--gold); transform: rotate(45deg); box-shadow: 0 0 10px rgba(241, 220, 168, .7); }
    .released .digits { box-shadow: 0 0 60px rgba(241, 220, 168, .45); }
    .launch-date {
      margin: clamp(18px, 3vh, 28px) 0 0;
      color: var(--gold-light);
      font-size: 13px;
      letter-spacing: .2em;
      text-transform: uppercase;
      animation: rise 1s 1.3s var(--ease) both;
    }
    .cta {
      justify-content: center;
      margin-top: clamp(22px, 3.5vh, 36px);
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 16px 30px;
      border: 1px solid var(--gold);
      color: var(--black);
      background: linear-gradient(100deg, var(--gold) 0%, var(--gold-light) 50%, var(--gold) 100%);
      background-size: 200% 100%;
      min-height: 52px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: .2em;
      text-transform: uppercase;
      text-decoration: none;
      position: relative;
      overflow: hidden;
      animation: rise 1s 1.45s var(--ease) both, glow 2.6s 2.5s ease-in-out infinite;
      transition: background-position .6s var(--ease), transform .3s var(--ease);
    }
    .cta::before {
      content: "";
      position: absolute;
      top: 0; bottom: 0; left: -60%;
      width: 40%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .65), transparent);
      transform: skewX(-20deg);
      animation: sweep 3.2s 2s ease-in-out infinite;
    }
    .cta:hover { background-position: 100% 0; transform: translateY(-2px); }
    .cta:focus-visible { outline: 2px solid var(--ivory); outline-offset: 4px; }
    .social { margin-top: 8px; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); animation: rise 1s 1.55s var(--ease) both; }
    .social a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; color: var(--gold-light); text-decoration: underline; text-decoration-color: rgba(241, 220, 168, .4); text-underline-offset: 4px; transition: color .2s; }
    .social a:hover { color: var(--ivory); }
    .marquee {
      position: relative;
      z-index: 2;
      width: 100vw;
      margin-top: auto;
      border-top: 1px solid rgba(201, 164, 95, .3);
      border-bottom: 1px solid rgba(201, 164, 95, .3);
      background: rgba(5, 7, 11, .7);
      overflow: hidden;
      white-space: nowrap;
      animation: rise 1s 1.6s var(--ease) both;
    }
    .marquee-track { display: inline-flex; padding: 14px 0; animation: marquee 32s linear infinite; }
    .marquee-track { align-items: center; }
    .marquee span { padding: 0 22px; font-size: 13px; font-weight: 500; letter-spacing: .3em; text-transform: uppercase; color: var(--ivory); }
    .spark { width: 10px; height: 10px; fill: var(--gold); flex: none; }
    #notify-open { animation: rise 1s 1.45s var(--ease) both, glow 2.6s 2.5s ease-in-out infinite; border: 1px solid var(--gold); cursor: pointer; font-family: "Jost", sans-serif; }
    .notify { width: 100%; max-width: 520px; margin: clamp(26px, 4vh, 40px) auto 0; text-align: left; animation: rise .7s var(--ease) both; }
    .notify[hidden] { display: none; }
    .notify-title { margin: 0 0 8px; text-align: center; font: 400 clamp(28px, 4vw, 40px)/1.1 "Cormorant Garamond", Georgia, serif; color: var(--gold-light); }
    .notify-label { display: block; margin-bottom: 16px; color: var(--muted); font-size: 15px; line-height: 1.5; text-align: center; }
    .notify-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-width: 340px; margin: 6px auto 18px; padding: 5px; border: 1px solid rgba(201, 164, 95, .35); border-radius: 999px; background: rgba(8, 8, 7, .7); }
    .notify-switch button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: 500 13px "Jost", sans-serif; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; transition: background .25s, color .25s; }
    .notify-switch button svg { width: 16px; height: 16px; fill: currentColor; }
    .notify-switch button:hover { color: var(--gold-light); }
    .notify-switch button.active { background: linear-gradient(100deg, var(--gold), var(--gold-light)); color: var(--black); }
    .notify-panel[hidden] { display: none; }
    .notify-panel { animation: rise .4s var(--ease) both; }
    .wa-cta { display: flex; width: 100%; margin-top: 0; animation: none; border: 1px solid var(--gold); }
    .wa-cta svg { width: 18px; height: 18px; }
    .notify.done .notify-switch { display: none; }
    .notify-back { display: block; margin: 14px auto 0; min-height: 44px; padding: 0 16px; border: 0; background: none; color: var(--muted); font: 500 12px "Jost", sans-serif; letter-spacing: .18em; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
    .notify-back:hover { color: var(--gold-light); }
    .turnstile-box { margin-top: 12px; }
    /* Modo foco: ao pedir o aviso, fica só o contador e o e-mail. */
    .stage > header, .lock, h1, .intro, .launch-date, .social, .teaser, .marquee { transition: opacity .35s var(--ease); }
    .focus .lock, .focus h1, .focus .intro, .focus .launch-date, .focus .social, .focus .teaser, .focus .marquee, .focus #notify-open { display: none; }
    .focus .hero { justify-content: center; }
    .focus .countdown { animation: rise .6s var(--ease) both; }
    .notify-row { display: flex; gap: 10px; }
    .notify input[type="email"] {
      flex: 1;
      min-width: 0;
      min-height: 52px;
      padding: 0 16px;
      border: 1px solid rgba(201, 164, 95, .5);
      background: rgba(8, 8, 7, .85);
      color: var(--ivory);
      font: 400 16px "Jost", sans-serif;
      border-radius: 0;
    }
    .notify input[type="email"]::placeholder { color: rgba(255, 250, 241, .45); }
    .notify input[type="email"]:focus-visible { outline: 2px solid var(--gold-light); outline-offset: 2px; border-color: var(--gold); }
    .notify input[aria-invalid="true"] { border-color: #f2a39a; }
    .notify .cta { animation: none; margin-top: 0; flex: none; cursor: pointer; border-radius: 0; font-family: "Jost", sans-serif; }
    .notify .cta:disabled { opacity: .6; cursor: wait; }
    .notify-consent { display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.5; cursor: pointer; }
    .notify-consent input { width: 20px; height: 20px; margin: 0; flex: none; accent-color: var(--gold); }
    .notify-consent a { color: var(--gold-light); }
    .notify-status { min-height: 1.5em; margin: 10px 0 0; font-size: 14px; text-align: center; color: var(--gold-light); }
    .notify-status.error { color: #f2a39a; }
    .notify.done .notify-row, .notify.done .notify-consent, .notify.done .notify-label, .notify.done .turnstile-box { display: none; }
    .notify.done .notify-status { font-size: 16px; color: var(--ivory); }
    .cta svg { width: 16px; height: 16px; flex: none; fill: currentColor; transition: transform .25s var(--ease); }
    .cta:hover svg { transform: translateX(4px); }
    a:focus-visible, button:focus-visible { outline: 2px solid var(--gold-light); outline-offset: 4px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .motion-toggle {
      position: fixed;
      top: max(16px, env(safe-area-inset-top));
      right: max(16px, env(safe-area-inset-right));
      z-index: 30;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid rgba(201, 164, 95, .45);
      border-radius: 999px;
      background: rgba(5, 7, 11, .6);
      color: var(--gold-light);
      font: 500 12px/1 "Jost", sans-serif;
      letter-spacing: .14em;
      text-transform: uppercase;
      cursor: pointer;
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      transition: background .2s, border-color .2s;
    }
    .motion-toggle[hidden] { display: none; }
    .motion-toggle:hover { background: rgba(28, 24, 18, .85); border-color: var(--gold); }
    .motion-toggle svg { width: 14px; height: 14px; fill: currentColor; }
    .motion-toggle .icon-play { display: none; }
    .paused .motion-toggle .icon-play { display: block; }
    .paused .motion-toggle .icon-pause { display: none; }
    /* Pausa só o que se repete; as entradas terminam no estado final (que é o estilo base). */
    .paused .backdrop, .paused .lock:not(.open), .paused h1 .char, .paused .sep, .paused .cta, .paused .cta::before, .paused .marquee-track { animation: none !important; }
    .teaser { width: 100%; max-width: 760px; margin: clamp(36px, 6vh, 64px) auto 0; animation: rise 1s 1.7s var(--ease) both; }
    .teaser h2 { margin: 0 0 18px; color: var(--gold-light); font: 500 12px/1.4 "Jost", sans-serif; letter-spacing: .28em; text-transform: uppercase; }
    .teaser ul { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(30%, 200px), 1fr)); gap: clamp(10px, 1.6vw, 18px); }
    .teaser li { position: relative; aspect-ratio: 4 / 5; overflow: hidden; border: 1px solid rgba(201, 164, 95, .3); background: var(--coal); }
    .teaser img { width: 100%; height: 100%; object-fit: cover; filter: blur(6px) grayscale(.6) sepia(.4) brightness(.6) contrast(1.1); transform: scale(1.1); }
    .teaser li::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 50% 35%, rgba(241, 220, 168, .18), transparent 60%), linear-gradient(180deg, rgba(5, 7, 11, .1) 30%, rgba(5, 7, 11, .9)); }
    .teaser .tag { position: absolute; left: 0; right: 0; bottom: 12px; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ivory); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }
    .teaser .tag svg { width: 18px; height: 18px; fill: var(--gold-light); }
    .teaser .tag small { color: var(--gold-light); font-size: 12px; letter-spacing: .08em; }
    .released .countdown, .released .launch-date { opacity: .4; transition: opacity .6s; }
    .flash { position: fixed; inset: 0; z-index: 20; pointer-events: none; background: radial-gradient(circle at 50% 40%, rgba(255, 244, 214, .95), rgba(201, 164, 95, .4) 40%, transparent 75%); opacity: 0; }
    .released .flash { animation: flash 1.4s var(--ease) forwards; }
    @keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    @keyframes letter-in { from { opacity: 0; transform: translateY(105%) rotate(6deg); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
    @keyframes shimmer { from { background-position: 125% 0; } to { background-position: -125% 0; } }
    @keyframes breathe { from { transform: scale(1); } to { transform: scale(1.03); } }
    @keyframes sway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
    @keyframes unlock-pop { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1.1); } }
    @keyframes flip { 0% { transform: rotateX(85deg); opacity: 0; } 55% { transform: rotateX(-12deg); opacity: 1; } 100% { transform: none; } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
    @keyframes glow { 0%, 100% { box-shadow: 0 0 0 rgba(241, 220, 168, 0); } 50% { box-shadow: 0 0 34px rgba(241, 220, 168, .45); } }
    @keyframes sweep { 0% { left: -60%; } 55%, 100% { left: 130%; } }
    @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes flash { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
    @media (max-width: 640px) {
      .digits { min-width: 70px; border-radius: 12px; }
      .countdown { gap: 8px; }
      .unit span { font-size: 11px; letter-spacing: .1em; }
      .sep { display: none; }
      .cta { padding: 15px 22px; font-size: 12px; letter-spacing: .16em; }
      .notify-row { flex-direction: column; }
      .notify .cta { justify-content: center; }
      .motion-toggle span { display: none; }
      .motion-toggle { padding: 0; width: 44px; justify-content: center; }
      .teaser .tag { letter-spacing: .06em; }
      .eyebrow { letter-spacing: .16em; }
      .eyebrow::before, .eyebrow::after { width: 18px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; animation-delay: 0s !important; }
      #sparks { display: none; }
    }
  </style>
</head>
<body>
  <button class="motion-toggle" id="motion-toggle" type="button" aria-pressed="false" aria-label="Pausar animações">
    <svg class="icon-pause" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>
    <svg class="icon-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5z"/></svg>
    <span id="motion-label" aria-hidden="true">Pausar animações</span>
  </button>
  <div class="backdrop" aria-hidden="true"></div>
  <canvas id="sparks" aria-hidden="true"></canvas>
  <div class="flash" aria-hidden="true"></div>
  <main class="stage">
    <header><img class="brand" src="/brand/logo.webp" alt="Elle Jew"></header>
    <section class="hero">
      <svg class="lock" id="lock" viewBox="0 0 64 80" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f1dca8"/><stop offset=".5" stop-color="#c9a45f"/><stop offset="1" stop-color="#8a6a2f"/>
          </linearGradient>
        </defs>
        <path class="shackle" d="M16 36V24a16 16 0 0 1 32 0v12" fill="none" stroke="url(#lg)" stroke-width="6" stroke-linecap="round"/>
        <rect x="6" y="34" width="52" height="42" rx="7" fill="url(#lg)"/>
        <circle cx="32" cy="52" r="5" fill="#05070b"/>
        <rect x="29.5" y="54" width="5" height="11" rx="2.5" fill="#05070b"/>
      </svg>
      <h1 aria-label="Black Friday Elle Jew">
        <span class="line" data-split>Black</span>
        <span class="line" data-split>Friday</span>
      </h1>
      <p class="intro">${intro}</p>
      <p class="sr-only" id="countdown-text" role="timer" aria-live="off" aria-atomic="true">A Black Friday abre em ${when.short}.</p>
      <div class="countdown" aria-hidden="true">
        <div class="unit"><div class="digits"><strong id="days">00</strong></div><i class="bar"><b id="days-bar"></b></i><span>Dias</span></div>
        <div class="sep"><i></i><i></i></div>
        <div class="unit"><div class="digits"><strong id="hours">00</strong></div><i class="bar"><b id="hours-bar"></b></i><span>Horas</span></div>
        <div class="sep"><i></i><i></i></div>
        <div class="unit"><div class="digits"><strong id="minutes">00</strong></div><i class="bar"><b id="minutes-bar"></b></i><span>Minutos</span></div>
        <div class="sep"><i></i><i></i></div>
        <div class="unit"><div class="digits"><strong id="seconds">00</strong></div><i class="bar"><b id="seconds-bar"></b></i><span>Segundos</span></div>
      </div>
      <p class="launch-date"><time datetime="${when.iso}">O cadeado abre · ${when.label}</time></p>
      <button class="cta" type="button" id="notify-open" aria-expanded="false" aria-controls="notify">Quero ser avisada<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4L11.6 9H2a1 1 0 1 1 0-2h9.6L9.3 4.7a1 1 0 0 1 0-1.4z"/></svg></button>
      <form class="notify" id="notify" novalidate hidden>
        <h2 class="notify-title">A gente te avisa na hora</h2>
        <div class="notify-switch" role="group" aria-label="Como você quer ser avisada">
          <button type="button" class="active" data-channel="email" aria-pressed="true"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h13A1.5 1.5 0 0 1 18 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15.5v-11zm1.8.3 6.2 4.9 6.2-4.9H3.8zM16.5 6.4l-6 4.7a.8.8 0 0 1-1 0l-6-4.7v9.1h13V6.4z"/></svg>E-mail</button>
          <button type="button" data-channel="whatsapp" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5a8.4 8.4 0 0 0-7.3 12.6L1.5 18.5l4.5-1.2A8.4 8.4 0 1 0 10 1.5zm0 15.3a6.9 6.9 0 0 1-3.5-1l-.3-.1-2.6.7.7-2.5-.2-.3A6.9 6.9 0 1 1 10 16.8zm3.8-5.2c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1l-.6.8c-.1.1-.2.2-.4.1a5.7 5.7 0 0 1-2.8-2.5c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.6-1.5c-.2-.4-.3-.3-.5-.3h-.4a.8.8 0 0 0-.6.3 2.4 2.4 0 0 0-.7 1.8 4.2 4.2 0 0 0 .9 2.2 9.5 9.5 0 0 0 3.6 3.2c1.3.6 1.9.6 2.5.5.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1l-.6-.4z"/></svg>WhatsApp</button>
        </div>
        <div class="notify-panel" id="panel-email">
        <label class="notify-label" for="notify-email">Deixe seu e-mail e receba o link assim que a loja abrir.</label>
        <div class="notify-row">
          <input id="notify-email" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="seu@email.com" aria-describedby="notify-status">
          <button class="cta" type="submit" id="notify-submit">Me avisar<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.3 3.3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4L11.6 9H2a1 1 0 1 1 0-2h9.6L9.3 4.7a1 1 0 0 1 0-1.4z"/></svg></button>
        </div>
        <label class="notify-consent"><input type="checkbox" id="notify-consent" required> Aceito receber e-mails da Elle Jew sobre a Black Friday. <a href="/privacidade">Privacidade</a></label>
        ${siteKey ? `<div class="turnstile-box" id="turnstile-box" data-sitekey="${siteKey}"></div>` : ""}
        <p class="notify-status" id="notify-status" role="status" aria-live="polite"></p>
        </div>
        <div class="notify-panel" id="panel-whatsapp" hidden>
          <p class="notify-label">Entre no grupo VIP da Elle Jew. Avisamos lá no minuto em que a loja abrir, com o link das peças.</p>
          <a class="cta wa-cta" href="${whatsappGroup}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5a8.4 8.4 0 0 0-7.3 12.6L1.5 18.5l4.5-1.2A8.4 8.4 0 1 0 10 1.5zm0 15.3a6.9 6.9 0 0 1-3.5-1l-.3-.1-2.6.7.7-2.5-.2-.3A6.9 6.9 0 1 1 10 16.8z"/></svg>Entrar no grupo VIP<span class="sr-only"> do WhatsApp (abre em nova aba)</span></a>
        </div>
        <button class="notify-back" type="button" id="notify-back">Voltar</button>
      </form>
      <p class="social">Prefere WhatsApp? <a href="${whatsappGroup}" target="_blank" rel="noopener noreferrer">Entre no grupo VIP<span class="sr-only"> (abre em nova aba)</span></a> · <a href="https://www.instagram.com/ellejew_/" target="_blank" rel="noopener noreferrer">@ellejew_<span class="sr-only"> no Instagram (abre em nova aba)</span></a></p>
      <section class="teaser" aria-labelledby="teaser-title">
        <h2 id="teaser-title">Uma prévia do que vem por aí</h2>
        <ul>
          ${teasers.map((item) => `<li><img src="${escapeHtml(item.image)}" alt="" width="400" height="500" loading="lazy" decoding="async"><span class="tag"><svg viewBox="0 0 16 20" aria-hidden="true"><path d="M8 0a5 5 0 0 0-5 5v3H2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V5a5 5 0 0 0-5-5zm-3 5a3 3 0 1 1 6 0v3H5V5z"/></svg>${escapeHtml(item.name)}<small>Revelado em ${when.dayMonth || "breve"}</small></span></li>`).join("")}
        </ul>
      </section>
    </section>
    <div class="marquee" aria-hidden="true"><div class="marquee-track">${marqueeItem.repeat(6)}</div></div>
  </main>
  ${siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>` : ""}
  <noscript><p style="position:fixed;left:24px;bottom:64px;z-index:20">Black Friday Elle Jew: abre em ${when.short}.</p></noscript>
  <script>
    (() => {
      document.querySelectorAll("[data-split]").forEach((line, lineIndex) => {
        const text = line.textContent;
        line.textContent = "";
        [...text].forEach((letter, index) => {
          const span = document.createElement("span");
          span.className = "char";
          span.style.setProperty("--i", String(lineIndex * 5 + index));
          span.textContent = letter;
          line.appendChild(span);
        });
      });

      const target = Date.parse(${target});
      const nodes = ["days", "hours", "minutes", "seconds"].map((id) => document.getElementById(id));
      const bars = ["days", "hours", "minutes", "seconds"].map((id) => document.getElementById(id + "-bar"));
      const initialDays = Math.max(1, Math.ceil((target - Date.now()) / 86400000));
      const maxima = [initialDays, 24, 60, 60];
      const pad = (value) => String(value).padStart(2, "0");
      let released = false;
      const srText = document.getElementById("countdown-text");
      const plural = (value, one, many) => value + " " + (value === 1 ? one : many);
      const update = () => {
        const remaining = Math.max(0, target - Date.now());
        const total = Math.floor(remaining / 1000);
        const values = [Math.floor(total / 86400), Math.floor(total % 86400 / 3600), Math.floor(total % 3600 / 60), total % 60];
        values.forEach((value, index) => {
          bars[index].style.setProperty("--p", String(Math.min(1, value / maxima[index])));
          const node = nodes[index];
          const next = pad(value);
          if (node.textContent !== next) {
            node.textContent = next;
            node.classList.remove("tick");
            void node.offsetWidth;
            node.classList.add("tick");
          }
        });
        srText.textContent = remaining > 0
          ? "Faltam " + plural(values[0], "dia", "dias") + ", " + plural(values[1], "hora", "horas") + " e " + plural(values[2], "minuto", "minutos") + " para a Black Friday Elle Jew."
          : "A Black Friday Elle Jew abriu.";
        if (remaining === 0 && !released) {
          released = true;
          document.getElementById("lock").classList.add("open");
          document.body.classList.add("released");
          window.setTimeout(() => window.location.reload(), 1600);
        }
      };
      update();
      window.setInterval(update, 1000);

      const form = document.getElementById("notify");
      const openButton = document.getElementById("notify-open");
      const backButton = document.getElementById("notify-back");
      const turnstileBox = document.getElementById("turnstile-box");
      let turnstileToken = "";
      let turnstileWidget = null;
      const renderTurnstile = () => {
        if (!turnstileBox || turnstileWidget !== null) return;
        if (!window.turnstile) { window.setTimeout(renderTurnstile, 300); return; }
        turnstileWidget = window.turnstile.render(turnstileBox, {
          sitekey: turnstileBox.dataset.sitekey,
          action: "launch_waitlist",
          theme: "dark",
          size: "flexible",
          appearance: "interaction-only",
          callback: (token) => { turnstileToken = token; },
          "expired-callback": () => { turnstileToken = ""; },
          "error-callback": () => { turnstileToken = ""; },
        });
      };
      const openNotify = () => {
        document.body.classList.add("focus");
        form.hidden = false;
        openButton.setAttribute("aria-expanded", "true");
        renderTurnstile();
        window.scrollTo({ top: 0, behavior: "smooth" });
        window.setTimeout(() => document.getElementById("notify-email").focus({ preventScroll: true }), 50);
      };
      const closeNotify = () => {
        document.body.classList.remove("focus");
        form.hidden = true;
        openButton.setAttribute("aria-expanded", "false");
        openButton.focus();
      };
      const switchButtons = [...form.querySelectorAll("[data-channel]")];
      switchButtons.forEach((button) => button.addEventListener("click", () => {
        const channel = button.dataset.channel;
        switchButtons.forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        document.getElementById("panel-email").hidden = channel !== "email";
        document.getElementById("panel-whatsapp").hidden = channel !== "whatsapp";
        if (channel === "email") document.getElementById("notify-email").focus({ preventScroll: true });
      }));
      openButton.addEventListener("click", openNotify);
      backButton.addEventListener("click", closeNotify);
      document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !form.hidden) closeNotify(); });
      const emailInput = document.getElementById("notify-email");
      const consent = document.getElementById("notify-consent");
      const status = document.getElementById("notify-status");
      const submit = document.getElementById("notify-submit");
      const showStatus = (message, isError) => {
        status.textContent = message;
        status.classList.toggle("error", Boolean(isError));
      };
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const valid = email.length <= 254 && /^[^@ ]+@[^@ ]+[.][^@ .]{2,}$/.test(email);
        emailInput.setAttribute("aria-invalid", String(!valid));
        if (!valid) { showStatus("Digite um e-mail válido, como nome@email.com.", true); emailInput.focus(); return; }
        if (!consent.checked) { showStatus("Marque a autorização para receber o e-mail.", true); consent.focus(); return; }
        if (turnstileBox && !turnstileToken) { showStatus("Aguarde a verificação de segurança e tente de novo.", true); renderTurnstile(); return; }
        submit.disabled = true;
        showStatus("Enviando…", false);
        try {
          const response = await fetch("/api/launch-waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, consent: true, turnstileToken }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Não foi possível concluir agora. Tente novamente.");
          form.classList.add("done");
          backButton.textContent = "Voltar para a contagem";
          showStatus(data.message || "Pronto! Você será avisada por e-mail.", false);
        } catch (error) {
          showStatus(error.message, true);
          if (window.turnstile && turnstileWidget !== null) { window.turnstile.reset(turnstileWidget); turnstileToken = ""; }
        } finally {
          submit.disabled = false;
        }
      });

      // WCAG 2.2.2: animações contínuas podem ser pausadas (preferência salva no navegador).
      const toggle = document.getElementById("motion-toggle");
      const toggleLabel = document.getElementById("motion-label");
      let paused = false;
      let resume = () => {};
      const setPaused = (value) => {
        paused = value;
        document.body.classList.toggle("paused", value);
        const label = value ? "Retomar animações" : "Pausar animações";
        toggle.setAttribute("aria-pressed", String(value));
        toggle.setAttribute("aria-label", label);
        toggleLabel.textContent = label;
        try { localStorage.setItem("ellejew-motion-paused", value ? "1" : "0"); } catch (error) { /* armazenamento indisponível */ }
        if (!value) resume();
      };
      toggle.addEventListener("click", () => setPaused(!paused));
      let storedPause = false;
      try { storedPause = localStorage.getItem("ellejew-motion-paused") === "1"; } catch (error) { /* armazenamento indisponível */ }

      const canvas = document.getElementById("sparks");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) { toggle.hidden = true; return; }
      if (storedPause) setPaused(true);
      if (!canvas.getContext) return;
      const context = canvas.getContext("2d");
      let width = 0, height = 0, ratio = 1;
      const resize = () => {
        ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      };
      resize();
      window.addEventListener("resize", resize);
      const count = Math.round(Math.min(90, Math.max(36, width / 16)));
      const spawn = (fresh) => ({
        x: Math.random() * width,
        y: fresh ? height + 10 : Math.random() * height,
        size: Math.random() * 1.8 + .4,
        speed: Math.random() * .45 + .12,
        drift: (Math.random() - .5) * .3,
        phase: Math.random() * Math.PI * 2,
        star: Math.random() < .12,
      });
      const sparks = Array.from({ length: count }, () => spawn(false));
      const draw = (time) => {
        context.clearRect(0, 0, width, height);
        for (let index = 0; index < sparks.length; index += 1) {
          const spark = sparks[index];
          spark.y -= spark.speed;
          spark.x += spark.drift + Math.sin(time / 1600 + spark.phase) * .15;
          if (spark.y < -10) sparks[index] = spawn(true);
          const alpha = .25 + .75 * Math.abs(Math.sin(time / 900 + spark.phase));
          context.fillStyle = "rgba(241, 220, 168," + alpha.toFixed(3) + ")";
          if (spark.star) {
            const size = spark.size * 3.2 * alpha;
            context.beginPath();
            context.moveTo(spark.x, spark.y - size);
            context.quadraticCurveTo(spark.x, spark.y, spark.x + size, spark.y);
            context.quadraticCurveTo(spark.x, spark.y, spark.x, spark.y + size);
            context.quadraticCurveTo(spark.x, spark.y, spark.x - size, spark.y);
            context.quadraticCurveTo(spark.x, spark.y, spark.x, spark.y - size);
            context.fill();
          } else {
            context.beginPath();
            context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
            context.fill();
          }
        }
        if (!document.hidden && !paused) window.requestAnimationFrame(draw);
      };
      resume = () => window.requestAnimationFrame(draw);
      document.addEventListener("visibilitychange", () => { if (!document.hidden && !paused) window.requestAnimationFrame(draw); });
      if (!paused) window.requestAnimationFrame(draw);
    })();
  </script>
</body>
</html>`;

  return new Response(requestMethod === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    },
  });
}

export function renderPrelaunchRobots(requestMethod: string): Response {
  const body = "User-agent: *\nDisallow: /\n";
  return new Response(requestMethod === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    },
  });
}

export function renderPrelaunchUnavailable(launchAt: string, audience: LaunchAudience = "public"): Response {
  const retryAfter = Math.max(60, Math.ceil((Date.parse(launchAt) - Date.now()) / 1000));
  const when = launchParts(launchAt);
  return Response.json(
    { error: `A loja abre na Black Friday: ${when.short}${audience === "vip" ? " (acesso VIP)" : ""}.` },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": String(retryAfter),
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      },
    },
  );
}
