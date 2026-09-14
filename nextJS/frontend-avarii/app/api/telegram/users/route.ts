import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { esteAdmin } from '@/lib/admin';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET() {
  try {
    // Doar administratorul autentificat (sesiune Supabase) vede lista.
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'service key missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('telegram_users')
      .select('username, chat_id, first_seen, first_name, last_name, activ')
      .order('first_seen', { ascending: false });

    if (error) {
      console.error('Telegram users error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
