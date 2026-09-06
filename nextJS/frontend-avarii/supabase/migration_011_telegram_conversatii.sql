-- Migrare 011: conversații pentru botul Telegram (abonare direct din chat)
-- Botul ține o conversație pe mai mulți pași (serviciu → județ → localitate →
-- stradă/cartier → confirmare). Serverless-ul Vercel nu are memorie între
-- apeluri, deci starea conversației stă în această tabelă, pe chat_id.

create table if not exists telegram_conversatii (
  chat_id bigint primary key,
  pas text not null,
  date jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table telegram_conversatii enable row level security;
-- Doar service_role scrie/citește (webhook-ul), deci nu sunt necesare policy-uri.

-- Curăță conversațiile abandonate (mai vechi de 6 ore), ca să nu rămână blocat un
-- utilizator care a început un flux și nu l-a terminat.
delete from telegram_conversatii where updated_at < now() - interval '6 hours';
