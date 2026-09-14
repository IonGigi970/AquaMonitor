import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Webhook-ul botului @JimmyWaterBot. Pe lângă activarea/dezactivarea clasică
// (/start, /stop), botul ține conversații pentru ABONAREA directă din Telegram:
//   /aboneaza  — flux: serviciu (apă / energie electrică) → județ (doar curent)
//                → localitate → stradă (opțional) → cartier (opțional) → confirmare
//   /abonamente — lista abonamentelor tale active
//   /dezaboneaza — dezactivezi un abonament după număr
//   /comenzi   — ajutor
// Starea conversației stă în tabela telegram_conversatii (serverless = fără
// memorie între apeluri). Abonamentele create au user_id NULL și sunt legate de
// utilizator prin valoare_contact (@username).

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);

const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani",
  "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj",
  "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj",
  "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți",
  "Mureș", "Neamț", "Olt", "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava",
  "Teleorman", "Timiș", "Tulcea", "Vaslui", "Vâlcea", "Vrancea",
];

const ETICHETE_SERVICIU: Record<string, string> = {
  apa: "💧 Apă (RAJA)",
  curent: "⚡ Energie electrică",
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
  if (t.includes("apa") || t === "1" || t.includes("💧")) return "apa";
  if (t.includes("energie") || t.includes("curent") || t.includes("electric") || t === "2" || t.includes("⚡")) return "curent";
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
  if (!ab.strada_interes && !ab.cartier_interes) bucati.push("toată localitatea");
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

    // ── Comenzi globale ──────────────────────────────────────────────────────
    const esteDezabonare = ["/stop", "/dezabonare", "stop", "dezabonare"].includes(textLower);
    if (esteDezabonare) {
      upsertData.activ = false;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
      await stergeConversatie();
      await trimiteMesaj(chatId, "🔕 Notificările sunt oprite. Când vrei să reprimești alertele, scrie /start.");
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/start") {
      upsertData.activ = true;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
      await stergeConversatie();
      const salut =
        "👋 Salut! Te-ai reactivat — alertele tale îți vor ajunge din nou aici.\n\n" +
        "Comenzile mele:\n" +
        "/aboneaza — abonament nou (apă sau energie electrică)\n" +
        "/abonamente — vezi abonamentele active\n" +
        "/dezaboneaza — dezactivezi un abonament\n" +
        "/comenzi — această listă\n" +
        "/stop — oprește toate notificările";
      await trimiteMesaj(chatId, salut);
      return NextResponse.json({ ok: true });
    }

    // Orice alt mesaj cu username = utilizator activ (comportamentul existent).
    if (username || chat.username) {
      upsertData.activ = true;
      await supabase.from("telegram_users").upsert(upsertData, { onConflict: "username" });
    }

    const esteComanda = text.startsWith("/");

    // ── Comenzi noi ──────────────────────────────────────────────────────────
    if (textLower === "/comenzi" || textLower === "/help" || textLower === "/ajutor") {
      const ajutor =
        "📋 *Comenzi*\n\n" +
        "/aboneaza — abonament nou (apă sau energie electrică)\n" +
        "/abonamente — vezi abonamentele active\n" +
        "/dezaboneaza — dezactivezi un abonament\n" +
        "/start — reactivează notificările\n" +
        "/stop — oprește toate notificările";
      await trimiteMesaj(chatId, ajutor);
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/aboneaza") {
      if (!username) {
        await trimiteMesaj(
          chatId,
          "⚠️ Nu am găsit un @username la contul tău.\n" +
            "Deschide Telegram → Settings → Edit profile și setează un Username, apoi încearcă din nou /aboneaza."
        );
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("serviciu", {});
      await trimiteMesaj(
        chatId,
        "🛎️ Pentru ce serviciu vrei alerte?",
        [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]
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
        await trimiteMesaj(chatId, "⚠️ Setează un @username în profilul Telegram ca să pot găsi abonamentele tale.");
        return NextResponse.json({ ok: true });
      }
      const abonamente = await listaAbonamente();
      if (abonamente.length === 0) {
        await trimiteMesaj(
          chatId,
          "📭 Nu ai niciun abonament activ. Scrie /aboneaza ca să adaugi unul."
        );
        return NextResponse.json({ ok: true });
      }
      const randuri = abonamente.map(
        (a, i) =>
          `${i + 1}. ${ETICHETE_SERVICIU[String(a.serviciu)] ?? a.serviciu}` +
          (a.judet ? ` (${a.judet})` : "") +
          ` — ${descriereZona(a)}`
      );
      await trimiteMesaj(chatId, "📋 *Abonamentele tale active:*\n\n" + randuri.join("\n"));
      return NextResponse.json({ ok: true });
    }

    if (textLower === "/dezaboneaza") {
      if (!username) {
        await trimiteMesaj(chatId, "⚠️ Setează un @username în profilul Telegram ca să pot găsi abonamentele tale.");
        return NextResponse.json({ ok: true });
      }
      const abonamente = await listaAbonamente();
      if (abonamente.length === 0) {
        await trimiteMesaj(chatId, "📭 Nu ai niciun abonament activ de dezactivat.");
        return NextResponse.json({ ok: true });
      }
      const randuri = abonamente.map(
        (a, i) =>
          `${i + 1}. ${ETICHETE_SERVICIU[String(a.serviciu)] ?? a.serviciu}` +
          (a.judet ? ` (${a.judet})` : "") +
          ` — ${descriereZona(a)}`
      );
      await salveazaConversatie("dezaboneaza", {
        lista_ids: abonamente.map((a) => a.id),
      });
      await trimiteMesaj(
        chatId,
        "🔽 Care abonament vrei să-l dezactivezi?\n\n" + randuri.join("\n") +
          "\n\nScrie doar numărul (sau 0 ca să anulezi)."
      );
      return NextResponse.json({ ok: true });
    }

    if (esteComanda) {
      await trimiteMesaj(
        chatId,
        "🤔 Nu cunosc comanda asta. Scrie /comenzi ca să vezi ce pot face."
      );
      return NextResponse.json({ ok: true });
    }

    // ── Conversația în curs ──────────────────────────────────────────────────
    const { data: conv } = await supabase
      .from("telegram_conversatii")
      .select("pas, date")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (!conv) {
      // Mesaj liber fără conversație activă: sugerăm comenzile.
      await trimiteMesaj(chatId, "Scrie /comenzi ca să vezi ce pot face.");
      return NextResponse.json({ ok: true });
    }

    const pas = conv.pas;
    const date = (conv.date || {}) as Record<string, unknown>;

    const anuleaza = async (motiv?: string) => {
      await stergeConversatie();
      await trimiteMesaj(chatId, motiv ? motiv : "👌 Am anulat. Scrie /comenzi dacă ai nevoie de ajutor.");
    };

    if (pas === "serviciu") {
      const serviciu = gasesteServiciu(text);
      if (!serviciu) {
        await trimiteMesaj(
          chatId,
          "Nu am înțeles. Alege un serviciu:",
          [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]
        );
        return NextResponse.json({ ok: true });
      }
      if (serviciu === "curent") {
        await salveazaConversatie("judet", { serviciu });
        await trimiteMesaj(
          chatId,
          "📌 În ce județ? (ex: Constanța, Timiș, București)\n\n" +
            "Alertele de energie electrică sunt naționale — localități cu același nume există în mai multe județe."
        );
      } else {
        await salveazaConversatie("localitate", { serviciu });
        await trimiteMesaj(
          chatId,
          "🏙️ În ce localitate stai? (ex: Constanța, Lumina, Ovidiu)"
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (pas === "judet") {
      const judet = gasesteJudet(text);
      if (!judet) {
        await trimiteMesaj(
          chatId,
          "🤔 Nu recunosc județul. Scrie numele complet (ex: „Constanța” sau „Satu Mare”)."
        );
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("localitate", { ...date, judet });
      await trimiteMesaj(chatId, `🏙️ În ce localitate din județul ${judet}?`);
      return NextResponse.json({ ok: true });
    }

    if (pas === "localitate") {
      const localitate = normalizeazaText(text);
      if (!localitate) {
        await trimiteMesaj(chatId, "Scrie numele localității, te rog.");
        return NextResponse.json({ ok: true });
      }
      await salveazaConversatie("strada", { ...date, localitate });
      await trimiteMesaj(
        chatId,
        "🛣️ Pe ce stradă (opțional)?\n\nScrie numele străzii sau „-” dacă vrei alerte pentru toată localitatea."
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "strada") {
      const strada = text.trim() === "-" ? "" : normalizeazaText(text);
      await salveazaConversatie("cartier", { ...date, strada });
      await trimiteMesaj(
        chatId,
        "🏘️ În ce cartier/zonă (opțional)?\n\nScrie numele sau „-” dacă nu e cazul."
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
        (!date.strada && !cartier ? " — toată localitatea" : "");
      await salveazaConversatie("confirmare", { ...date, cartier });
      await trimiteMesaj(
        chatId,
        `📝 Confirmă abonamentul:\n\n${eticheta}\n📍 ${zona}`,
        [["✅ Da, abonează-mă"], ["❌ Anulează"]]
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "confirmare") {
      const confirmat = /da|ok|confirm|✅|aboneaza/.test(textLower);
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

      // Evităm duplicatele: același serviciu + aceeași zonă, deja activ.
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
        await anuleaza("ℹ️ Ai deja un abonament identic activ — nu l-am dublat.");
        return NextResponse.json({ ok: true });
      }

      const { error } = await supabase.from("abonamente").insert(abonamentNou);
      if (error) {
        console.error("Eroare inserare abonament bot:", error);
        await anuleaza("❌ Nu am reușit să salvez abonamentul. Încearcă din nou mai târziu.");
        return NextResponse.json({ ok: true });
      }
      await stergeConversatie();
      const eticheta = ETICHETE_SERVICIU[serviciu] ?? serviciu;
      await trimiteMesaj(
        chatId,
        `✅ Abonament activ!\n\n${eticheta}\n📍 ${descriereZona(abonamentNou)}` +
          "\n\nVei primi aici alertele pentru zona ta. Dacă nu primești nimic, apasă /start ca să te reactivezi."
      );
      return NextResponse.json({ ok: true });
    }

    if (pas === "dezaboneaza") {
      const numar = parseInt(text, 10);
      const listaIds = (date.lista_ids as string[]) || [];
      if (!numar || numar < 1 || numar > listaIds.length) {
        await anuleaza("👌 Am anulat dezabonarea.");
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase
        .from("abonamente")
        .update({ activ: false })
        .eq("id", listaIds[numar - 1]);
      if (error) {
        console.error("Eroare dezactivare abonament bot:", error);
        await anuleaza("❌ Nu am reușit să dezactivez abonamentul. Încearcă din nou.");
        return NextResponse.json({ ok: true });
      }
      await stergeConversatie();
      await trimiteMesaj(chatId, "✅ Abonament dezactivat. Scrie /aboneaza dacă vrei altul.");
      return NextResponse.json({ ok: true });
    }

    // Paș necunoscut: resetăm conversația.
    await anuleaza();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Telegram webhook error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
