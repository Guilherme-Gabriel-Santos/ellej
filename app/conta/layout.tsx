import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Minha conta | Elle Jew",
  description: "Acesse sua conta e acompanhe seus pedidos Elle Jew.",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
