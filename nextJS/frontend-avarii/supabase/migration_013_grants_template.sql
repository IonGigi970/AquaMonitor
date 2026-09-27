-- ═══════════════════════════════════════════════════════════════════════════
-- ȘABLON DE MIGRARE CU GRANT-URI EXPLICITE (de referință, NU se aplică direct)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- De la 30 octombrie 2026, Supabase nu mai acordă AUTOMAT acces Data API
-- (PostgREST) tabelelor NOI din schema public. Tabelele existente își păstrează
-- accesul actual, dar orice tabelă creată după această dată trebuie să primească
-- GRANT-uri explicite, altfel supabase-js / scraperul primesc 403 la citire/scriere.
--
-- CUM SE FOLOSEȘTE: copiază acest fișier ca migration_014_<nume>.sql, adaptează
-- numele tabelei, coloanele și policy-urile, apoi rulează-l în Supabase
-- Dashboard → SQL Editor. Nu rula acest șablon ca atare (tabela "exemplu" nu
-- există în producție).
--
-- ROLURILE FOLOSITE ÎN PROIECT:
--   anon          → vizitatorii site-ului (citesc avarii pe hartă, fără login)
--   authenticated → utilizatorii logați (își gestionează abonamentele)
--   service_role  → scraperul Python (scrie/citește tot, ocolește RLS)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabelă publică (ex: o nouă tabelă de avarii/evenimente) ─────────────
-- Exemplu: create table if not exists exemplu_public (
--   id uuid primary key default gen_random_uuid(),
--   titlu text not null,
--   creat_la timestamptz not null default now()
-- );

-- RLS activat (obligatoriu pentru tabelele din schema public)
-- alter table exemplu_public enable row level security;

-- GRANT-uri explicite — obligatorii de la 30.10.2026:
--   anon/authenticated citesc (harta publică), service_role scrie (scraperul)
-- grant select on exemplu_public to anon, authenticated;
-- grant select, insert, update, delete on exemplu_public to service_role;

-- Policy RLS pentru citire publică (fără login)
-- create policy "Public poate citi exemplu_public"
--   on exemplu_public for select
--   using (true);

-- ── 2. Tabelă doar pentru scraper (ex: notificari_trimise, articole_procesate) ──
-- Exemplu: create table if not exists exemplu_intern (
--   id uuid primary key default gen_random_uuid(),
--   date jsonb not null default '{}'::jsonb
-- );

-- alter table exemplu_intern enable row level security;

-- Doar service_role are nevoie de acces; anon/authenticated nu primesc nimic.
-- grant select, insert, update, delete on exemplu_intern to service_role;
-- (fără policy-uri: service_role ocolește RLS automat)

-- ── 3. Tabelă legată de utilizatori (ex: abonamente) ────────────────────────
-- Exemplu: create table if not exists exemplu_utilizatori (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid references auth.users(id) on delete cascade,
--   valoare text not null
-- );

-- alter table exemplu_utilizatori enable row level security;

-- grant select, insert, update, delete on exemplu_utilizatori to authenticated;
-- grant select, insert, update, delete on exemplu_utilizatori to service_role;

-- Policy: fiecare utilizator vede/editează doar rândurile proprii
-- create policy "Utilizatorii vad doar randurile proprii"
--   on exemplu_utilizatori for select
--   using (auth.uid() = user_id);
-- create policy "Utilizatorii pot crea randuri proprii"
--   on exemplu_utilizatori for insert
--   with check (auth.uid() = user_id);
-- create policy "Utilizatorii pot sterge randurile proprii"
--   on exemplu_utilizatori for delete
--   using (auth.uid() = user_id);
-- create policy "Utilizatorii pot edita randurile proprii"
--   on exemplu_utilizatori for update
--   using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTĂ: tabelele existente (avarii, abonamente, notificari_trimise,
-- telegram_users, telegram_conversatii, articole_procesate) NU au nevoie de
-- nimic — își păstrează accesul actual. Acest șablon e doar pentru tabele NOI.
-- ═══════════════════════════════════════════════════════════════════════════
