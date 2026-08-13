INSERT INTO categories (id, name, slug, parent_id, active, sort_order) VALUES
  ('cat_lumiere', 'Coleção Lumière', 'colecao-lumiere', NULL, 1, 1),
  ('cat_prata_925', 'Prata 925', 'prata-925', NULL, 1, 2),
  ('cat_rodio', 'Ródio', 'rodio', NULL, 1, 3),
  ('cat_semijoias_ouro18k', 'Semi-joias folheadas a ouro 18k', 'semi-joias-folheadas-a-ouro-18k', NULL, 1, 4),
  ('cat_lumiere_aneis', 'Anéis', 'colecao-lumiere-aneis', 'cat_lumiere', 1, 10),
  ('cat_lumiere_brincos', 'Brincos', 'colecao-lumiere-brincos', 'cat_lumiere', 1, 11),
  ('cat_lumiere_colares', 'Colares', 'colecao-lumiere-colares', 'cat_lumiere', 1, 12),
  ('cat_lumiere_piercing', 'Piercing', 'colecao-lumiere-piercing', 'cat_lumiere', 1, 13),
  ('cat_lumiere_pulseiras', 'Pulseiras', 'colecao-lumiere-pulseiras', 'cat_lumiere', 1, 14),
  ('cat_lumiere_rivieiras', 'Rivieiras', 'colecao-lumiere-rivieiras', 'cat_lumiere', 1, 15),
  ('cat_prata_aliancas', 'Alianças', 'prata-925-aliancas', 'cat_prata_925', 1, 20),
  ('cat_prata_aneis', 'Anéis', 'prata-925-aneis', 'cat_prata_925', 1, 21),
  ('cat_prata_brincos', 'Brincos', 'prata-925-brincos', 'cat_prata_925', 1, 22),
  ('cat_prata_colares', 'Colares', 'prata-925-colares', 'cat_prata_925', 1, 23),
  ('cat_prata_moissanite', 'Moissanite', 'prata-925-moissanite', 'cat_prata_925', 1, 24),
  ('cat_prata_pulseiras', 'Pulseiras', 'prata-925-pulseiras', 'cat_prata_925', 1, 25),
  ('cat_rodio_aliancas', 'Alianças', 'rodio-aliancas', 'cat_rodio', 1, 30),
  ('cat_rodio_aneis', 'Anéis', 'rodio-aneis', 'cat_rodio', 1, 31),
  ('cat_rodio_brincos', 'Brincos', 'rodio-brincos', 'cat_rodio', 1, 32),
  ('cat_rodio_colares', 'Colares', 'rodio-colares', 'cat_rodio', 1, 33),
  ('cat_rodio_pulseiras', 'Pulseiras', 'rodio-pulseiras', 'cat_rodio', 1, 34),
  ('cat_semijoias_aliancas', 'Alianças', 'semi-joias-ouro-18k-aliancas', 'cat_semijoias_ouro18k', 1, 40),
  ('cat_semijoias_aneis', 'Anéis', 'semi-joias-ouro-18k-aneis', 'cat_semijoias_ouro18k', 1, 41),
  ('cat_semijoias_brincos', 'Brincos', 'semi-joias-ouro-18k-brincos', 'cat_semijoias_ouro18k', 1, 42),
  ('cat_semijoias_colares', 'Colares', 'semi-joias-ouro-18k-colares', 'cat_semijoias_ouro18k', 1, 43),
  ('cat_semijoias_pulseiras', 'Pulseiras', 'semi-joias-ouro-18k-pulseiras', 'cat_semijoias_ouro18k', 1, 44)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, parent_id = excluded.parent_id, active = 1, sort_order = excluded.sort_order;

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_prata_brincos' FROM products WHERE slug IN (
  'argola-cravejada-2r8mk', 'brinco-coracao-rmoo3', 'brinco-esmeralda-1ul1u',
  'brinco-gota-azul-sky-1qwa0', 'brinco-oval-aurora-moissanite-93mwm',
  'brinco-ponto-luz-5mm-axylv', 'brinco-rosa-moissanite-zjcr5',
  'brincos-com-pedra-central-redonda-g2vy3', 'brinco-solitario-8mm-1ihwn',
  'brinco-trio-gotas-moissanite-1p2b0', 'colar-trevo-moissanite-pibgu',
  'piercing-ear-cuff-6dvzw'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_prata_colares' FROM products WHERE slug IN (
  'chocker-5-coracoes', 'colar-gota-illusion-moissanite-plm63',
  'colar-gota-turmalina-2xbkp', 'colar-manu-176mm', 'colar-ponto-luz-o20k0',
  'colar-riviera-chloe', 'colar-riviera-jade'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_prata_moissanite' FROM products WHERE slug IN (
  'brinco-glam-moissanite-v47tt', 'brinco-gota-illusion-moissanite-5cv32',
  'brinco-oval-aurora-moissanite-93mwm', 'brinco-ponto-luz-8mm-moissanite-vykct',
  'brinco-rosa-moissanite-zjcr5', 'brincos-com-pedra-central-redonda-g2vy3',
  'brinco-trio-gotas-moissanite-1p2b0', 'colar-gota-illusion-moissanite-plm63',
  'colar-ponto-luz-8mm-moissanite-15td9', 'colar-trevo-moissanite-pibgu'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_rodio_brincos' FROM products WHERE slug IN (
  'brinco-glam-moissanite-v47tt', 'brincos-oval-kunzita-f0udr',
  'conjunto-ametista-v4y9f', 'jew-com-brwww-ellejew-b'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_rodio_colares' FROM products WHERE slug IN (
  'conjunto-ametista-v4y9f', 'jew-com-brwww-ellejew-b',
  'www-ellejew-com-br', 'www-ellejew-com-br1'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_semijoias_brincos' FROM products WHERE slug IN (
  'brinco-gota-illusion-moissanite-5cv32', 'ear-cuff-medio'
);

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT id, 'cat_semijoias_pulseiras' FROM products WHERE slug = 'pulseira-trevo-dourado';

INSERT INTO admin_audit_logs (user_id, action, entity_type, details)
SELECT id, 'catalog.categories_imported', 'category', '{"source":"ellejew.com.br","categories":26}'
FROM admin_users ORDER BY created_at LIMIT 1;
