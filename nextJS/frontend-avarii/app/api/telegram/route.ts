import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Webhook-ul botului @JimmyWaterBot. Pe lÃ¢ngÄƒ activarea/dezactivarea clasicÄƒ
// (/start, /stop), botul È›ine conversaÈ›ii pentru ABONAREA directÄƒ din Telegram:
//   /aboneaza  â€” flux: serviciu (apÄƒ / energie electricÄƒ) â†’ judeÈ› (doar curent)
//                â†’ localitate â†’ stradÄƒ (opÈ›ional) â†’ cartier (opÈ›ional) â†’ confirmare
//   /abonamente â€” lista abonamentelor tale active
//   /dezaboneaza â€” dezactivezi un abonament dupÄƒ numÄƒr
//   /comenzi   â€” ajutor
// Starea conversaÈ›iei stÄƒ Ã®n tabela telegram_conversatii (serverless = fÄƒrÄƒ
// memorie Ã®ntre apeluri). Abonamentele create au user_id NULL È™i sunt legate de
// utilizator prin valoare_contact (@username).

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);

const JUDETE = [
  "Alba", "Arad", "ArgeÈ™", "BacÄƒu", "Bihor", "BistriÈ›a-NÄƒsÄƒud", "BotoÈ™ani",
  "BraÈ™ov", "BrÄƒila", "BucureÈ™ti", "BuzÄƒu", "CaraÈ™-Severin", "CÄƒlÄƒraÈ™i", "Cluj",
  "ConstanÈ›a", "Covasna", "DÃ¢mboviÈ›a", "Dolj", "GalaÈ›i", "Giurgiu", "Gorj",
  "Harghita", "Hunedoara", "IalomiÈ›a", "IaÈ™i", "Ilfov", "MaramureÈ™", "MehedinÈ›i",
  "MureÈ™", "NeamÈ›", "Olt", "Prahova", "Satu Mare", "SÄƒlaj", "Sibiu", "Suceava",
  "Teleorman", "TimiÈ™", "Tulcea", "Vaslui", "VÃ¢lcea", "Vrancea",
];

const ETICHETE_SERVICIU: Record<string, string> = {
  apa: "ðŸ’§ ApÄƒ (RAJA)",
  curent: "âš¡ Energie electricÄƒ",
};

function normalizeazaText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(strada|str\.|bulevardul|bd\.|b-dul|alee|aleea|intrarea|cartier|cartierul)\s+/i, "")
    .trim();
}

function gasesteJudet(text: string): string | null {
  const cautat = normalizeazaText(text).replace(/jud(etul)?\.?\s*/i, "");
  if (!cautat) return null;
  const exact = JUDETE.find((j) => normalizeazaText(j) === cautat);
  if (exact) return exact;
  const partial = JUDETE.find((j) => normalizeazaText(j).includes(cautat) && cautat.length >= 4);
  return partial || null;
}

function gasesteServiciu(text: string): "apa" | "curent" | null {
  const t = normalizeazaText(text);
  if (t.includes("apa") || t === "1" || t.includes("ðŸ’§")) return "apa";
  if (t.includes("energie") || t.includes("curent") || t.includes("electric") || t === "2" || t.includes("âš¡")) return "curent";
  return null;
}

