-- Migrare 012: marcaj pentru articolele RAJA deja procesate
-- Până acum, "articol procesat" însemna "există rând în avarii cu acel sursa_url".
-- Un articol din care AI-ul nu extrage nimic (anunț general, alt subiect) nu lăsa
-- niciun rând, deci era trimis la Gemini la fiecare rulare (din 15 în 15 minute),
-- consumând inutil cota API. Marcajul de aici ține minte TOATE articolele
-- procesate, indiferent dacă s-au extras avarii sau nu.

create table if not exists articole_procesate (
  url text primary key,
  nr_avarii integer not null default 0,
  procesat_la timestamptz not null default now()
);

alter table articole_procesate enable row level security;
-- Doar service_role scrie/citește (scraper-ul), deci nu sunt necesare policy-uri.

-- Curățenie: marcajele pentru articolele mai vechi de 30 de zile nu mai folosesc
-- la nimic (articolele RAJA sunt preluate doar în ziua publicării).
delete from articole_procesate where procesat_la < now() - interval '30 days';
