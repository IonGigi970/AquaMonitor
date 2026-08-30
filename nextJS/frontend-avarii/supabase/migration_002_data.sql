-- Migrare 002: adauga coloana 'data' (data pentru care este valabila avaria)
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

alter table if exists avarii
  add column if not exists data date;

-- Index pentru filtrarea rapida dupa data (alertele zilei = azi + viitor)
create index if not exists idx_avarii_data on avarii (data);
