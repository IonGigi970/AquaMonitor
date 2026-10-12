import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { esteAdmin } from "@/lib/admin";
import { cleanEnv } from "@/lib/env";

// Zonele distincte (ex: "ct tomis nord") stau în baza de date ca să poată fi
// editate din UI fără deploy. GET listează, POST adaugă, DELETE șterge.
// Scrierea se face cu cheia service_role (trece peste RLS), exact ca scraperul.

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);


function normalizeaza(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function GET() {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "service key missing" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from("zone_distincte")
      .select("id, text")
      .order("text", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ zone: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "service key missing" }, { status: 500 });
    }

    let text: unknown;
    try {
      const corp = await request.json();
      text = corp?.text;
    } catch {
      return NextResponse.json({ error: "JSON invalid" }, { status: 400 });
    }
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text lipsă" }, { status: 400 });
    }

    const normalizat = normalizeaza(text);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase
      .from("zone_distincte")
      .insert({ text: normalizat });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await esteAdmin())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "service key missing" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id lipsă" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase.from("zone_distincte").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
