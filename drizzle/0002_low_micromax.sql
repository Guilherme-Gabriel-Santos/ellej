CREATE TABLE `request_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_request_rate_limits_expires_at` ON `request_rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_committed` integer DEFAULT false NOT NULL;