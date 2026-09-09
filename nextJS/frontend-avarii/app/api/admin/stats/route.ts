import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'aquamonitorct@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase());

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const email = authHeader.replace(/^Bearer\s+/i, '').trim().toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'service key missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const [
      abonamenteActive,
      abonamenteEmail,
      abonamenteTelegram,
      telegramUsers,
      abonamenteListaRaw,
    ] = await Promise.all([
      supabase.from('abonamente').select('id', { count: 'exact', head: true }).eq('activ', true),
      supabase.from('abonamente').select('id', { count: 'exact', head: true }).eq('activ', true).eq('tip_contact', 'email'),
      supabase.from('abonamente').select('valoare_contact', { count: 'exact' }).eq('activ', true).eq('tip_contact', 'telegram'),
      supabase.from('telegram_users').select('username', { count: 'exact' }),
      supabase
        .from('abonamente')
        .select('id, tip_contact, valoare_contact, serviciu, judet, localitate_interes, strada_interes, cartier_interes')
        .eq('activ', true)
        .order('valoare_contact', { ascending: true }),
    ]);

    const telegramUsernamesConfirmate = new Set(
      (telegramUsers.data ?? []).map((u: { username: string }) => u.username.toLowerCase())
    );
    const abonamenteTelegramList = abonamenteTelegram.data ?? [];
    const telegramFaraStart = abonamenteTelegramList.filter(
      (a: { valoare_contact: string }) =>
        !telegramUsernamesConfirmate.has((a.valoare_contact || '').replace(/^@/, '').toLowerCase())
    ).length;

    const abonamentiLista = (abonamenteListaRaw.data ?? []).map((a: {
      id: string;
      tip_contact: string;
      valoare_contact: string;
      serviciu: string | null;
      judet: string | null;
      localitate_interes: string;
      strada_interes: string | null;
      cartier_interes: string | null;
    }) => ({
      id: a.id,
      tipContact: a.tip_contact,
      contact: a.valoare_contact,
      serviciu: a.serviciu ?? 'apa',
      judet: a.judet,
      localitate: a.localitate_interes,
      strada: a.strada_interes,
      cartier: a.cartier_interes,
    }));

    return NextResponse.json({
      abonamente: {
        active: abonamenteActive.count ?? 0,
        email: abonamenteEmail.count ?? 0,
        telegram: abonamenteTelegramList.length,
        telegramFaraStart,
        lista: abonamentiLista,
      },
      telegram: {
        totalCuStart: telegramUsers.count ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Admin stats error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
