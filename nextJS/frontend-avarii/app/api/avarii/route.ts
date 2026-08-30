import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('avarii')
      .select('*')
      .order('data_adaugarii', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Alertele zilei = avariile din ziua curentă + cele din viitor.
    // Avariile fără dată (null) le păstrăm pentru compatibilitate.
    const azi = new Date().toISOString().slice(0, 10);
    const filtrate = (data ?? []).filter(
      (a: { data?: string | null }) => !a.data || a.data >= azi
    );

    return NextResponse.json(filtrate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
