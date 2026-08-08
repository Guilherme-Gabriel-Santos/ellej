# Publicar a Elle Jew na Cloudflare

O projeto usa quatro peças: **Workers** para o site, **D1** para o banco,
**R2** para as fotos e **Resend** para enviar o código de acesso do painel.

## 1. Preparar as contas

1. Crie uma conta na Cloudflare e confirme o e-mail.
2. Instale o Node.js 22 ou mais recente no computador que fará a publicação.
3. Crie uma conta na Resend.
4. Na Resend, adicione `auth.ellejew.com.br` em **Domains** e copie para o DNS
   da Cloudflare os registros SPF e DKIM mostrados. Aguarde o status **Verified**.
5. Na Resend, crie uma API key com permissão de envio.

Não altere o DNS principal de `ellejew.com.br` antes de testar o novo site. Se o
domínio ainda não estiver na Cloudflare, copie primeiro todos os registros DNS
atuais, principalmente MX/TXT de e-mail.

## 2. Entrar na Cloudflare pelo terminal

Abra o PowerShell dentro da pasta do projeto e execute:

```powershell
npm install
npx wrangler login
```

O navegador abrirá para autorizar a conta Cloudflare.

## 3. Criar banco e armazenamento de fotos

```powershell
npx wrangler d1 create elle-jew-db
npx wrangler r2 bucket create elle-jew-media
```

O primeiro comando mostra um `database_id`. Abra `wrangler.cloudflare.jsonc` e substitua
`00000000-0000-4000-8000-000000000000` por esse identificador, sem alterar o
binding `DB`.

## 4. Preparar os segredos

Gere duas chaves aleatórias:

```powershell
npm run auth:secrets
```

Copie `.dev.vars.example` para `.env.production`:

```powershell
Copy-Item .dev.vars.example .env.production
```

Edite `.env.production` e preencha:

```dotenv
AUTH_SECRET=resultado_AUTH_SECRET
ADMIN_SETUP_KEY=resultado_ADMIN_SETUP_KEY
RESEND_API_KEY=re_sua_chave_da_resend
ADMIN_FROM_EMAIL="Elle Jew <acesso@auth.ellejew.com.br>"
```

Guarde `ADMIN_SETUP_KEY` no gerenciador de senhas. O arquivo
`.env.production` é ignorado pelo Git e não deve ser enviado a ninguém.

## 5. Criar as tabelas e publicar

```powershell
npm run cf:migrate
npm run cf:deploy
```

Ao final, a Cloudflare mostra um endereço parecido com:
`https://elle-jew-loja.seu-subdominio.workers.dev`.

## 6. Ativar o painel

1. Abra `https://SEU-ENDERECO.workers.dev/admin`.
2. Informe o e-mail da administradora.
3. Crie uma senha com pelo menos 12 caracteres, letras e números.
4. Cole a `ADMIN_SETUP_KEY`.
5. Faça login; o código de seis dígitos chegará no e-mail informado.

Depois da ativação, remova `ADMIN_SETUP_KEY` do arquivo `.env.production` e da
Cloudflare:

```powershell
npx wrangler secret delete ADMIN_SETUP_KEY --config wrangler.cloudflare.jsonc
```

A ausência dessa chave não afeta o login já criado e impede uma nova ativação.

## 7. Ligar o domínio sem derrubar o site atual

1. Primeiro teste tudo no endereço `workers.dev`.
2. No painel da Cloudflare, entre em **Workers & Pages** e abra
   `elle-jew-loja`.
3. Acesse **Settings > Domains & Routes > Add > Custom Domain**.
4. Para um último teste, use `loja.ellejew.com.br`.
5. Quando estiver aprovado, adicione `ellejew.com.br` e depois
   `www.ellejew.com.br`.

A Cloudflare cria o DNS e o certificado HTTPS. Antes de apontar o domínio
principal, confirme que pedidos, painel, envio do código e fotos estão funcionando.

## Atualizações futuras

Quando houver mudança no site:

```powershell
npm run cf:migrate
npm run cf:deploy
```

`cf:migrate` só aplica migrações ainda não executadas. Depois que a
`ADMIN_SETUP_KEY` for removida, mantenha-a também fora de `.env.production` para
que ela não seja enviada novamente.
