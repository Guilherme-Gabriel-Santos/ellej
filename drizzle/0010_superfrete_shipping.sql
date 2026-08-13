ALTER TABLE orders ADD COLUMN superfrete_service_id TEXT;
ALTER TABLE orders ADD COLUMN superfrete_service_name TEXT;
ALTER TABLE orders ADD COLUMN superfrete_delivery_days INTEGER;
ALTER TABLE orders ADD COLUMN superfrete_quote_price_cents INTEGER;
ALTER TABLE orders ADD COLUMN superfrete_order_id TEXT;
ALTER TABLE orders ADD COLUMN superfrete_protocol TEXT;
ALTER TABLE orders ADD COLUMN superfrete_price_cents INTEGER;
ALTER TABLE orders ADD COLUMN superfrete_status TEXT;
ALTER TABLE orders ADD COLUMN superfrete_tracking_code TEXT;
ALTER TABLE orders ADD COLUMN superfrete_label_url TEXT;
ALTER TABLE orders ADD COLUMN superfrete_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_superfrete_order_id ON orders(superfrete_order_id);
