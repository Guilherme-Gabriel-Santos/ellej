import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = { title: "Trocas e Devoluções | Elle Jew", description: "Regras de troca, devolução, arrependimento e garantia Elle Jew." };

export default function ReturnsPage() {
  return <LegalPage eyebrow="Atendimento pós-compra" title="Trocas e Devoluções" intro="Queremos que sua experiência continue cuidadosa depois da entrega. Veja os prazos e como solicitar atendimento." sections={[
    { title: "Como solicitar", content: <><p>Envie o número do pedido, nome da compradora, motivo e fotos quando houver defeito para contato@ellejew.com.br ou WhatsApp (16) 99293-9739. Responderemos com as orientações de envio.</p><p>Não envie produtos sem autorização e instruções da equipe.</p></> },
    { title: "Arrependimento em 7 dias", content: <><p>Em compras feitas pela internet, você pode desistir em até 7 dias corridos contados do recebimento. A peça deve ser devolvida com acessórios, certificado, embalagem e sem sinais de uso além da verificação necessária.</p><p>Após o recebimento e conferência, será solicitado o reembolso integral, inclusive do frete originalmente pago, conforme a legislação.</p></> },
    { title: "Troca por preferência", content: <><p>Pedidos de troca por tamanho, modelo ou preferência devem ser comunicados em até 7 dias corridos do recebimento. Fora do direito de arrependimento, eventuais custos de reenvio serão informados antes da conclusão.</p><p>O novo produto depende de disponibilidade. Diferenças de preço serão acertadas antes do envio.</p></> },
    { title: "Defeito e garantia de 1 ano", content: <><p>A garantia comercial total é de 1 ano a partir do recebimento e cobre defeitos de fabricação, já contemplando a garantia legal aplicável.</p><p>Após a análise, a Elle Jew poderá reparar, substituir ou reembolsar, conforme o caso e os prazos legais. A análise não reduz direitos previstos no Código de Defesa do Consumidor.</p></> },
    { title: "O que a garantia não cobre", content: <ul><li>Desgaste natural, riscos e oxidação decorrentes de uso ou armazenamento.</li><li>Quebra, amassado, perda de pedras ou peças por impacto e tração.</li><li>Contato inadequado com perfumes, cosméticos, cloro e produtos químicos.</li><li>Alteração, ajuste ou reparo feito por terceiros.</li><li>Perda, furto ou uso diferente da finalidade da peça.</li></ul> },
    { title: "Reembolso", content: <><p>O reembolso será solicitado pelo mesmo meio de pagamento sempre que possível. O prazo de visualização depende do Asaas, do banco ou da administradora do cartão.</p><p>Em caso de devolução parcial de pedido com desconto, o valor será recalculado conforme as condições do cupom utilizado.</p></> },
  ]} />;
}