async function trimiteMesaj(
  chatId: number,
  text: string,
  keyboard?: string[][]
): Promise<void> {
  if (!botToken) return;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (keyboard) {
    body.reply_markup = {
      keyboard: keyboard.map((rand) => rand.map((buton) => ({ text: buton }))),
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else {
    body.reply_markup = { remove_keyboard: true };
  }
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("Eroare trimitere mesaj Telegram:", err);
  }
}

function descriereZona(ab: Record<string, unknown>): string {
  const capitalize = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const bucati = [capitalize(String(ab.localitate_interes ?? ""))];
  if (ab.strada_interes) bucati.push(`strada ${capitalize(String(ab.strada_interes))}`);
  if (ab.cartier_interes) bucati.push(`cartierul ${capitalize(String(ab.cartier_interes))}`);
  if (!ab.strada_interes && !ab.cartier_interes) bucati.push("toatÄƒ localitatea");
  return bucati.join(", ");
}

export async function POST(request: Request) {
  try {
    const update = await request.json();
    const message = update?.message || update?.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chat = message.chat;
    const user = message.from;
    const text = (message.text || "").trim();
    const textLower = text.toLowerCase();

    if (!chat || !chat.id || !supabaseServiceKey) {
      return NextResponse.json({ ok: true });
    }

    const chatId = Number(chat.id);
    const username = (user?.username || "").toLowerCase();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const upsertData: Record<string, unknown> = {
      chat_id: chatId,
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

    const stergeConversatie = async () => {
      await supabase.from("telegram_conversatii").delete().eq("chat_id", chatId);
    };
    const salveazaConversatie = async (pas: string, date: Record<string, unknown>) => {
      await supabase.from("telegram_conversatii").upsert(
        { chat_id: chatId, pas, date, updated_at: new Date().toISOString() },
        { onConflict: "chat_id" }
      );
    };

    // â”€â”€ Comenzi globale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const esteDezabonare = ["/stop", "/dezabonare", "stop", "dezabonare"].includes(textLower);
    if (esteDezabonare) {
      upsertData.activ = false;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
      await stergeConversatie();
      await trimiteMesaj(chatId, "ðŸ”• NotificÄƒrile sunt oprite. CÃ¢nd vrei sÄƒ reprimeÈ™ti alertele, scrie /start.");
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/start") {
      upsertData.activ = true;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
      await stergeConversatie();
      const salut =
        "ðŸ‘‹ Salut! Te-ai reactivat â€” alertele tale Ã®È›i vor ajunge din nou aici.\n\n" +
        "Comenzile mele:\n" +
        "/aboneaza â€” abonament nou (apÄƒ sau energie electricÄƒ)\n" +
        "/abonamente â€” vezi abonamentele active\n" +
        "/dezaboneaza â€” dezactivezi un abonament\n" +
        "/comenzi â€” aceastÄƒ listÄƒ\n" +
        "/stop â€” opreÈ™te toate notificÄƒrile";
      await trimiteMesaj(chatId, salut);
      return NextResponse.json({ ok: true });
    }

    // Orice alt mesaj cu username = utilizator activ (comportamentul existent).
    if (username || chat.username) {
      upsertData.activ = true;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
    }

    const esteComanda = text.startsWith("/");

    // â”€â”€ Comenzi noi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (textLower === "/comenzi" || textLower === "/help" || textLower === "/ajutor") {
      const ajutor =
        "ðŸ“‹ *Comenzi*\n\n" +
        "/aboneaza â€” abonament nou (apÄƒ sau energie electricÄƒ)\n" +
        "/abonamente â€” vezi abonamentele active\n" +
        "/dezaboneaza â€” dezactivezi un abonament\n" +
        "/start â€” reactiveazÄƒ notificÄƒrile\n" +
        "/stop â€” opreÈ™te toate notificÄƒrile";
      await trimiteMesaj(chatId, ajutor);
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/aboneaza") {
      if (!username) {
        await trimiteMesaj(
          chatId,
          "âš ï¸ Nu am gÄƒsit un @username la contul tÄƒu.\n" +
            "Deschide Telegram â†’ Settings â†’ Edit profile È™i seteazÄƒ un Username, apoi Ã®ncearcÄƒ din nou /aboneaza."
        );
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("serviciu", {});
      await trimiteMesaj(
        chatId,
        "ðŸ›Žï¸ Pentru ce serviciu vrei alerte?",
        [["ðŸ’§ ApÄƒ (RAJA)"], ["âš¡ Energie electricÄƒ"]]
      );
      return NextResponse.json({ ok: true });
    }

    const listaAbonamente = async () => {
      const { data } = await supabase
        .from("abonamente")
        .select("id, serviciu, judet, localitate_interes, strada_interes, cartier_interes")
        .eq("tip_contact", "telegram")
        .eq("valoare_contact", `@${username}`)
        .eq("activ", true)
        .order("created_at", { ascending: true });
      return data || [];
    };

    if (textLower === "/abonamente") {
      if (!username) {
        await trimiteMesaj(chatId, "âš ï¸ SeteazÄƒ un @username Ã®n profilul Telegram ca sÄƒ pot gÄƒsi abonamentele tale.");
        return NextResponse.json({ ok: true });
      }
      const abonamente = await listaAbonamente();
      if (abonamente.length === 0) {
        await trimiteMesaj(
          chatId,
          "ðŸ“­ Nu ai niciun abonament activ. Scrie /aboneaza ca sÄƒ adaugi unul."
        );
        return NextResponse.json({ ok: true });
      }
      const randuri = abonamente.map(
        (a, i) =>
          `${i + 1}. ${ETICHETE_SERVICIU[String(a.serviciu)] ?? a.serviciu}` +
          (a.judet ? ` (${a.judet})` : "") +
          ` â€” ${descriereZona(a)}`
      );
      await trimiteMesaj(chatId, "ðŸ“‹ *Abonamentele tale active:*\n\n" + randuri.join("\n"));
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/dezaboneaza") {
      if (!username) {
        await trimiteMesaj(chatId, "âš ï¸ SeteazÄƒ un @username Ã®n profilul Telegram ca sÄƒ pot gÄƒsi abonamentele tale.");
        return NextResponse.json({ ok: true });
      }
      const abonamente = await listaAbonamente();
      if (abonamente.length === 0) {
        await trimiteMesaj(chatId, "ðŸ“­ Nu ai niciun abonament activ de dezactivat.");
        return NextResponse.json({ ok: true });
      }
      const randuri = abonamente.map(
        (a, i) =>
          `${i + 1}. ${ETICHETE_SERVICIU[String(a.serviciu)] ?? a.serviciu}` +
          (a.judet ? ` (${a.judet})` : "") +
          ` â€” ${descriereZona(a)}`
      );
      await salveazaConversatie("dezaboneaza", {
        lista_ids: abonamente.map((a) => a.id),
      });
      await trimiteMesaj(
        chatId,
        "ðŸ”½ Care abonament vrei sÄƒ-l dezactivezi?\n\n" + randuri.join("\n") +
          "\n\nScrie doar numÄƒrul (sau 0 ca sÄƒ anulezi)."
      );
      return NextResponse.json({ ok: true });
    }

    if (esteComanda) {
      await trimiteMesaj(
        chatId,
        "ðŸ¤” Nu cunosc comanda asta. Scrie /comenzi ca sÄƒ vezi ce pot face."
      );
      return NextResponse.json({ ok: true });
    }

    // â”€â”€ ConversaÈ›ia Ã®n curs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { data: conv } = await supabase
      .from("telegram_conversatii")
      .select("pas, date")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (!conv) {
      // Mesaj liber fÄƒrÄƒ conversaÈ›ie activÄƒ: sugerÄƒm comenzile.
      await trimiteMesaj(chatId, "Scrie /comenzi ca sÄƒ vezi ce pot face.");
      return NextResponse.json({ ok: true });
    }

    const pas = conv.pas;
    const date = (conv.date || {}) as Record<string, unknown>;

    const anuleaza = async (motiv?: string) => {
      await stergeConversatie();
      await trimiteMesaj(chatId, motiv ? motiv : "ðŸ‘Œ Am anulat. Scrie /comenzi dacÄƒ ai nevoie de ajutor.");
    };

    if (pas === "serviciu") {
      const serviciu = gasesteServiciu(text);
      if (!serviciu) {
        await trimiteMesaj(
          chatId,
          "Nu am Ã®nÈ›eles. Alege un serviciu:",
          [["ðŸ’§ ApÄƒ (RAJA)"], ["âš¡ Energie electricÄƒ"]]
        );
        return NextResponse.json({ ok: true });
      }
      if (serviciu === "curent") {
        await salveazaConversatie("judet", { serviciu });
        await trimiteMesaj(
          chatId,
          "ðŸ“Œ ÃŽn ce judeÈ›? (ex: ConstanÈ›a, TimiÈ™, BucureÈ™ti)\n\n" +
            "Alertele de energie electricÄƒ sunt naÈ›ionale â€” localitÄƒÈ›i cu acelaÈ™i nume existÄƒ Ã®n mai multe judeÈ›e."
        );
      } else {
        await salveazaConversatie("localitate", { serviciu });
        await trimiteMesaj(
          chatId,
          "ðŸ™ï¸ ÃŽn ce localitate stai? (ex: ConstanÈ›a, Lumina, Ovidiu)"
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (pas === "judet") {
      const judet = gasesteJudet(text);
      if (!judet) {
        await trimiteMesaj(
          chatId,
          "ðŸ¤” Nu recunosc judeÈ›ul. Scrie numele complet (ex: â€žConstanÈ›aâ€ sau â€žSatu Mareâ€)."
        );
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("localitate", { ...date, judet });
      await trimiteMesaj(chatId, `ðŸ™ï¸ ÃŽn ce localitate din judeÈ›ul ${judet}?`);
      return NextResponse.json({ ok: true });
    }

    if (pas === "localitate") {
      const localitate = normalizeazaText(text);
      if (!localitate) {
        await trimiteMesaj(chatId, "Scrie numele localitÄƒÈ›ii, te rog.");
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("strada", { ...date, localitate });
      await trimiteMesaj(
        chatId,
        "ðŸ›£ï¸ Pe ce stradÄƒ (opÈ›ional)?\n\nScrie numele strÄƒzii sau â€ž-â€ dacÄƒ vrei alerte pentru toatÄƒ localitatea."
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "strada") {
      const strada = text.trim() === "-" ? "" : normalizeazaText(text);
      await salveazaConversatie("cartier", { ...date, strada });
      await trimiteMesaj(
        chatId,
        "ðŸ˜ï¸ ÃŽn ce cartier/zonÄƒ (opÈ›ional)?\n\nScrie numele sau â€ž-â€ dacÄƒ nu e cazul."
      );
      return NextResponse.json({ ok: true });
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
        (!date.strada && !cartier ? " â€” toatÄƒ localitatea" : "");
      await salveazaConversatie("confirmare", { ...date, cartier });
      await trimiteMesaj(
        chatId,
        `ðŸ“ ConfirmÄƒ abonamentul:\n\n${eticheta}\nðŸ“ ${zona}`,
        [["âœ… Da, aboneazÄƒ-mÄƒ"], ["âŒ AnuleazÄƒ"]]
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "confirmare") {
      const confirmat = /da|ok|confirm|âœ…|aboneaza/.test(textLower);
      if (!confirmat) {
        await anuleaza();
        return NextResponse.json({ ok: true });
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

      // EvitÄƒm duplicatele: acelaÈ™i serviciu + aceeaÈ™i zonÄƒ, deja activ.
      const { data: existente } = await supabase
        .from("abonamente")
        .select("id")
        .eq("tip_contact", "telegram")
        .eq("valoare_contact", `@${username}`)
        .eq("serviciu", serviciu)
        .eq("localitate_interes", abonamentNou.localitate_interes)
        .eq("strada_interes", abonamentNou.strada_interes)
        .eq("cartier_interes", abonamentNou.cartier_interes)
        .eq("activ", true)
        .limit(1);

      if ((existente || []).length > 0) {
        await anuleaza("â„¹ï¸ Ai deja un abonament identic activ â€” nu l-am dublat.");
        return NextResponse.json({ ok: true });
      }

      const { error } = await supabase.from("abonamente").insert(abonamentNou);
      if (error) {
        console.error("Eroare inserare abonament bot:", error);
        await anuleaza("âŒ Nu am reuÈ™it sÄƒ salvez abonamentul. ÃŽncearcÄƒ din nou mai tÃ¢rziu.");
        return NextResponse.json({ ok: true });
      }
      await stergeConversatie();
      const eticheta = ETICHETE_SERVICIU[serviciu] ?? serviciu;
      await trimiteMesaj(
        chatId,
        `âœ… Abonament activ!\n\n${eticheta}\nðŸ“ ${descriereZona(abonamentNou)}` +
          "\n\nVei primi aici alertele pentru zona ta. DacÄƒ nu primeÈ™ti nimic, apasÄƒ /start ca sÄƒ te reactivezi."
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "dezaboneaza") {
      const numar = parseInt(text, 10);
      const listaIds = (date.lista_ids as string[]) || [];
      if (!numar || numar < 1 || numar > listaIds.length) {
        await anuleaza("ðŸ‘Œ Am anulat dezabonarea.");
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase
        .from("abonamente")
        .update({ activ: false })
        .eq("id", listaIds[numar - 1]);
      if (error) {
        console.error("Eroare dezactivare abonament bot:", error);
        await anuleaza("âŒ Nu am reuÈ™it sÄƒ dezactivez abonamentul. ÃŽncearcÄƒ din nou.");
        return NextResponse.json({ ok: true });
      }
      await stergeConversatie();
      await trimiteMesaj(chatId, "âœ… Abonament dezactivat. Scrie /aboneaza dacÄƒ vrei altul.");
      return NextResponse.json({ ok: true });
    }

    // PaÈ™ necunoscut: resetÄƒm conversaÈ›ia.
    await anuleaza();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Telegram webhook error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
