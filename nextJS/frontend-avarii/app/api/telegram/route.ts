import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const TELEGRAM_SECRET = cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET);

export async function POST(request: Request) {
  try {
    // Dacă e configurat un secret de webhook, validăm antetul
    if (TELEGRAM_SECRET) {
      const headerSecret = request.headers.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== TELEGRAM_SECRET) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
    }

    const update = await request.json();
    const message = update?.message || update?.edited_message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chat = message.chat;
    const user = message.from;
    const text = (message.text || '').trim().toLowerCase();

    if (!chat || !chat.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = BigInt(chat.id);
    const username = chat.username || user?.username;

    // Salvăm doar la /start (sau orice mesaj, pentru a actualiza chat_id)
    if (text === '/start' || username) {
      if (!supabaseServiceKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY lipseste');
        return NextResponse.json({ ok: false, error: 'service key missing' }, { status: 500 });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const upsertData: Record<string, unknown> = {
        chat_id: Number(chatId),
        first_seen: new Date().toISOString(),
      };

      if (chat.first_name) upsertData.first_name = chat.first_name;
      if (chat.last_name) upsertData.last_name = chat.last_name;

      if (username) {
        upsertData.username = username.toLowerCase();
        await supabase
          .from('telegram_users')
          .upsert(upsertData, { onConflict: 'username' });
      } else if (chat.id) {
        // Dacă nu avem username, upsertăm după chat_id (necesită index unic pe chat_id)
        await supabase
          .from('telegram_users')
          .upsert({ ...upsertData, username: `id_${chat.id}` }, { onConflict: 'username' });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Telegram webhook error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
