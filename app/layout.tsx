import type { Metadata } from "next";
import { MarketingConsent } from "./MarketingConsent";
import "./globals.css";
import "./motion.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ellejew.com.br"),
  title: "Elle Jew | Joias em Prata 925 de Luxo",
  description:
    "Joias em Prata 925 com design de alta joalheria. Rivieras, moissanites e peças criadas para eternizar elegância.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Elle Jew | Você é a ocasião",
    description: "Joias em Prata 925 com design de alta joalheria e presença inesquecível.",
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Elle Jew",
    images: [{ url: "/brand/hero.webp", width: 1440, height: 2160, alt: "Joias Elle Jew em Prata 925" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Elle Jew | Você é a ocasião",
    description: "Joias em Prata 925 com design de alta joalheria.",
    images: ["/brand/hero.webp"],
  },
  icons: {
    icon: "/brand/logo.webp",
    shortcut: "/brand/logo.webp",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: "Elle Jew",
    url: "https://ellejew.com.br",
    logo: "https://ellejew.com.br/brand/logo.webp",
    email: "contato@ellejew.com.br",
    telephone: "+55 16 99293-9739",
    sameAs: ["https://www.instagram.com/ellejew_/"],
    address: { "@type": "PostalAddress", addressLocality: "Ribeirão Preto", addressRegion: "SP", addressCountry: "BR" },
  };
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400..600;1,400..600&family=Jost:wght@300..700&family=Parisienne&display=swap"
          rel="stylesheet"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </head>
      <body>{children}<MarketingConsent /></body>
    </html>
  );
}

