# Checklist de lancamento - Elle Jew

Atualizado em 8 de setembro de 2026.

## Pronto e publicado

- [x] Loja, painel administrativo, conta do cliente, carrinho e checkout no Cloudflare Workers.
- [x] Banco D1 e todas as migracoes aplicadas em producao.
- [x] Integracoes com Asaas e SuperFrete protegidas por segredos no Cloudflare.
- [x] Confirmacao de pagamento somente por webhook autenticado do Asaas.
- [x] E-mails transacionais de pedido recebido, pagamento confirmado, envio e cancelamento.
- [x] Dominio de envio `send.ellejew.com.br` verificado no Resend.
- [x] E-mail real de teste aceito pelo provedor.
- [x] Reprocessamento automatico de notificacoes a cada 10 minutos.
- [x] Consentimento de marketing antes de carregar o Meta Pixel.
- [x] Eventos de vitrine, produto, carrinho e inicio do checkout preparados para a Meta.
- [x] Feed de produtos para catalogo da Meta disponivel em `/api/catalog/meta.csv`.
- [x] SEO tecnico: canonical, Open Graph, JSON-LD, `robots.txt` e `sitemap.xml`.
- [x] Painel administrativo bloqueado para indexacao por buscadores.
- [x] Politica de privacidade atualizada com medicao opcional da Meta.
- [x] Testes automatizados, TypeScript, lint e validacao de deploy aprovados.

Versao publicada: `12c789f6-0c94-436f-bbac-40b714f37add`.

## Antes de trocar o dominio

- [ ] Informar razao social ou nome empresarial, CPF/CNPJ e endereco comercial completo.
- [ ] Inserir esses dados nas paginas legais antes do anuncio oficial.
- [ ] Confirmar com a contabilidade o regime fiscal e o emissor de nota fiscal.
- [ ] Fazer uma compra real de baixo valor e conferir pagamento, e-mail, pedido e etiqueta.
- [ ] Copiar todos os registros DNS atuais antes de mudar os servidores DNS.
- [x] Registros DNS publicos salvos em `DNS-BACKUP-2026-09-08.md`.
- [ ] Manter os registros MX da Zoho e os registros DKIM existentes.
- [ ] Remover o registro SPF duplicado e manter apenas um SPF consolidado.
- [ ] Criar um registro DMARC inicialmente em modo de monitoramento.
- [ ] Apontar `ellejew.com.br` e `www.ellejew.com.br` para o Worker.
- [ ] Trocar `PUBLIC_SITE_URL` para `https://ellejew.com.br` e publicar novamente.
- [ ] Repetir os testes de compra, login, e-mail e frete no dominio oficial.

O dominio principal ainda aponta para a Nuvemshop. Nao deve ser alterado antes de
copiar e revisar todos os registros de e-mail, pois uma troca incompleta pode
interromper tanto a loja antiga quanto o recebimento de mensagens.

## Meta e Instagram - fazer por ultimo

- [x] Sair da conta Meta incorreta e entrar na conta empresarial correta.
- [x] Confirmar a propriedade do Instagram `@ellejew_` e da Pagina vinculada.
- [x] Confirmar que o Business Manager correto possui o Pixel `1585923988916315`.
- [x] Selecionar o catalogo atual sem excluir a fonte da Nuvemshop.
- [x] Configurar o feed usando `https://www.ellejew.com.br/api/catalog/meta.csv`, mantendo a programacao pausada ate a troca do dominio.
- [ ] Aguardar a analise dos produtos e corrigir eventuais rejeicoes.
- [x] Confirmar que o catalogo atual esta vinculado ao Instagram Shop.
- [x] Gerar um token da Conversions API e definir a Graph API `v26.0`.
- [x] Cadastrar `META_CAPI_ACCESS_TOKEN` como segredo e `META_GRAPH_API_VERSION` como variavel do Worker.
- [ ] Testar os eventos no Gerenciador de Eventos antes de anunciar.

O feed do site oficial permanece pausado para nao duplicar os produtos da Nuvemshop
nem publicar links quebrados antes da troca do dominio. A atualizacao pendente da
Instagram Shop nao deve ser publicada antes da validacao do novo feed.

## Nota fiscal

A emissao fiscal depende dos dados da empresa, do regime tributario e das
credenciais do emissor escolhido. Depois dessa definicao, a automacao pode ser
ligada ao evento de pagamento confirmado sem expor dados do cartao.
