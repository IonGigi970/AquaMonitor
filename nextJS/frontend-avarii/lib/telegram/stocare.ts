// Accesul botului la baza de date: utilizatori Telegram, conversații în curs și
// abonamentele create din chat.
//
// Funcțiile primesc clientul Supabase al cererii (creat o singură dată, în
// route.ts), ca fiecare apel HTTP al webhook-ului să folosească aceeași
// conexiune.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientSupabase = SupabaseClient;

// Datele unei cereri, transmise împreună către modulele de comenzi/conversație.
export type ContextBot = {
  supabase: ClientSupabase;
  chatId: number;
  username: string;
  text: string;
  textLower: string;
};

export type UtilizatorChat = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type Abonament = {
  id: string;
  serviciu: string;
  judet: string | null;
  localitate_interes: string | null;
  strada_interes: string | null;
  cartier_interes: string | null;
};

export type Conversatie = {
  pas: string;
  date: Record<string, unknown>;
};

/**
 * Pregătește rândul pentru tabela telegram_users. Utilizatorii fără @username
 * sunt salvați sub `id_<chat_id>`, ca să poată fi identificați ulterior.
 */
export function pregatesteUtilizator(
  chat: UtilizatorChat,
  username: string
): Record<string, unknown> {
  const upsertData: Record<string, unknown> = {
    chat_id: Number(chat.id),
    first_seen: new Date().toISOString(),
  };
  if (chat.first_name) upsertData.first_name = chat.first_name;
  if (chat.last_name) upsertData.last_name = chat.last_name;
  if (username) {
    upsertData.username = username;
  } else if (chat.username) {
    upsertData.username = String(chat.username).toLowerCase();
  } else {
    upsertData.username = `id_${chat.id}`;
  }
  return upsertData;
}

/** Salvează utilizatorul și marchează dacă primește (true) sau nu (false) alerte. */
export async function salveazaUtilizator(
  supabase: ClientSupabase,
  date: Record<string, unknown>,
  activ: boolean
): Promise<void> {
  await supabase
    .from("telegram_users")
    .upsert({ ...date, activ }, { onConflict: "username" });
}

export async function citesteConversatie(
  supabase: ClientSupabase,
  chatId: number
): Promise<Conversatie | null> {
  const { data } = await supabase
    .from("telegram_conversatii")
    .select("pas, date")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  return {
    pas: String(data.pas),
    date: (data.date || {}) as Record<string, unknown>,
  };
}

export async function salveazaConversatie(
  supabase: ClientSupabase,
  chatId: number,
  pas: string,
  date: Record<string, unknown>
): Promise<void> {
  await supabase.from("telegram_conversatii").upsert(
    { chat_id: chatId, pas, date, updated_at: new Date().toISOString() },
    { onConflict: "chat_id" }
  );
}

export async function stergeConversatie(
  supabase: ClientSupabase,
  chatId: number
): Promise<void> {
  await supabase.from("telegram_conversatii").delete().eq("chat_id", chatId);
}

export async function listeazaAbonamente(
  supabase: ClientSupabase,
  username: string
): Promise<Abonament[]> {
  const { data } = await supabase
    .from("abonamente")
    .select("id, serviciu, judet, localitate_interes, strada_interes, cartier_interes")
    .eq("tip_contact", "telegram")
    .eq("valoare_contact", `@${username}`)
    .eq("activ", true)
    .order("created_at", { ascending: true });
  return (data || []) as Abonament[];
}

/** Zona unui abonament nou (fără id), pentru verificarea de duplicat. */
export type ZonaAbonament = {
  serviciu: string;
  localitate_interes: string;
  strada_interes: string;
  cartier_interes: string;
};

/** Există deja un abonament activ cu exact aceeași zonă? (ca să nu-l dublăm) */
export async function existaAbonamentIdentic(
  supabase: ClientSupabase,
  username: string,
  abonament: ZonaAbonament
): Promise<boolean> {
  const { data } = await supabase
    .from("abonamente")
    .select("id")
    .eq("tip_contact", "telegram")
    .eq("valoare_contact", `@${username}`)
    .eq("serviciu", abonament.serviciu)
    .eq("localitate_interes", abonament.localitate_interes)
    .eq("strada_interes", abonament.strada_interes)
    .eq("cartier_interes", abonament.cartier_interes)
    .eq("activ", true)
    .limit(1);
  return (data || []).length > 0;
}

export async function creeazaAbonament(
  supabase: ClientSupabase,
  abonament: Record<string, unknown>
): Promise<unknown> {
  const { error } = await supabase.from("abonamente").insert(abonament);
  return error;
}

export async function dezactiveazaAbonament(
  supabase: ClientSupabase,
  id: string
): Promise<unknown> {
  const { error } = await supabase.from("abonamente").update({ activ: false }).eq("id", id);
  return error;
}
