-- Migrare 009: extindere întreruperi curent la TOATE județele
-- (județul fiecărei întreruperi + detaliile brute din anunțul PDF, pentru afișare)
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS judet text;
ALTER TABLE avarii ADD COLUMN IF NOT EXISTS detalii_anunt text;

CREATE INDEX IF NOT EXISTS idx_avarii_judet ON avarii (judet);
