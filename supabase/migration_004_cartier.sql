-- ============================================================
-- Migrare: suport cartiere/zone (avarii + abonamente)
-- Rulează acest script O SINGURĂ DATĂ în Supabase > SQL Editor.
-- Poate fi rulat și dacă varianta simplă (doar ADD COLUMN) a fost deja rulată.
-- ============================================================

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS cartier text;
ALTER TABLE abonamente ADD COLUMN IF NOT EXISTS cartier_interes text;

-- Scraperul salvează "" (nu NULL) în strada/cartier, ca deduplicarea (upsert) să funcționeze:
-- în PostgreSQL, NULL nu intră niciodată în conflict la constrângeri unice.
UPDATE avarii SET cartier = '' WHERE cartier IS NULL;
ALTER TABLE avarii ALTER COLUMN cartier SET DEFAULT '';
ALTER TABLE avarii ALTER COLUMN cartier SET NOT NULL;

-- Un anunț RAJA generează acum MAI MULTE avarii (una per stradă + una per cartier/zonă).
-- Constrângerea unică veche (sursa_url, localitate, strada, status) ar suprascrie zonele
-- diferite din același comunicat (toate au strada = ''), deci o înlocuim cu una care
-- include și cartierul. Căutăm indexul unic vechi dinamic (nu știm numele exact).
DO $$
DECLARE
  idx_name text;
  col_list text;
  nr_coloane int;
BEGIN
  SELECT count(*) INTO nr_coloane
  FROM pg_attribute
  WHERE attrelid = 'avarii'::regclass AND attnum > 0
    AND attname IN ('sursa_url', 'localitate', 'strada', 'status');

  IF nr_coloane = 4 THEN
    SELECT array_to_string(array_agg(attnum ORDER BY attnum), ' ') INTO col_list
    FROM pg_attribute
    WHERE attrelid = 'avarii'::regclass AND attnum > 0
      AND attname IN ('sursa_url', 'localitate', 'strada', 'status');

    SELECT i.relname INTO idx_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'avarii'::regclass
      AND x.indisunique
      AND x.indkey::text = col_list;

    IF idx_name IS NOT NULL THEN
      EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS avarii_unic_sursa_zona_status
ON avarii (sursa_url, localitate, strada, cartier, status);
