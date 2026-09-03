-- ============================================================
-- Migrare v3: suport cartiere/zone (avarii + abonamente)
-- Rulează acest script O SINGURĂ DATĂ în Supabase > SQL Editor.
-- Poate fi rulat și dacă ai rulat deja o variantă anterioară.
-- ============================================================

-- 1. Adaugă coloanele (dacă nu există)
ALTER TABLE avarii ADD COLUMN IF NOT EXISTS cartier text;
ALTER TABLE abonamente ADD COLUMN IF NOT EXISTS cartier_interes text;

-- 2. Normalizare: cartier gol în loc de NULL (pentru upsert corect)
UPDATE avarii SET cartier = '' WHERE cartier IS NULL;
ALTER TABLE avarii ALTER COLUMN cartier SET DEFAULT '';
ALTER TABLE avarii ALTER COLUMN cartier SET NOT NULL;

-- 3. Elimină indexul unic vechi de 4 coloane.
--    Un anunț RAJA generează acum mai multe avarii (una per stradă + una per cartier/zonă);
--    indexul vechi ar bloca/suprascrie zonele diferite din același comunicat.
DROP INDEX IF EXISTS idx_avarii_unic;

-- 4. Creează indexul unic nou de 5 coloane (include cartier)
CREATE UNIQUE INDEX IF NOT EXISTS avarii_unic_sursa_zona_status
ON avarii (sursa_url, localitate, strada, cartier, status);
