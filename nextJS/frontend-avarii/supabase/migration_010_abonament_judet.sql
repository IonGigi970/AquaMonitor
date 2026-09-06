-- Migrare 010: județ pe abonamente
-- De ce: deconectările de energie electrică sunt naționale, iar aceeași localitate
-- poate exista în mai multe județe (ex: Mihail Kogălniceanu în Constanța și Ialomița).
-- Abonamentele pe energie electrică pot indica județul; cele fără județ (null)
-- primesc alerte din toate județele (comportamentul vechi, pentru abonamentele dinainte).

alter table if exists abonamente add column if not exists judet text;

create index if not exists idx_abonamente_judet
  on abonamente (judet) where activ = true;

-- Abonamentele existente pe energie electrică au fost create pe vremea când
-- monitorizam doar Constanța → le completăm cu județul Constanța.
update abonamente
  set judet = 'Constanța'
  where serviciu = 'curent' and judet is null;
