import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elle Jew | Joias em Prata 925 de Luxo",
  description:
    "Joias em Prata 925 com design de alta joalheria. Rivieras, moissanites e peças criadas para eternizar elegância.",
  openGraph: {
    title: "Elle Jew | Você é a ocasião",
    description: "Joias em Prata 925 com design de alta joalheria e presença inesquecível.",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary",
    title: "Elle Jew | Você é a ocasião",
    description: "Joias em Prata 925 com design de alta joalheria.",
  },
  icons: {
    icon: "/brand/logo.webp",
    shortcut: "/brand/logo.webp",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

