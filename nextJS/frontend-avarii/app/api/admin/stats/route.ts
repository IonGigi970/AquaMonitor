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

    // "Avarii active" = avariile zilei curente (fusul orar al României),
    // aceleași ca cele afișate pe site.
    const aziStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [
      avariiActive,
      avariiTotal,
      abonamenteActive,
      abonamenteEmail,
      abonamenteTelegram,
      telegramUsers,
      notificariTrimise,
      utilizatori,
    ] = await Promise.all([
      supabase.from('avarii').select('id', { count: 'exact', head: true }).eq('data', aziStr).neq('status', 'REMEDIAT'),
      supabase.from('avarii').select('id', { count: 'exact', head: true }),
      supabase.from('abonamente').select('id', { count: 'exact', head: true }).eq('activ', true),
      supabase.from('abonamente').select('id', { count: 'exact', head: true }).eq('activ', true).eq('tip_contact', 'email'),
      supabase.from('abonamente').select('valoare_contact', { count: 'exact' }).eq('activ', true).eq('tip_contact', 'telegram'),
      supabase.from('telegram_users').select('username', { count: 'exact' }),
      supabase.from('notificari_trimise').select('id', { count: 'exact', head: true }),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    const telegramUsernamesConfirmate = new Set(
      (telegramUsers.data ?? []).map((u: { username: string }) => u.username.toLowerCase())
    );
    const abonamenteTelegramList = abonamenteTelegram.data ?? [];
    const telegramFaraStart = abonamenteTelegramList.filter(
      (a: { valoare_contact: string }) =>
        !telegramUsernamesConfirmate.has((a.valoare_contact || '').replace(/^@/, '').toLowerCase())
    ).length;

    // Distribuție avarii active pe status
    const { data: avariiPeStatus } = await supabase
      .from('avarii')
      .select('status')
      .eq('data', aziStr)
      .neq('status', 'REMEDIAT');
    const distributieStatus: Record<string, number> = {};
    (avariiPeStatus ?? []).forEach((a: { status: string }) => {
      distributieStatus[a.status] = (distributieStatus[a.status] || 0) + 1;
    });

    // Distribuție avarii active pe localitate (top 5)
    const { data: avariiPeLocalitate } = await supabase
      .from('avarii')
      .select('localitate')
      .eq('data', aziStr)
      .neq('status', 'REMEDIAT');
    const distributieLocalitate: Record<string, number> = {};
    (avariiPeLocalitate ?? []).forEach((a: { localitate: string }) => {
      distributieLocalitate[a.localitate] = (distributieLocalitate[a.localitate] || 0) + 1;
    });
    const topLocalitati = Object.entries(distributieLocalitate)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return NextResponse.json({
      avarii: {
        active: avariiActive.count ?? 0,
        total: avariiTotal.count ?? 0,
        peStatus: distributieStatus,
        topLocalitati,
      },
      abonamente: {
        active: abonamenteActive.count ?? 0,
        email: abonamenteEmail.count ?? 0,
        telegram: abonamenteTelegramList.length,
        telegramFaraStart,
      },
      telegram: {
        totalCuStart: telegramUsers.count ?? 0,
      },
      notificari: {
        totalTrimise: notificariTrimise.count ?? 0,
      },
      utilizatori: {
        totalConturi: utilizatori.data?.users?.length ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Admin stats error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
