ALTER TABLE `products` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `products`
SET `sort_order` = (
  SELECT COUNT(*)
  FROM `products` AS `earlier`
  WHERE `earlier`.`created_at` < `products`.`created_at`
     OR (`earlier`.`created_at` = `products`.`created_at` AND `earlier`.`id` <= `products`.`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_products_storefront_sort` ON `products` (`active`,`visibility`,`sort_order`);
