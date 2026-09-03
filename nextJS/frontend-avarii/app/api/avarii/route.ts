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

    // Alertele active = avariile de ieri, azi și din viitor.
    // RAJA anunță deseori avarii care încep într-o zi și continuă în următoarea
    // (ex: avarie anunțată pentru 2 sept, 13:30-17:00, dar care încă afectează azi dimineață).
    // Păstrăm avarii cu data >= ieri, ca să nu dispară înainte de finalizare.
    const azi = new Date();
    const ieri = new Date(azi);
    ieri.setDate(ieri.getDate() - 1);
    const ieriStr = ieri.toISOString().slice(0, 10);
    const aziStr = azi.toISOString().slice(0, 10);

    const filtrate = (data ?? []).filter(
      (a: { data?: string | null; data_adaugarii?: string; status?: string }) => {
        // Nu afișăm avarii marcate explicit ca remediate
        if (a.status === "REMEDIAT") return false;
        // Fără dată: păstrăm doar dacă au fost adăugate azi sau ieri (sunt curente)
        if (!a.data) {
          const adaugata = a.data_adaugarii ? a.data_adaugarii.slice(0, 10) : aziStr;
          return adaugata >= ieriStr;
        }
        return a.data >= ieriStr;
      }
    );

    return NextResponse.json(filtrate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
