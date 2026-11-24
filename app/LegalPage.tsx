import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

type LegalSection = { title: string; content: ReactNode };

export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Voltar para a página inicial"><img src="/brand/logo.webp" alt="Elle Jew" /></Link>
        <nav aria-label="Páginas legais"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/entrega">Entrega</Link><Link href="/trocas-e-devolucoes">Trocas</Link></nav>
      </header>
      <section className={styles.hero}>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{intro}</span>
        <small>Última atualização: 8 de setembro de 2026</small>
      </section>
      <div className={styles.content}>
        <aside><strong>Elle Jew</strong><span>Joias e semijoias</span><a href="mailto:contato@ellejew.com.br">contato@ellejew.com.br</a><a href="https://wa.me/5516992939739">(16) 99293-9739</a><p>Ribeirão Preto, São Paulo</p></aside>
        <article>{sections.map((section, index) => <section key={section.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{section.title}</h2>{section.content}</div></section>)}</article>
      </div>
      <footer className={styles.footer}><Link href="/">← Voltar para a loja</Link><p>Em caso de dúvida, fale com a Elle Jew pelo WhatsApp ou e-mail.</p></footer>
    </main>
  );
}
