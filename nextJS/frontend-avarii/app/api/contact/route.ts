import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/env';

// Trimite un mesaj prin formularul de contact. Public — oricine poate scrie.
// Protecție anti-spam minimă: nume/email/subiect/mesaj validate și cel mult
// 10 mesaje pe oră de pe aceeași adresă IP.

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

const LIMITA_PE_ORA = 10;

function extrageIP(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '';
}

function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function POST(request: Request) {
  if (!supabaseServiceKey) {
    return NextResponse.json({ error: 'service key missing' }, { status: 500 });
  }

  let corp: unknown;
  try {
    corp = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalid' }, { status: 400 });
  }

  const { nume, email, subiect, mesaj } = (corp ?? {}) as Record<string, unknown>;
  if (typeof nume !== 'string' || !nume.trim() || nume.trim().length > 100) {
    return NextResponse.json({ error: 'Numele este obligatoriu (max. 100 caractere).' }, { status: 400 });
  }
  if (typeof email !== 'string' || !emailValid(email.trim())) {
    return NextResponse.json({ error: 'Adresa de email nu este validă.' }, { status: 400 });
  }
  if (typeof subiect !== 'string' || !subiect.trim() || subiect.trim().length > 200) {
    return NextResponse.json({ error: 'Subiectul este obligatoriu (max. 200 caractere).' }, { status: 400 });
  }
  if (typeof mesaj !== 'string' || !mesaj.trim() || mesaj.trim().length > 2000) {
    return NextResponse.json({ error: 'Mesajul este obligatoriu (max. 2000 caractere).' }, { status: 400 });
  }

  const ip = extrageIP(request);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (ip) {
      const deAcumOra = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await supabase
        .from('mesaje_contact')
        .select('id', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('creat_la', deAcumOra);
      if ((count ?? 0) >= LIMITA_PE_ORA) {
        return NextResponse.json({ error: 'Prea multe mesaje trimise. Încearcă mai târziu.' }, { status: 429 });
      }
    }

    const { error } = await supabase.from('mesaje_contact').insert({
      nume: nume.trim(),
      email: email.trim(),
      subiect: subiect.trim(),
      mesaj: mesaj.trim(),
      ip,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
