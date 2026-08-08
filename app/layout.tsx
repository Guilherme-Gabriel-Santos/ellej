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
      <body>{children}</body>
    </html>
  );
}
