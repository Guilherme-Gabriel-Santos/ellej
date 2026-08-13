CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_product_categories_category_product` ON `product_categories` (`category_id`,`product_id`);--> statement-breakpoint
DROP INDEX `idx_categories_name`;--> statement-breakpoint
ALTER TABLE `categories` ADD `parent_id` text;--> statement-breakpoint
CREATE INDEX `idx_categories_parent_active_sort` ON `categories` (`parent_id`,`active`,`sort_order`);