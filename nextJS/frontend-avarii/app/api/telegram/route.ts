import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cleanEnv } from "@/lib/env";
import { executaComenzi, executaComenziGlobale } from "@/lib/telegram/comenzi";
import { continuaConversatia } from "@/lib/telegram/conversatie";
import { pregatesteUtilizator, salveazaUtilizator } from "@/lib/telegram/stocare";

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
//
// Logica stă în module separate (lib/telegram/): comenzile în comenzi.ts, pașii
// conversației în conversatie.ts, accesul la baza de date în stocare.ts, textele
// și căutările în text.ts, trimiterea mesajelor în api.ts. Aici doar primim
// update-ul de la Telegram, verificăm secretul și delegăm.

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
  try {
    // Secretul webhook-ului: Telegram îl trimite în antetul
    // X-Telegram-Bot-Api-Secret-Token, dar doar dacă webhook-ul a fost înregistrat
    // CU secret_token (vezi set_webhook.py). Verificarea se face doar când
    // variabila e configurată, ca să nu rupă botul dacă lipsește din mediu.
    // ATENȚIE la ordinea de activare: întâi se înregistrează webhook-ul cu
    // secret (set_webhook.py), apoi se setează TELEGRAM_WEBHOOK_SECRET în Vercel.
    const webhookSecret = cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (webhookSecret) {
      const primit = request.headers.get('x-telegram-bot-api-secret-token') || '';
      if (primit !== webhookSecret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

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

    const dateUtilizator = pregatesteUtilizator(chat, username);
    const ctx = { supabase, chatId, username, text, textLower };

    // /stop și /start decid starea „activ" și se tratează primele.
    if (await executaComenziGlobale(ctx, dateUtilizator)) {
      return NextResponse.json({ ok: true });
    }

    // Orice alt mesaj cu username = utilizator activ (comportamentul existent).
    if (username || chat.username) {
      await salveazaUtilizator(supabase, dateUtilizator, true);
    }

    if (await executaComenzi(ctx)) {
      return NextResponse.json({ ok: true });
    }

    await continuaConversatia(ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Telegram webhook error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
