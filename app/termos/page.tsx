import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Termos da Loja | Elle Jew", description: "Condições de compra e uso da loja Elle Jew." };

export default function TermsPage() {
  return <LegalPage eyebrow="Condições de compra" title="Termos da Loja" intro="Ao comprar na Elle Jew, você concorda com estas condições. Nosso compromisso é apresentar preços, prazos e características com clareza." sections={[
    { title: "A loja e o atendimento", content: <><p>Elle Jew é o nome comercial utilizado nesta loja de joias e semijoias, com atendimento em Ribeirão Preto/SP pelo e-mail contato@ellejew.com.br e WhatsApp (16) 99293-9739.</p><p>Os dados fiscais do fornecedor constarão na documentação emitida para a venda.</p></> },
    { title: "Produtos e disponibilidade", content: <><p>As fotos buscam representar fielmente cada peça, mas pequenas diferenças de cor, proporção ou acabamento podem ocorrer por iluminação, tela e características artesanais.</p><p>A compra está sujeita à disponibilidade. Em caso de indisponibilidade após o pagamento, entraremos em contato para substituição, crédito ou reembolso integral.</p></> },
    { title: "Preços, cupons e pagamento", content: <><p>Preços, frete e descontos válidos são os apresentados na revisão do pedido. Cupons podem ter validade, compra mínima, limite de usos e produtos elegíveis, não sendo convertidos em dinheiro.</p><p>O pagamento é processado no ambiente do Asaas. O pedido somente é considerado pago depois da confirmação da transação.</p></> },
    { title: "Entrega", content: <><p>O prazo informado no checkout é uma estimativa em dias úteis após a confirmação do pagamento. A cliente deve fornecer endereço completo e correto. Reenvios causados por informação incorreta ou ausência podem gerar nova cobrança de frete.</p></> },
    { title: "Trocas, arrependimento e reembolso", content: <><p>Compras online podem ser canceladas em até 7 dias corridos após o recebimento, nos termos da legislação aplicável. Consulte a página de Trocas e Devoluções para instruções, condições e prazos.</p><p>Reembolsos aprovados são solicitados ao meio de pagamento utilizado e podem respeitar o prazo operacional da instituição financeira.</p></> },
    { title: "Garantia de 1 ano", content: <><p>As peças possuem garantia comercial total de 1 ano a partir do recebimento, já contemplando a garantia legal aplicável, para defeitos de fabricação.</p><p>A garantia não cobre desgaste natural, perda, quebra por impacto, mau uso, alteração por terceiros ou danos causados por produtos químicos e armazenamento inadequado.</p></> },
    { title: "Uso da loja", content: <><p>É proibido tentar acessar áreas restritas, interferir no funcionamento, automatizar compras abusivas ou utilizar conteúdo e imagens sem autorização. Casos não previstos serão tratados conforme a legislação brasileira.</p></> },
  ]} />;
}
