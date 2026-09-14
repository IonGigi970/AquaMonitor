// Mediu de test pentru botul Telegram: înlocuiește Supabase și rețeaua, ca
// testele să ruleze complet offline (fără baza de date de producție și fără să
// trimită ceva pe Telegram).
//
// Se importă ÎNAINTE de modulele botului, pentru că acestea își citesc
// variabilele de mediu la încărcare.

import { supabaseFals } from "./supabase-fals";

export type MesajTrimis = {
  chatId: number;
  text: string;
  butoane: string[][] | null;
  ascundeTastatura: boolean;
};

export const mesajeTrimise: MesajTrimis[] = [];

// Aceeași instanță folosită și de bot: cârligul de test redirecționează
// createClient() către supabase-client-fals.ts, care întoarce această instanță.
export { supabaseFals };

// Token fals: apelurile către Telegram sunt interceptate mai jos, deci nu pleacă
// nicăieri. Fără el, trimiteMesaj() ar ieși imediat (botul nu trimite nimic).
process.env.TELEGRAM_BOT_TOKEN = "123456:TEST";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "cheie-de-test";
delete process.env.TELEGRAM_WEBHOOK_SECRET;

// ── Rețeaua: interceptăm fetch ─────────────────────────────────────────────
const fetchOriginal = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url.includes("api.telegram.org")) {
    const corp = JSON.parse(String(init?.body || "{}"));
    const tastatura = corp.reply_markup?.keyboard;
    mesajeTrimise.push({
      chatId: corp.chat_id,
      text: corp.text,
      butoane: tastatura ? tastatura.map((rand: Array<{ text: string }>) => rand.map((b) => b.text)) : null,
      ascundeTastatura: Boolean(corp.reply_markup?.remove_keyboard),
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: mesajeTrimise.length } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return fetchOriginal(input as RequestInfo, init);
}) as typeof fetch;

// ── Supabase ───────────────────────────────────────────────────────────────
// Botul își creează clientul normal, cu createClient(); cârligul din
// _alias-hooks.mjs redirecționează pachetul către supabase-client-fals.ts, care
// întoarce chiar instanța de mai sus — nimic nu ajunge la baza de date reală.

// ── Ajutoare pentru teste ──────────────────────────────────────────────────
export function goleste() {
  mesajeTrimise.length = 0;
  supabaseFals.tabele.telegram_users = [];
  supabaseFals.tabele.telegram_conversatii = [];
  supabaseFals.tabele.abonamente = [];
  supabaseFals.erori = {};
}

export function ultimulMesaj(): MesajTrimis {
  const mesaj = mesajeTrimise[mesajeTrimise.length - 1];
  if (!mesaj) throw new Error("Botul nu a trimis niciun mesaj.");
  return mesaj;
}

export function texteleTrimise(): string[] {
  return mesajeTrimise.map((m) => m.text);
}

/** Construiește un update Telegram, ca cel trimis de Telegram către webhook. */
export function updateTelegram(
  chatId: number,
  text: string,
  optiuni: { username?: string; chatUsername?: string; updateId?: number } = {}
) {
  const chat: Record<string, unknown> = { id: chatId, first_name: "Test" };
  if (optiuni.chatUsername) chat.username = optiuni.chatUsername;
  const from: Record<string, unknown> = { id: 1, first_name: "Test" };
  if (optiuni.username) from.username = optiuni.username;
  return {
    update_id: optiuni.updateId ?? 1,
    message: { message_id: optiuni.updateId ?? 1, chat, from, text },
  };
}

/** Apelează webhook-ul (funcția POST din route.ts) cu un mesaj de la utilizator. */
export async function trimiteMesajBotului(
  chatId: number,
  text: string,
  optiuni: { username?: string; chatUsername?: string; updateId?: number } = {}
) {
  const { POST } = await import("../../app/api/telegram/route");
  const cerere = new Request("https://test.local/api/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateTelegram(chatId, text, optiuni)),
  });
  const raspuns = await POST(cerere);
  return { status: raspuns.status, corp: await raspuns.json() };
}
