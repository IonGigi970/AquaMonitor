-- Migrare 014: optiunea "strict" pe abonamente
-- De ce: un abonat cu strada + cartier complete poate vrea alerte DOAR pentru
-- potriviri exacte pe ambele campuri. Fara "strict", daca avaria specifica doar
-- strada (fara cartier), abonatul primeste alertele pe strada — bine pentru unii,
-- prea larg pentru altii. Cu strict_and = true, ambele campuri completate trebuie
-- sa se potriveasca mereu (AND), indiferent de cat de specifica e avaria.

alter table if exists abonamente
  add column if not exists strict_and boolean not null default false;

-- Abonamentele existente raman cu comportamentul vechi (delta), deci nu e nevoie
-- de update.
