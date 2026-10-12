-- Migrare 015: tabela zone_distincte (editabila din UI, fara deploy)
-- De ce: cartierele/zonele care incep cu un cuvant folosit si ca nume de strada
-- generica in alta parte a orasului, dar denumesc o zona DIFERITA (ex: cartierul
-- "Tomis Nord" nu are legatura cu strada "Tomis" din Palazu Mare), erau o lista
-- hardcodata in cod (ZONE_DISTINCTE din aquamonitor/utils.py). Mutarea in baza de
-- date permite adminului sa le adauge/scoata din aplicatie, fara deploy.

create table if not exists zone_distincte (
  id uuid primary key default gen_random_uuid(),
  text text not null unique,
  created_at timestamptz not null default now(),
  constraint zone_distincte_text_nevid check (btrim(text) <> '')
);

-- Seed: valorile existente in cod pana acum (normalizate).
insert into zone_distincte (text) values
  ('ct tomis nord'),
  ('tomis nord')
on conflict (text) do nothing;

-- Citirea e publica (ca si avarii); scrierea se face DOAR cu cheia service_role
-- (endpoint-ul de admin si scraper-ul o folosesc — trece peste RLS automat),
-- deci nu e nevoie de policy de insert/delete.
alter table zone_distincte enable row level security;

drop policy if exists "Oricine poate citi zone_distincte" on zone_distincte;
create policy "Oricine poate citi zone_distincte"
  on zone_distincte for select
  using (true);
