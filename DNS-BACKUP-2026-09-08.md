# Backup DNS de ellejew.com.br

Consulta publica realizada em 8 de setembro de 2026, antes da migracao para a
Cloudflare. TTL observado: 3600 segundos, salvo quando indicado pelo provedor.

## Registros que precisam ser preservados

| Nome | Tipo | Prioridade | Valor |
| --- | --- | ---: | --- |
| `@` | MX | 10 | `mx.zoho.com` |
| `@` | MX | 20 | `mx2.zoho.com` |
| `@` | MX | 50 | `mx3.zoho.com` |
| `@` | TXT |  | `zoho-verification=zb63563493.zmverify.zoho.com` |
| `@` | TXT |  | `v=spf1 include:zohomail.com include:_spf.mail.hostinger.com ~all` |
| `zmail._domainkey` | TXT |  | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCfJMlZYSXclwSaVO3SXa8T7qluLP17oIPC0h27r2OiFj4RzbfcCitWbpuuRR3QLgPvdSNeA0G0NaY1HjutSvhg8yGDhVzu1+b3gca9j5vY5gOsGWdG99nX3Ru5MGQT6HAk8KhxVmxUYZIsNZYnhsFXoj+tjrjFNIQRuzCjjOTzcQIDAQAB` |
| `resend._domainkey.send` | TXT |  | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGwfhtSV2igvi0FJVL1AjGGWXwTktEBXDgzl5HICu9t2nYHSMPtxo3f3oxX2xNYmy9yLMnYo6Zkvht0Ry0kh0HpSBgLtKh4qx4D2bgnu6z9vgYQPjULNOdyAJv+NGP31CJFz9QETF6jKJukqrAxHVUskR+qT9MwEn4IZbtrNQ5+wIDAQAB` |
| `send.send` | MX | 10 | `feedback-smtp.us-east-1.amazonses.com` |
| `send.send` | TXT |  | `v=spf1 include:amazonses.com ~all` |

## Registros atuais da loja antiga

Estes registros apontam para a Nuvemshop e devem ser substituidos somente quando
o Worker estiver pronto para receber o dominio:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `@` | A | `185.133.35.21` |
| `@` | A | `185.133.35.22` |
| `www` | CNAME | `ellejew.lojavirtualnuvem.com.br` |

Servidores DNS atuais no Registro.br:

- `a.sec.dns.br`
- `c.sec.dns.br`

Servidores DNS atribuidos pela Cloudflare:

- `cash.ns.cloudflare.com`
- `rita.ns.cloudflare.com`

## DNSSEC

O dominio possui um registro DS ativo antes da migracao (KeyTag `48871`,
algoritmo `13`, digest `2`). O DNSSEC precisa ser desativado no Registro.br antes
da troca dos nameservers. Depois que a zona estiver ativa na Cloudflare, ele deve
ser reativado usando os dados fornecidos pela propria Cloudflare.

## Correcao necessaria

Existem dois registros SPF no dominio raiz. Isso e invalido para SPF e pode
prejudicar a entrega de e-mails. Na Cloudflare, manter apenas:

`v=spf1 include:zohomail.com include:_spf.mail.hostinger.com ~all`

Nao copiar o registro duplicado:

`v=spf1 include:_spf.mail.hostinger.com ~all`

O dominio tambem nao possui `_dmarc`. Depois da migracao, iniciar com uma politica
de monitoramento antes de aplicar rejeicao ou quarentena.

## Limite deste backup

DNS publico nao permite enumerar nomes desconhecidos. A importacao automatica da
Cloudflare deve ser comparada com este arquivo e com o painel atual do Registro.br
antes da troca dos servidores DNS.
