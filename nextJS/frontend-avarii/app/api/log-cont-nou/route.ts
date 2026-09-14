import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "AquaMonitor CT <onboarding@resend.dev>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "aquamonitorct@gmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (caracter) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caracter] as string
  );
}

/**
 * Confirmă că respectivul cont chiar există, folosind ID-ul primit de la signUp.
 * Endpointul e public (e apelat imediat după înregistrare), deci fără verificarea
 * asta oricine putea declanșa nelimitat emailuri de „cont nou" către admin.
 */
async function contExista(email: string, userId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  return (data.user.email || "").toLowerCase() === email;
}

export async function POST(request: Request) {
  try {
    const { email, userId } = await request.json();

    if (typeof email !== "string" || typeof userId !== "string" || !email || !userId) {
      return NextResponse.json({ error: "Date lipsă" }, { status: 400 });
    }

    const adresa = email.trim().toLowerCase();

    // Dacă nu e un cont real, răspundem cu succes (ca să nu oferim un oracol care
    // spune dacă o adresă are cont pe site), dar nu trimitem nimic.
    if (!(await contExista(adresa, userId))) {
      return NextResponse.json({ ok: true });
    }

    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: "Resend neconfigurat" }, { status: 500 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject: "🆕 Cont nou creat — AquaMonitor CT",
        html: `
          <p><b>Un cont nou a fost creat pe AquaMonitor CT.</b></p>
          <p><b>👤 Email:</b> ${escapeHtml(adresa)}</p>
          <p><b>🕒 Data:</b> ${new Date().toLocaleString("ro-RO")}</p>
        `,
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Eroare la trimitere" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 });
  }
}
