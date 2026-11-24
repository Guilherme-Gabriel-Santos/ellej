# Auditoria de Segurança da Elle Jew

**Alvo:** https://ellejew.com.br  
**Data:** 2026-09-10  
**Escopo:** código, APIs, autenticação, banco D1, R2, pagamentos, segredos, Git, cabeçalhos e dependências.

## Resultado executivo

Nenhuma falha crítica foi encontrada. O checkout calcula produtos, descontos e frete no servidor; o webhook do Asaas exige autenticação e reconfirma o valor; as rotas administrativas exigem sessão; e pedidos de clientes são filtrados pela conta autenticada.

Durante esta revisão foram corrigidos quatro pontos:

- redirecionamento obrigatório de HTTP para HTTPS com status 308;
- bloqueio administrativo por 15 minutos após cinco senhas incorretas;
- custo de hash equivalente para e-mail administrativo inexistente;
- rejeição antecipada de uploads maiores que 80 MB.

Também foram atualizados `vinext`, Vite, Wrangler, o plugin da Cloudflare e SimpleWebAuthn. O conjunto efetivamente enviado para produção ficou com zero vulnerabilidades conhecidas no `npm audit --omit=dev`.

Em 2026-09-10, o Cloudflare Turnstile gerenciado também foi instalado no cadastro, login e início da recuperação de senha. O servidor valida o token com a API Siteverify e exige a ação e o hostname esperados antes de executar a operação protegida.

As correções foram publicadas no Worker em 2026-09-09. O redirecionamento e os cabeçalhos foram reconfirmados nos domínios raiz e `www`, e o segundo fator do painel foi fixado explicitamente como obrigatório.

## Matriz dos 20 itens

| # | Controle | Estado | Evidência |
|---|---|---|---|
| 1 | Esconder chaves de API | OK | Chaves estão em Secrets da Cloudflare e os nomes obrigatórios estão declarados em `wrangler.cloudflare.jsonc`. Valores não ficam em `vars` nem no frontend. |
| 2 | Limpar segredos do Git | OK | `.env`, `.env.production` e `.dev.vars` são ignorados, nunca foram versionados e a varredura de todos os commits não encontrou padrões de credenciais reais. |
| 3 | Usar chave pública do banco | N/A | O projeto usa Cloudflare D1 por binding interno do Worker. Não existe chave de banco no navegador. |
| 4 | Row-level security | Equivalente aplicado | D1 não oferece RLS como Supabase/Postgres. O Worker é a única camada de acesso e filtra pedidos por `customer_id` obtido da sessão. |
| 5 | Criptografar dados sensíveis | OK | D1 cifra automaticamente em repouso com AES-256-GCM e usa TLS em trânsito. Senhas e tokens de sessão nunca são armazenados em texto puro. |
| 6 | Forçar autenticação no servidor | OK | Checkout exige conta; mutações administrativas exigem sessão; webhook exige token; tarefas internas exigem segredo. |
| 7 | Travar acesso aos registros | OK | Conta só lê pedidos vinculados ao próprio `customer_id`; painel completo só é retornado ao administrador autenticado. |
| 8 | Bloquear adulteração de campos | OK | Preço, estoque, cupom, frete e total são recalculados no servidor. O valor recebido pelo Asaas é comparado com o total salvo. |
| 9 | Proteger cookies de sessão | OK | Cookies usam `HttpOnly`, `Secure`, `SameSite`, `Path=/` e expiração; o acesso VIP usa prefixo `__Host-`. |
| 10 | Fazer hash das senhas | OK | PBKDF2-SHA256, 100 mil iterações, salt aleatório de 128 bits e comparação em tempo constante. |
| 11 | Limitar tentativas de login | OK | Rate limit em D1, cinco falhas por conta com bloqueio de 15 minutos e limites adicionais por origem/desafio. |
| 12 | Proteção contra bots | IMPLEMENTADO | Cloudflare Turnstile gerenciado protege cadastro, login e recuperação. O servidor exige `success`, `action` esperado e hostname autorizado antes de executar cada ação. O teste humano em produção fica para a abertura VIP às 17h, sem furar o bloqueio de lançamento. |
| 13 | Parametrizar queries | OK | Acesso D1 usa `prepare(...).bind(...)`; listas dinâmicas geram apenas marcadores `?`, nunca concatenam valores. |
| 14 | Validar entradas | OK | Tipo e tamanho de JSON, e-mail, senha, CPF, telefone, CEP, datas, inteiros, IDs, quantidades e estados são validados no servidor. |
| 15 | Escapar conteúdo do usuário | OK | React faz o escape da interface; não há `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function`; XML, CSV e e-mails têm escape próprio. |
| 16 | Restringir uploads | OK | Apenas admin, com CSRF e rate limit; MIME permitido, assinatura mágica, UUID aleatório e limites de 8 MB para imagens ou 80 MB para banners/vídeos. |
| 17 | Enxugar respostas da API | OK | APIs de conta e painel usam `no-store`; respostas públicas não contêm segredos; conta recebe apenas seus dados e informações necessárias de pedidos. |
| 18 | Cabeçalhos de segurança | OK | CSP, HSTS, `DENY`, `nosniff`, Referrer Policy, Permissions Policy, COOP e bloqueio de políticas cross-domain. |
| 19 | Forçar HTTPS | OK | O Worker redireciona qualquer URL HTTP para HTTPS antes de processar rotas, além de HSTS e `upgrade-insecure-requests`. |
| 20 | Escanear dependências | OK com ressalva | Produção: 0 alertas. Árvore completa: 8 alertas apenas em ferramentas locais, descritos abaixo. |

