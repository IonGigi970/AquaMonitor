import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanEnv } from "@/lib/env";

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

// Dezabonare de la o alertă, cu sincronizare Telegram:
// - șterge abonamentul (după verificarea că aparține utilizatorului autentificat);
// - dacă e un abonament Telegram și nu mai rămâne niciun abonament Telegram activ
//   pentru acel username, utilizatorul Telegram devine inactiv (nu mai primește
//   nimic) — aceeași stare pe care o vede adminul în lista „Utilizatori Telegram".
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
    }

    let abonamentId: unknown;
    try {
      const corp = await request.json();
      abonamentId = corp?.abonament_id;
    } catch {
      return NextResponse.json({ error: "Corp JSON invalid" }, { status: 400 });
    }
    if (typeof abonamentId !== "string" || !abonamentId) {
      return NextResponse.json({ error: "abonament_id lipsă" }, { status: 400 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "service key missing" }, { status: 500 });
    }
    const admin = createServiceClient(supabaseUrl, supabaseServiceKey);

    const { data: abonament, error: eroareAbonament } = await admin
      .from("abonamente")
      .select("id, user_id, tip_contact, valoare_contact")
      .eq("id", abonamentId)
      .maybeSingle();

    if (eroareAbonament || !abonament) {
      return NextResponse.json({ error: "Abonamentul nu există" }, { status: 404 });
    }
    if (abonament.user_id !== user.id) {
      return NextResponse.json({ error: "Abonamentul nu-ți aparține" }, { status: 403 });
    }

    const { error: eroareStergere } = await admin
      .from("abonamente")
      .delete()
      .eq("id", abonamentId);
    if (eroareStergere) {
      return NextResponse.json({ error: eroareStergere.message }, { status: 500 });
    }

    if (abonament.tip_contact === "telegram" && abonament.valoare_contact) {
      const username = abonament.valoare_contact.replace(/^@/, "").toLowerCase();
      const { data: ramase } = await admin
        .from("abonamente")
        .select("id")
        .eq("tip_contact", "telegram")
        .eq("valoare_contact", `@${username}`)
        .eq("activ", true)
        .limit(1);
      if (!ramase || ramase.length === 0) {
        await admin.from("telegram_users").update({ activ: false }).eq("username", username);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
