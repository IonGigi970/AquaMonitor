import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase = createClient(supabaseUrl, supabaseKey);

function dataAziBucuresti(): string {
  // Data curentă în fusul orar al României (nu UTC!), format YYYY-MM-DD
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const val = (tip: string) => parti.find((x) => x.type === tip)?.value ?? "";
  return `${val("year")}-${val("month")}-${val("day")}`;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('avarii')
      .select('*')
      .order('data_adaugarii', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Afișăm DOAR avariile zilei curente (după data pentru care sunt valabile,
    // în fusul orar al României). Avariile de ieri sau mai vechi nu se mai afișează
    // nici în listă, nici pe hartă; ele rămân în baza de date până la curățarea
    // automată din scraper (după mai mult de 2 zile).
    const aziStr = dataAziBucuresti();

    const filtrate = (data ?? []).filter(
      (a: { data?: string | null; data_adaugarii?: string; status?: string }) => {
        // Nu afișăm avarii marcate explicit ca remediate
        if (a.status === "REMEDIAT") return false;
        // Fără dată: le păstrăm doar dacă au fost adăugate azi (sunt curente)
        if (!a.data) {
          const adaugata = a.data_adaugarii ? a.data_adaugarii.slice(0, 10) : aziStr;
          return adaugata === aziStr;
        }
        return a.data === aziStr;
      }
    );

    return NextResponse.json(filtrate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
