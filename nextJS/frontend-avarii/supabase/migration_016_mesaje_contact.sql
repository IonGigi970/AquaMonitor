-- Migrare 016: mesaje din formularul de contact
-- De ce: utilizatorii pot trimite sugestii/probleme direct din aplicatie, fara
-- sa intre pe mail. Mesajele stau in baza de date si apar adminului in pagina
-- Membership (cu indicator de necitit), unde le poate marca procesate.

create table if not exists mesaje_contact (
  id uuid primary key default gen_random_uuid(),
  nume text not null,
  email text not null,
  subiect text not null,
  mesaj text not null,
  ip text,
  procesat boolean not null default false,
  creat_la timestamptz not null default now(),
  constraint mesaje_contact_nume_nevid check (btrim(nume) <> ''),
  constraint mesaje_contact_email_nevid check (btrim(email) <> ''),
  constraint mesaje_contact_subiect_nevid check (btrim(subiect) <> ''),
  constraint mesaje_contact_mesaj_nevid check (btrim(mesaj) <> '')
);

create index if not exists idx_mesaje_contact_procesat
  on mesaje_contact (procesat, creat_la desc);

-- Oricine poate trimite (insert); citirea si marcarea ca procesat se fac DOAR cu
-- cheia service_role (endpoint-ul de admin), ca si la celelalte tabele de lucru.
alter table mesaje_contact enable row level security;

drop policy if exists "Oricine poate trimite mesaje de contact" on mesaje_contact;
create policy "Oricine poate trimite mesaje de contact"
  on mesaje_contact for insert
  with check (true);
