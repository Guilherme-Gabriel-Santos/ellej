# Elle Jew — loja e painel administrativo

Loja de joias construída para Cloudflare Workers, com:

- vitrine, busca, carrinho, favoritos e checkout;
- banco D1 para produtos, pedidos e clientes;
- bucket R2 para fotos cadastradas pelo painel;
- `/admin` com cadastro guiado de produtos, estoque e gestão de pedidos;
- painel instalável no iPhone, com login por senha/código ou Face ID após o cadastro da passkey;
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

> O checkout usa a página hospedada do Asaas para Pix e cartão. O retorno da página de
> pagamento é apenas informativo; a aprovação e a atualização do pedido são
> confirmadas pelo webhook autenticado do Asaas.
