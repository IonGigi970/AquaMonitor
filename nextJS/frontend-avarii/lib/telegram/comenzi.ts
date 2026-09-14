// Comenzile botului: pornire/oprire alerte, ajutor, abonare, listare și
// dezabonare. Fiecare funcție întoarce true dacă a tratat mesajul.

import { trimiteMesaj } from "./api";
import {
  type Abonament,
  type ContextBot,
  listeazaAbonamente,
  salveazaConversatie,
  salveazaUtilizator,
  stergeConversatie,
} from "./stocare";
import { ETICHETE_SERVICIU, descriereZona } from "./text";

const MESAJ_HELP =
  "📋 *Comenzi*\n\n" +
  "/aboneaza — abonament nou (apă sau energie electrică)\n" +
  "/abonamente — vezi abonamentele active\n" +
  "/dezaboneaza — dezactivezi un abonament\n" +
  "/start — reactivează notificările\n" +
  "/stop — oprește toate notificările";

const MESAJ_FARA_USERNAME =
  "⚠️ Setează un @username în profilul Telegram ca să pot găsi abonamentele tale.";

function randeazaLista(abonamente: Abonament[]): string {
  return abonamente
    .map(
      (a, i) =>
        `${i + 1}. ${ETICHETE_SERVICIU[String(a.serviciu)] ?? a.serviciu}` +
        (a.judet ? ` (${a.judet})` : "") +
        ` — ${descriereZona(a)}`
    )
    .join("\n");
}

/**
 * /stop și /start (+ aliasurile lor scrise simplu). Se tratează ÎNAINTE de
 * marcarea utilizatorului ca activ, pentru că ele decid chiar starea „activ".
 */
export async function executaComenziGlobale(
  ctx: ContextBot,
  dateUtilizator: Record<string, unknown>
): Promise<boolean> {
  const { supabase, chatId, textLower } = ctx;

  const esteDezabonare = ["/stop", "/dezabonare", "stop", "dezabonare"].includes(textLower);
  if (esteDezabonare) {
    await salveazaUtilizator(supabase, dateUtilizator, false);
    await stergeConversatie(supabase, chatId);
    await trimiteMesaj(
      chatId,
      "🔕 Notificările sunt oprite. Când vrei să reprimești alertele, scrie /start."
    );
    return true;
  }

  if (textLower === "/start") {
    await salveazaUtilizator(supabase, dateUtilizator, true);
    await stergeConversatie(supabase, chatId);
    const salut =
      "👋 Salut! Te-ai reactivat — alertele tale îți vor ajunge din nou aici.\n\n" +
      "Comenzile mele:\n" +
      "/aboneaza — abonament nou (apă sau energie electrică)\n" +
      "/abonamente — vezi abonamentele active\n" +
      "/dezaboneaza — dezactivezi un abonament\n" +
      "/comenzi — această listă\n" +
      "/stop — oprește toate notificările";
    await trimiteMesaj(chatId, salut);
    return true;
  }

  return false;
}

/**
 * Comenzile de gestionare a abonamentelor. Se execută DUPĂ ce utilizatorul a
 * fost marcat activ; întoarce true dacă mesajul a fost o comandă (inclusiv una
 * necunoscută), ca route-ul să nu-l mai trimită către conversație.
 */
export async function executaComenzi(ctx: ContextBot): Promise<boolean> {
  const { supabase, chatId, username, text, textLower } = ctx;

  if (textLower === "/comenzi" || textLower === "/help" || textLower === "/ajutor") {
    await trimiteMesaj(chatId, MESAJ_HELP);
    return true;
  }

  if (textLower === "/aboneaza") {
    if (!username) {
      await trimiteMesaj(
        chatId,
        "⚠️ Nu am găsit un @username la contul tău.\n" +
          "Deschide Telegram → Settings → Edit profile și setează un Username, apoi încearcă din nou /aboneaza."
      );
      return true;
    }
    await salveazaConversatie(supabase, chatId, "serviciu", {});
    await trimiteMesaj(
      chatId,
      "🛎️ Pentru ce serviciu vrei alerte?",
      [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]
    );
    return true;
  }

  if (textLower === "/abonamente") {
    if (!username) {
      await trimiteMesaj(chatId, MESAJ_FARA_USERNAME);
      return true;
    }
    const abonamente = await listeazaAbonamente(supabase, username);
    if (abonamente.length === 0) {
      await trimiteMesaj(
        chatId,
        "📭 Nu ai niciun abonament activ. Scrie /aboneaza ca să adaugi unul."
      );
      return true;
    }
    await trimiteMesaj(chatId, "📋 *Abonamentele tale active:*\n\n" + randeazaLista(abonamente));
    return true;
  }

  if (textLower === "/dezaboneaza") {
    if (!username) {
      await trimiteMesaj(chatId, MESAJ_FARA_USERNAME);
      return true;
    }
    const abonamente = await listeazaAbonamente(supabase, username);
    if (abonamente.length === 0) {
      await trimiteMesaj(chatId, "📭 Nu ai niciun abonament activ de dezactivat.");
      return true;
    }
    await salveazaConversatie(supabase, chatId, "dezaboneaza", {
      lista_ids: abonamente.map((a) => a.id),
    });
    await trimiteMesaj(
      chatId,
      "🔽 Care abonament vrei să-l dezactivezi?\n\n" + randeazaLista(abonamente) +
        "\n\nScrie doar numărul (sau 0 ca să anulezi)."
    );
    return true;
  }

  if (text.startsWith("/")) {
    await trimiteMesaj(
      chatId,
      "🤔 Nu cunosc comanda asta. Scrie /comenzi ca să vezi ce pot face."
    );
    return true;
  }

  return false;
}
