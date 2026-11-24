ALTER TABLE products ADD COLUMN personalization_enabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN personalization_max_chars INTEGER NOT NULL DEFAULT 20;
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN personalization_text TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE cart_items_personalization_new (
  visitor_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL DEFAULT '',
  personalization_text TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (visitor_id, product_id, variant_id, personalization_text)
);
--> statement-breakpoint
INSERT INTO cart_items_personalization_new (visitor_id, product_id, variant_id, personalization_text, quantity, updated_at)
SELECT visitor_id, product_id, variant_id, '', quantity, updated_at FROM cart_items;
--> statement-breakpoint
DROP TABLE cart_items;
--> statement-breakpoint
ALTER TABLE cart_items_personalization_new RENAME TO cart_items;
--> statement-breakpoint
CREATE INDEX idx_cart_items_visitor_id ON cart_items(visitor_id);
