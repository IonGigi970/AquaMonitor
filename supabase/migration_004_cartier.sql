-- ============================================================
-- Migrare v2: suport cartiere/zone (avarii + abonamente)
-- Rulează acest script O SINGURĂ DATĂ în Supabase > SQL Editor.
-- Poate fi rulat și dacă ai rulat deja o variantă anterioară.
-- ============================================================

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS cartier text;
ALTER TABLE abonamente ADD COLUMN IF NOT EXISTS cartier_interes text;

UPDATE avarii SET cartier = '' WHERE cartier IS NULL;
ALTER TABLE avarii ALTER COLUMN cartier SET DEFAULT '';
ALTER TABLE avarii ALTER COLUMN cartier SET NOT NULL;

-- Elimină ORICE index unic vechi care acoperă exact (sursa_url, localitate, strada, status).
-- Motiv: un anunț RAJA generează acum mai multe avarii (una per stradă + una per cartier/zonă),
-- iar indexul vechi ar bloca/suprascrie zonele diferite din același comunicat (strada = '' la toate).
DO $$
DECLARE
  idx_name text;
BEGIN
  FOR idx_name IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'avarii'::regclass
      AND x.indisunique
      AND NOT x.indisprimary
      AND (SELECT array_agg(a.attname ORDER BY a.attname)
           FROM unnest(x.indkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = 'avarii'::regclass AND a.attnum = k.attnum
           WHERE a.attnum > 0)
          = ARRAY['localitate','status','strada','sursa_url']
  LOOP
    EXECUTE format('DROP INDEX %I', idx_name);
    RAISE NOTICE 'Index vechi eliminat: %', idx_name;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS avarii_unic_sursa_zona_status
ON avarii (sursa_url, localitate, strada, cartier, status);
