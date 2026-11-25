import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Política de Entrega | Elle Jew", description: "Prazos, frete e acompanhamento das entregas Elle Jew." };

export default function ShippingPage() {
  return <LegalPage eyebrow="Do nosso cuidado até você" title="Política de Entrega" intro="Veja como calculamos, preparamos e acompanhamos a entrega do seu pedido." sections={[
    { title: "Cálculo do frete", content: <><p>O valor e as modalidades disponíveis são apresentados no checkout conforme CEP, dimensões, peso e campanha vigente. O valor confirmado na revisão do pedido é o que será cobrado.</p><p>Cupons podem conceder frete grátis e alguns produtos também podem possuir essa condição.</p></> },
    { title: "Prazo de postagem", content: <><p>O envio é feito em até 3 dias úteis após a confirmação do pagamento. Nesse período, cada peça é separada, conferida e embalada antes da postagem. Se houver prazo especial de produção, ele será informado na página do produto ou no atendimento.</p></> },
    { title: "Prazo de transporte", content: <><p>O prazo mostrado no checkout é uma estimativa em dias úteis fornecida pelo serviço de entrega e começa após a postagem. Finais de semana, feriados, áreas com restrição e eventos externos podem alterar a previsão.</p></> },
    { title: "Rastreamento", content: <><p>Quando disponível, o código de rastreio será associado ao pedido. Nossa equipe também pode informar o andamento pelo WhatsApp mediante confirmação dos dados da compra.</p></> },
    { title: "Endereço e tentativas", content: <><p>Confira CEP, rua, número e complemento antes do pagamento. Se o pedido retornar por endereço incorreto, ausência ou recusa sem exercício regular do direito de arrependimento, um novo frete poderá ser cobrado.</p></> },
    { title: "Atraso, avaria ou extravio", content: <><p>Se a entrega ultrapassar a previsão de forma relevante, chegar violada ou apresentar indício de avaria, fale conosco imediatamente. Abriremos a ocorrência com a transportadora e apresentaremos solução adequada, incluindo reenvio ou reembolso quando cabível.</p></> },
  ]} />;
}
