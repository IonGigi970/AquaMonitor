-- Migrare 006: adauga status activ/inactiv pentru utilizatorii Telegram
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS activ boolean NOT NULL DEFAULT true;

-- Index pentru cautare rapida a utilizatorilor activi
CREATE INDEX IF NOT EXISTS idx_telegram_users_activ ON telegram_users (activ);
