CREATE TABLE IF NOT EXISTS launch_waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmation_sent_at TEXT,
  notified_at TEXT,
  notify_claimed_at INTEGER,
  notify_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  unsubscribed_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_launch_waitlist_email ON launch_waitlist(email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_pending ON launch_waitlist(notified_at, unsubscribed_at);
