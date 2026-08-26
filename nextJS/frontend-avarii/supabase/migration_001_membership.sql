-- Migrare pentru autentificare + membership (alerte pe zone)
-- Ruleaza acest script o singura data in Supabase Dashboard -> SQL Editor -> New query -> Run

-- 1. Tabela avarii: activam RLS, dar permitem citire publica (harta trebuie sa functioneze fara login)
alter table if exists avarii enable row level security;

drop policy if exists "Public poate citi avarii" on avarii;
create policy "Public poate citi avarii"
  on avarii for select
  using (true);

-- Nota: insert/update/delete pe avarii se fac doar din scraper.py, cu cheia service_role
-- (service_role trece peste RLS automat, nu are nevoie de policy separata)

-- Coloana cu URL-ul articolului sursa de pe rajac.ro (folosita de scraper pentru deduplicare)
alter table if exists avarii
  add column if not exists sursa_url text;

-- Un articol poate contine mai multe localitati/strazi; le consideram unice pe combinatia asta
create unique index if not exists idx_avarii_unic
  on avarii (sursa_url, localitate, strada, status);

-- 2. Tabela abonamente: legam fiecare abonament de un utilizator autentificat
alter table if exists abonamente
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists abonamente
  add column if not exists activ boolean not null default true;

alter table if exists abonamente
  add column if not exists created_at timestamptz not null default now();

alter table if exists abonamente enable row level security;

drop policy if exists "Userii vad doar abonamentele proprii" on abonamente;
create policy "Userii vad doar abonamentele proprii"
  on abonamente for select
  using (auth.uid() = user_id);

drop policy if exists "Userii pot crea abonamente proprii" on abonamente;
create policy "Userii pot crea abonamente proprii"
  on abonamente for insert
  with check (auth.uid() = user_id);

drop policy if exists "Userii pot sterge abonamentele proprii" on abonamente;
create policy "Userii pot sterge abonamentele proprii"
  on abonamente for delete
  using (auth.uid() = user_id);

drop policy if exists "Userii pot edita abonamentele proprii" on abonamente;
create policy "Userii pot edita abonamentele proprii"
  on abonamente for update
  using (auth.uid() = user_id);

-- 3. Index pentru cautari rapide facute de scraper/notificator (dupa localitate_interes, activ)
create index if not exists idx_abonamente_localitate on abonamente (localitate_interes) where activ = true;
create index if not exists idx_abonamente_user on abonamente (user_id);

-- 4. Tabela pentru a nu trimite aceeasi notificare de doua ori pentru aceeasi avarie
create table if not exists notificari_trimise (
  id uuid primary key default gen_random_uuid(),
  abonament_id uuid not null references abonamente(id) on delete cascade,
  avarie_id uuid not null references avarii(id) on delete cascade,
  trimis_la timestamptz not null default now(),
  unique (abonament_id, avarie_id)
);

alter table notificari_trimise enable row level security;
-- Aceasta tabela e folosita doar de scriptul Python (service_role), nu are nevoie de policy pentru utilizatori.
