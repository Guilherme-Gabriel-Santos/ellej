# Elle Jew — loja e painel administrativo

Loja de joias construída para Cloudflare Workers, com:

- vitrine, busca, carrinho, favoritos e checkout;
- banco D1 para produtos, pedidos e clientes;
- bucket R2 para fotos cadastradas pelo painel;
- `/admin` com cadastro guiado de produtos, estoque e gestão de pedidos;
- login administrativo com senha e código de seis dígitos por e-mail;
- sessões protegidas, limite de tentativas e registro de alterações.

## Desenvolvimento

Requer Node.js 22 ou mais recente.

```bash
npm install
npm run dev
npm run build
```

Para testar o login localmente, copie `.dev.vars.example` para `.dev.vars`,
preencha os valores e execute `npm run dev`. O código de verificação aparece no
painel local quando o Resend ainda não está configurado; isso nunca acontece em
produção.

## Publicação

O roteiro completo está em [CLOUDFLARE.md](./CLOUDFLARE.md).

> O checkout atual registra o pedido e encaminha a cliente para as instruções de
> pagamento. A confirmação automática de Pix/cartão depende da futura conexão
> com Mercado Pago e do webhook de pagamento.
