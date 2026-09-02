-- Suport pentru cartiere/zone în avarii și abonamente
-- RAJA publică uneori cartiere (ex: "Tomis 3", "Faleză Nord") în loc de străzi.
-- Aplicația trebuie să distingă între stradă și cartier.

ALTER TABLE avarii ADD COLUMN IF NOT EXISTS cartier text;
ALTER TABLE abonamente ADD COLUMN IF NOT EXISTS cartier_interes text;
