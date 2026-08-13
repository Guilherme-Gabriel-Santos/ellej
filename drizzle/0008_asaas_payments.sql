ALTER TABLE `orders` ADD `city_ibge_code` text;
--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`order_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payment_webhook_events_order` ON `payment_webhook_events` (`order_id`,`created_at`);
