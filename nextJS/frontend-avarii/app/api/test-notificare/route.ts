import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Declanșează workflow-ul GitHub Actions al scraper-ului în modul "test":
// trimite o notificare de test către abonamentul cerut (același mecanism de
// dispatch ca /api/cron/trigger-scraper, dar cu input-ul notificare_test_abonament).

const GITHUB_OWNER = "IonGigi970";
const GITHUB_REPO = "AquaMonitor";
const GITHUB_WORKFLOW_FILE = "scraper.yml";

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  // Abonamentul trebuie să existe și să aparțină utilizatorului autentificat
  // (politica RLS permite oricum doar rândurile proprii, verificăm și explicit).
  const { data: abonament, error: eroareAbonament } = await supabase
    .from("abonamente")
    .select("id, activ")
    .eq("id", abonamentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (eroareAbonament || !abonament) {
    return NextResponse.json({ error: "Abonamentul nu există sau nu-ți aparține" }, { status: 404 });
  }
  if (!abonament.activ) {
    return NextResponse.json({ error: "Abonamentul e inactiv" }, { status: 400 });
  }

  const githubToken = cleanEnv(process.env.GH_TOKEN);
  if (!githubToken) {
    return NextResponse.json(
      { error: "GH_TOKEN nu e configurat in Vercel" },
      { status: 500 }
    );
  }

  const githubResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { notificare_test_abonament: abonamentId },
      }),
    }
  );

  if (!githubResponse.ok) {
    const textEroare = await githubResponse.text();
    return NextResponse.json(
      { error: "GitHub a refuzat declanșarea", status: githubResponse.status, detaliu: textEroare },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    mesaj:
      "Notificarea de test e în curs de trimitere — verifică emailul/Telegram în ~1-2 minute.",
  });
}
