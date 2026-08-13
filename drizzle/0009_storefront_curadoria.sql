ALTER TABLE `categories` ADD `image` text;
--> statement-breakpoint
ALTER TABLE `products` ADD `featured` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `products` SET `featured` = 1
WHERE `id` IN (SELECT `id` FROM `products` WHERE `active` = 1 ORDER BY `created_at`, `id` LIMIT 8);
