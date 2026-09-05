import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.replace(/^@/, '').trim().toLowerCase();
    if (!username) {
      return NextResponse.json({ found: false, error: 'username missing' }, { status: 400 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ found: false, error: 'service key missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('telegram_users')
      .select('chat_id, first_seen, activ')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      console.error('Telegram check error:', error.message);
      return NextResponse.json({ found: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      found: !!data,
      activ: data?.activ ?? null,
      chat_id: data?.chat_id ?? null,
      first_seen: data?.first_seen ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ found: false, error: message }, { status: 500 });
  }
}
