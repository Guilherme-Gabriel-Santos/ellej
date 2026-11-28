import { Storefront } from "./Storefront";

// Tema Black Friday da página inicial: some sozinho depois de 30/11 23h59 (horário de Brasília).
const BLACK_FRIDAY_THEME_ENDS_AT = Date.parse("2026-12-01T02:59:59Z");

type HomeProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined> };

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const initialCategory = params?.categoria === "todos" ? "Todos" : "Destaques";
  const blackFridayHome = Date.now() <= BLACK_FRIDAY_THEME_ENDS_AT;
  return <Storefront initialCategory={initialCategory} blackFridayHome={blackFridayHome} />;
}
