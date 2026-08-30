-- Migrare 003: tabela pentru maparea username Telegram -> chat_id numeric
-- Ruleaza in Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists telegram_users (
  username text primary key,
  chat_id bigint not null,
  first_seen timestamptz not null default now()
);

alter table telegram_users enable row level security;
-- Tabela e folosita doar de scriptul Python (service_role), nu are nevoie de policy pentru utilizatori.
