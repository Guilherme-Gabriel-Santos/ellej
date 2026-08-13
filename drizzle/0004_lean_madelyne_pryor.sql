CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_name` ON `categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_slug` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_categories_active_sort` ON `categories` (`active`,`sort_order`);--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `name`, `slug`, `active`, `sort_order`)
SELECT 'cat_' || lower(hex(randomblob(12))), `category`, lower(replace(`category`, ' ', '-')), 1,
  ROW_NUMBER() OVER (ORDER BY MIN(`created_at`), `category`)
FROM `products`
GROUP BY `category`;
