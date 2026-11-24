CREATE TABLE `admin_passkeys` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`webauthn_user_id` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`label` text DEFAULT 'Face ID' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_admin_passkeys_user_created` ON `admin_passkeys` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `admin_passkey_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`challenge` text NOT NULL,
	`webauthn_user_id` text,
	`origin` text NOT NULL,
	`rp_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_passkey_challenges_user_expires` ON `admin_passkey_challenges` (`user_id`,`expires_at`);
