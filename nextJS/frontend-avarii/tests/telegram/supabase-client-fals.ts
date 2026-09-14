// Client Supabase fals oferit codului aplicației în timpul testelor.
//
// _alias-hooks.mjs redirecționează importul "@supabase/supabase-js" către acest
// fișier, deci route.ts primește exact instanța pe care o citesc testele
// (vezi tests/telegram/supabase-fals.ts) — nimic nu ajunge la baza de date reală.

import { supabaseFals } from "./supabase-fals";

export function createClient() {
  return supabaseFals;
}
