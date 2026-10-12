import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { esteAdmin } from '@/lib/admin';
import { cleanEnv } from '@/lib/env';

// Mesajele din formularul de contact, văzute de admin: GET listează,
// POST marchează un mesaj ca procesat.

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET() {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'service key missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('mesaje_contact')
      .select('id, nume, email, subiect, mesaj, procesat, creat_la')
      .order('creat_la', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Expune creat_la ca text local, simplu pentru afișare.
    const mesaje = (data ?? []).map((m) => ({
      id: m.id,
      nume: m.nume,
      email: m.email,
      subiect: m.subiect,
      mesaj: m.mesaj,
      procesat: m.procesat,
      creatLa: m.creat_la,
    }));

    return NextResponse.json({ mesaje });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'service key missing' }, { status: 500 });
    }

    let id: unknown;
    try {
      const corp = await request.json();
      id = corp?.id;
    } catch {
      return NextResponse.json({ error: 'JSON invalid' }, { status: 400 });
    }
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id lipsă' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase
      .from('mesaje_contact')
      .update({ procesat: true })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
