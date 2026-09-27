import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { esteAdmin } from '@/lib/admin';
import { cleanEnv } from "@/lib/env";


const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'service key missing' }, { status: 500 });
    }

    const body = await request.json();
    const username = (body?.username || '').replace(/^@/, '').trim().toLowerCase();
    const activ = typeof body?.activ === 'boolean' ? body.activ : undefined;

    if (!username || activ === undefined) {
      return NextResponse.json({ error: 'username si activ sunt obligatorii' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('telegram_users')
      .update({ activ })
      .eq('username', username)
      .select('username, chat_id, activ, first_seen')
      .single();

    if (error) {
      console.error('Telegram toggle error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sincronizare cu „Alertele mele": abonamentele Telegram ale utilizatorului
    // urmează starea utilizatorului. Dezactivat → toate abonamentele Telegram
    // devin inactive (dispar din lista utilizatorului); reactivat → reapar.
    const { error: eroareAbonamente } = await supabase
      .from('abonamente')
      .update({ activ })
      .eq('tip_contact', 'telegram')
      .eq('valoare_contact', `@${username}`);

    if (eroareAbonamente) {
      console.error('Telegram toggle abonamente error:', eroareAbonamente.message);
      return NextResponse.json({ error: eroareAbonamente.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
