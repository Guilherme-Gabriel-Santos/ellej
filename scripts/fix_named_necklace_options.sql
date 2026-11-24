UPDATE products
SET
  name = 'Colar Nome Personalizado Moissanite e Prata 925 - 2-10 letras',
  variants = '[]',
  multi_options_enabled = 1,
  option_groups = '[{"id":"grp_banho","name":"Banho","options":[{"id":"opt_ouro_branco","label":"Ouro Branco • Pingente e Corrente Ouro Branco","addedPriceCents":0,"active":true},{"id":"opt_mix_banhos","label":"Mix de Banhos • Pingente Ouro Branco e Corrente Ouro Amarelo 18k","addedPriceCents":0,"active":true},{"id":"opt_ouro_amarelo","label":"Ouro Amarelo • Pingente e Corrente Ouro Amarelo 18k","addedPriceCents":0,"active":true}]},{"id":"grp_letras","name":"Quantidade de letras","options":[{"id":"opt_2_6_letras","label":"2 a 6 letras","addedPriceCents":0,"active":true},{"id":"opt_7_10_letras","label":"7 a 10 letras","addedPriceCents":10000,"active":true}]}]',
  personalization_max_chars = 10
WHERE id = 'prd_4d4ce2e4-4df6-44c9-9b64-433e14067182'
  AND multi_options_enabled = 0
  AND personalization_enabled = 1
  AND price_cents = 138000
  AND json_array_length(variants) = 5
  AND json_extract(variants, '$[0].size') = 'Ouro Branco'
  AND json_extract(variants, '$[1].size') = 'Mix de Banhos'
  AND json_extract(variants, '$[2].size') = 'Ouro Amarelo'
  AND json_extract(variants, '$[3].size') = '2-6 Letras'
  AND json_extract(variants, '$[4].size') = '7-10 Letras';
