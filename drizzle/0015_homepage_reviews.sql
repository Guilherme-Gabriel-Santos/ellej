CREATE TABLE `homepage_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`rating` integer DEFAULT 5 NOT NULL,
	`body` text NOT NULL,
	`product_name` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_homepage_reviews_active_sort` ON `homepage_reviews` (`active`,`sort_order`);
