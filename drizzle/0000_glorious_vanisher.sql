CREATE TABLE `cart_items` (
	`visitor_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`visitor_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cart_items_visitor_id` ON `cart_items` (`visitor_id`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`visitor_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`visitor_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_favorites_visitor_id` ON `favorites` (`visitor_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`cpf` text,
	`cep` text NOT NULL,
	`address` text NOT NULL,
	`address_number` text NOT NULL,
	`complement` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`shipping_method` text NOT NULL,
	`payment_method` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text DEFAULT 'aguardando_pagamento' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_visitor_id_created_at` ON `orders` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_email` ON `orders` (`email`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`material` text NOT NULL,
	`image` text NOT NULL,
	`badge` text,
	`price_cents` integer NOT NULL,
	`compare_at_cents` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_category_active` ON `products` (`category`,`active`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscribers_email` ON `subscribers` (`email`);