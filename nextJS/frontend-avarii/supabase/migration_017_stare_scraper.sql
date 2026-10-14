-- Migrare 017: stare internă a scraperului (cooldown pt. apelurile AI)
-- După un eșec AI (cotă epuizată 429, model suprasolicitat 503), scraperul nu
-- mai reia apelurile la fiecare rulare de 15 minute (ar consuma în gol cota
-- gratuită). Stă aici cât timp rămâne pauza, ca să o știe și rulările următoare.

create table if not exists stare_scraper (
  cheie text primary key,
  valoare jsonb not null default '{}'::jsonb,
  actualizat_la timestamptz not null default now()
);

alter table stare_scraper enable row level security;
-- Doar service_role scrie/citește (scraperul), deci nu sunt necesare policy-uri.
grant select, insert, update, delete on stare_scraper to service_role;