## Ressalvas abertas

### Baixa: CSP ainda permite scripts inline

`script-src` mantém `'unsafe-inline'` por compatibilidade com o runtime atual e o Pixel da Meta. Não existe ponto conhecido de injeção de HTML no projeto, portanto isso é defesa em profundidade, não uma exploração ativa. A remoção segura exige nonce ou hashes gerados por resposta e deve ser tratada separadamente para não quebrar a loja.

### Baixa: oito alertas somente no ambiente de desenvolvimento

O `npm audit --omit=dev` retorna zero. A auditoria completa mantém quatro alertas altos e quatro moderados em duas cadeias:

- `miniflare` fixa `sharp@0.35.2`, enquanto a correção está em `0.35.4`;
- `drizzle-kit` carrega um `esbuild` legado pelo `@esbuild-kit/esm-loader`.

Eles não entram no bundle publicado nem processam entrada de clientes. Não foi usado `npm audit fix --force`, pois a solução sugerida pelo npm faria downgrades incompatíveis das ferramentas Cloudflare/Drizzle. Devem ser revistos quando os pacotes diretos publicarem a atualização transitiva.

### Informativa: segredos antigos

O Worker ainda possui o nome `MERCADO_PAGO_ACCESS_TOKEN`, embora o checkout atual use somente Asaas. Remover esse segredo é recomendado depois de confirmar que não será necessário para rollback. `ADMIN_SETUP_KEY` também pode ser removido após documentar um procedimento de recuperação, embora a API já recuse novo setup quando existe administrador.

## Verificações executadas

- build completo e 32 testes automatizados;
- TypeScript sem erros;
- ESLint sem erros;
- pacote do Worker validado com `wrangler deploy --dry-run`;
- D1 remoto sem migrações pendentes;
- teste de CSRF ausente e origem falsa;
- teste de JSON malformado sem vazamento do parser;
- webhook Asaas sem token retornando 401;
- tentativa de travessia de diretório em mídia retornando 404;
- varredura da árvore atual e de todos os commits por padrões de segredos;
- conferência dos nomes de Secrets configurados na Cloudflare;
- widget Turnstile em modo gerenciado, com domínios raiz, `www` e desenvolvimento cadastrados;
- chave privada Turnstile confirmada como Secret criptografado e bindings públicos confirmados após o deploy;
- CSP de produção confirmada com as origens necessárias do Turnstile;
- auditoria npm completa e apenas de produção.

## Referências técnicas

- Cloudflare D1, segurança dos dados: https://developers.cloudflare.com/d1/reference/data-security/
- Cloudflare Workers, Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Turnstile, validação no servidor: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
