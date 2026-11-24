CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`free_shipping` integer DEFAULT 0 NOT NULL,
	`applies_to` text DEFAULT 'all' NOT NULL,
	`minimum_subtotal_cents` integer DEFAULT 0 NOT NULL,
	`maximum_discount_cents` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coupons_code` ON `coupons` (`code`);
--> statement-breakpoint
CREATE INDEX `idx_coupons_active_dates` ON `coupons` (`active`,`starts_at`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `coupon_products` (
	`coupon_id` text NOT NULL,
	`product_id` text NOT NULL,
	PRIMARY KEY(`coupon_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_coupon_products_product` ON `coupon_products` (`product_id`,`coupon_id`);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`coupon_id` text NOT NULL,
	`order_id` text NOT NULL,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`coupon_id`, `order_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coupon_redemptions_order` ON `coupon_redemptions` (`order_id`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_code` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_discount_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_discount_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `products` SET
	`description` = replace(replace(replace(replace(`description`, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano'),
	`material` = replace(replace(replace(replace(`material`, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano'),
	`catalog_data` = replace(replace(replace(replace(`catalog_data`, 'garantia vitalícia', 'garantia de 1 ano'), 'Garantia vitalícia', 'Garantia de 1 ano'), 'garantia vitalicia', 'garantia de 1 ano'), 'Garantia Vitalícia', 'Garantia de 1 ano');
