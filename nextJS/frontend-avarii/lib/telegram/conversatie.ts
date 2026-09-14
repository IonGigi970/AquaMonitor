// Pașii conversației de abonare (serviciu → județ → localitate → stradă →
// cartier → confirmare) și dezabonarea pe număr, continuați cu mesajul primit.

import { trimiteMesaj } from "./api";
import {
  type ContextBot,
  citesteConversatie,
  creeazaAbonament,
  dezactiveazaAbonament,
  existaAbonamentIdentic,
  salveazaConversatie,
  stergeConversatie,
} from "./stocare";
import {
  ETICHETE_SERVICIU,
  descriereZona,
  gasesteJudet,
  gasesteServiciu,
  normalizeazaText,
} from "./text";

export async function continuaConversatia(ctx: ContextBot): Promise<void> {
  const { supabase, chatId, username, text, textLower } = ctx;

  const conv = await citesteConversatie(supabase, chatId);
  if (!conv) {
    // Mesaj liber fără conversație activă: sugerăm comenzile.
    await trimiteMesaj(chatId, "Scrie /comenzi ca să vezi ce pot face.");
    return;
  }

  const pas = conv.pas;
  const date = conv.date;

  const anuleaza = async (motiv?: string) => {
    await stergeConversatie(supabase, chatId);
    await trimiteMesaj(
      chatId,
      motiv ? motiv : "👌 Am anulat. Scrie /comenzi dacă ai nevoie de ajutor."
    );
  };

  if (pas === "serviciu") {
    const serviciu = gasesteServiciu(text);
    if (!serviciu) {
      await trimiteMesaj(
        chatId,
        "Nu am înțeles. Alege un serviciu:",
        [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]
      );
      return;
    }
    if (serviciu === "curent") {
      await salveazaConversatie(supabase, chatId, "judet", { serviciu });
      await trimiteMesaj(
        chatId,
        "📌 În ce județ? (ex: Constanța, Timiș, București)\n\n" +
          "Alertele de energie electrică sunt naționale — localități cu același nume există în mai multe județe."
      );
    } else {
      await salveazaConversatie(supabase, chatId, "localitate", { serviciu });
      await trimiteMesaj(
        chatId,
        "🏙️ În ce localitate stai? (ex: Constanța, Lumina, Ovidiu)"
      );
    }
    return;
  }

  if (pas === "judet") {
    const judet = gasesteJudet(text);
    if (!judet) {
      await trimiteMesaj(
        chatId,
        "🤔 Nu recunosc județul. Scrie numele complet (ex: „Constanța” sau „Satu Mare”)."
      );
      return;
    }
    await salveazaConversatie(supabase, chatId, "localitate", { ...date, judet });
    await trimiteMesaj(chatId, `🏙️ În ce localitate din județul ${judet}?`);
    return;
  }

  if (pas === "localitate") {
    const localitate = normalizeazaText(text);
    if (!localitate) {
      await trimiteMesaj(chatId, "Scrie numele localității, te rog.");
      return;
    }
    await salveazaConversatie(supabase, chatId, "strada", { ...date, localitate });
    await trimiteMesaj(
      chatId,
      "🛣️ Pe ce stradă (opțional)?\n\nScrie numele străzii sau „-” dacă vrei alerte pentru toată localitatea."
    );
    return;
  }

  if (pas === "strada") {
    const strada = text.trim() === "-" ? "" : normalizeazaText(text);
    await salveazaConversatie(supabase, chatId, "cartier", { ...date, strada });
    await trimiteMesaj(
      chatId,
      "🏘️ În ce cartier/zonă (opțional)?\n\nScrie numele sau „-” dacă nu e cazul."
    );
    return;
  }

  if (pas === "cartier") {
    const cartier = text.trim() === "-" ? "" : normalizeazaText(text);
    const serviciu = String(date.serviciu || "apa");
    const eticheta = ETICHETE_SERVICIU[serviciu] ?? serviciu;
    const judet = date.judet ? `, jud. ${date.judet}` : "";
    const zona =
      `${date.localitate}${judet}` +
      (date.strada ? `, strada ${date.strada}` : "") +
      (cartier ? `, cartierul ${cartier}` : "") +
      (!date.strada && !cartier ? " — toată localitatea" : "");
    await salveazaConversatie(supabase, chatId, "confirmare", { ...date, cartier });
    await trimiteMesaj(
      chatId,
      `📝 Confirmă abonamentul:\n\n${eticheta}\n📍 ${zona}`,
      [["✅ Da, abonează-mă"], ["❌ Anulează"]]
    );
    return;
  }

  if (pas === "confirmare") {
    const confirmat = /da|ok|confirm|✅|aboneaza/.test(textLower);
    if (!confirmat) {
      await anuleaza();
      return;
    }
    const serviciu = String(date.serviciu || "apa");
    const abonamentNou = {
      user_id: null,
      serviciu,
      judet: serviciu === "curent" ? String(date.judet || "") : null,
      tip_contact: "telegram",
      valoare_contact: `@${username}`,
      localitate_interes: String(date.localitate || ""),
      strada_interes: String(date.strada || ""),
      cartier_interes: String(date.cartier || ""),
      activ: true,
    };

    // Evităm duplicatele: același serviciu + aceeași zonă, deja activ.
    if (await existaAbonamentIdentic(supabase, username, abonamentNou)) {
      await anuleaza("ℹ️ Ai deja un abonament identic activ — nu l-am dublat.");
      return;
    }

    const error = await creeazaAbonament(supabase, abonamentNou);
    if (error) {
      console.error("Eroare inserare abonament bot:", error);
      await anuleaza("❌ Nu am reușit să salvez abonamentul. Încearcă din nou mai târziu.");
      return;
    }
    await stergeConversatie(supabase, chatId);
    const eticheta = ETICHETE_SERVICIU[serviciu] ?? serviciu;
    await trimiteMesaj(
      chatId,
      `✅ Abonament activ!\n\n${eticheta}\n📍 ${descriereZona(abonamentNou)}` +
        "\n\nVei primi aici alertele pentru zona ta. Dacă nu primești nimic, apasă /start ca să te reactivezi."
    );
    return;
  }

  if (pas === "dezaboneaza") {
    const numar = parseInt(text, 10);
    const listaIds = (date.lista_ids as string[]) || [];
    if (!numar || numar < 1 || numar > listaIds.length) {
      await anuleaza("👌 Am anulat dezabonarea.");
      return;
    }
    const error = await dezactiveazaAbonament(supabase, listaIds[numar - 1]);
    if (error) {
      console.error("Eroare dezactivare abonament bot:", error);
      await anuleaza("❌ Nu am reușit să dezactivez abonamentul. Încearcă din nou.");
      return;
    }
    await stergeConversatie(supabase, chatId);
    await trimiteMesaj(chatId, "✅ Abonament dezactivat. Scrie /aboneaza dacă vrei altul.");
    return;
  }

  // Paș necunoscut: resetăm conversația.
  await anuleaza();
}
