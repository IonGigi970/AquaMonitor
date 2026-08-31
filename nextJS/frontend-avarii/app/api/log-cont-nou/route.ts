import { NextResponse } from "next/server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "AquaMonitor CT <onboarding@resend.dev>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "aquamonitorct@gmail.com";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email lipsă" }, { status: 400 });
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
          <p><b>👤 Email:</b> ${email}</p>
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
