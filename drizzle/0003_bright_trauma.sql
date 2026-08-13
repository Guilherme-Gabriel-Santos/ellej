ALTER TABLE `orders` ADD `payment_provider` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_preference_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_checkout_url` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_updated_at` text;--> statement-breakpoint
CREATE INDEX `idx_orders_payment_preference_id` ON `orders` (`payment_preference_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_payment_id` ON `orders` (`payment_id`);