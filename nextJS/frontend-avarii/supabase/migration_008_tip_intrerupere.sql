-- Migrare 008: distinge tipul întreruperilor de energie electrică
-- (accidentala = neplanificată, programata = deconectare planificată)
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS tip_intrerupere text;

CREATE INDEX IF NOT EXISTS idx_avarii_tip_intrerupere ON avarii (tip_intrerupere);
