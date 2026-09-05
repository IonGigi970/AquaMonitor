-- Migrare 007: adauga suport multi-serviciu (apa, curent, viitor: gaz, transport)
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS serviciu text NOT NULL DEFAULT 'apa';
ALTER TABLE abonamente ADD COLUMN IF NOT EXISTS serviciu text NOT NULL DEFAULT 'apa';

CREATE INDEX IF NOT EXISTS idx_avarii_serviciu ON avarii (serviciu);
CREATE INDEX IF NOT EXISTS idx_abonamente_serviciu_localitate ON abonamente (serviciu, localitate_interes) WHERE activ = true;
