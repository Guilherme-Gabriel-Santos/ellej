ALTER TABLE orders ADD COLUMN stock_issue INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE coupons ADD COLUMN per_customer_limit INTEGER;
--> statement-breakpoint
ALTER TABLE coupon_redemptions ADD COLUMN customer_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions(coupon_id, customer_id);
