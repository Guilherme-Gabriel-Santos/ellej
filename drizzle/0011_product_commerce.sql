ALTER TABLE `products` ADD COLUMN `catalog_data` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `variants` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `visibility` text NOT NULL DEFAULT 'visible';
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `track_stock` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `price_visible` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `free_shipping` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `cart_items_new` (
  `visitor_id` text NOT NULL,
  `product_id` text NOT NULL,
  `variant_id` text NOT NULL DEFAULT '',
  `quantity` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`visitor_id`, `product_id`, `variant_id`)
);
--> statement-breakpoint
INSERT INTO `cart_items_new` (`visitor_id`, `product_id`, `variant_id`, `quantity`, `updated_at`)
SELECT `visitor_id`, `product_id`, '', `quantity`, `updated_at` FROM `cart_items`;
--> statement-breakpoint
DROP TABLE `cart_items`;
--> statement-breakpoint
ALTER TABLE `cart_items_new` RENAME TO `cart_items`;
--> statement-breakpoint
CREATE INDEX `idx_cart_items_visitor_id` ON `cart_items` (`visitor_id`);
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `variant_id` text;
--> statement-breakpoint
ALTER TABLE `order_items` ADD COLUMN `variant_label` text;
