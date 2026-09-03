-- Migrare 005: extinde tabela telegram_users pentru webhook + dashboard

-- Adaugă date profil (venite de la Telegram la /start)
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE telegram_users ADD COLUMN IF NOT EXISTS last_name text;

-- Index util pentru căutare după chat_id (dacă vrem să evităm duplicate)
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_chat_id ON telegram_users (chat_id);

-- Policy pentru service_role: webhookul Next.js scrie cu service role, deci nu e nevoie de policy publică.
-- Rămâne fără policy pentru utilizatori (tabela e administrativă).
