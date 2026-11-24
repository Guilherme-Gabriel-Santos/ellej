INSERT OR IGNORE INTO categories (id, name, slug, parent_id, image, active, sort_order)
SELECT
  'cat_black_friday',
  'Black Friday',
  'black-friday',
  NULL,
  NULL,
  1,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE slug = 'black-friday'
);
