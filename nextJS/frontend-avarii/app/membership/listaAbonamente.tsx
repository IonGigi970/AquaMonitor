"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formateazaText } from "@/lib/format";

interface Abonament {
  id: string;
  serviciu?: string | null;
  judet?: string | null;
  tip_contact: string;
  valoare_contact: string;
  localitate_interes: string;
  strada_interes?: string | null;
  cartier_interes?: string | null;
}

const ETICHETE_CANAL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

const ETICHETE_SERVICIU: Record<string, { eticheta: string; clase: string }> = {
  apa: { eticheta: "💧 Apă", clase: "bg-sky-100 text-sky-700" },
  curent: { eticheta: "⚡ Energie electrică", clase: "bg-amber-100 text-amber-700" },
};

function BadgeServiciu({ serviciu }: { serviciu?: string | null }) {
  const config = ETICHETE_SERVICIU[serviciu ?? "apa"] ?? ETICHETE_SERVICIU.apa;
  return (
    <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${config.clase} mb-2`}>
      {config.eticheta}
    </span>
  );
}

function StatusTelegram({ username }: { username: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [activ, setActiv] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/telegram/check?username=${encodeURIComponent(username.replace(/^@/, ""))}`)
      .then((r) => r.json())
      .then((data) => {
        setActiv(data.activ ?? null);
        setStatus(data.found ? "ok" : "missing");
      })
      .catch(() => setStatus("error"));
  }, [username]);

  if (status === "loading") return <span className="text-xs text-slate-400">se verifică...</span>;
  if (status === "error") return <span className="text-xs text-red-500">eroare verificare</span>;
  if (status === "ok" && activ === false)
    return <span className="text-xs font-semibold text-slate-500">⛔ Notificările sunt dezactivate</span>;
  if (status === "ok")
    return <span className="text-xs font-semibold text-emerald-600">✅ Botul te recunoaște</span>;
  return (
    <span className="text-xs text-orange-600">
      ⚠️ Nu ai apăsat /start în <b>@JimmyWaterBot</b>
    </span>
  );
}

export default function ListaAbonamente({
  abonamente,
  userId,
}: {
  abonamente: Abonament[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [seSterge, setSeSterge] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    Record<string, "trimite" | "gata" | "eroare" | undefined>
  >({});
  const [seTrimiteTest, setSeTrimiteTest] = useState<string | null>(null);

  const handleDezabonare = async (id: string) => {
    setSeSterge(id);

    const { error } = await supabase
      .from("abonamente")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    setSeSterge(null);

    if (error) {
      console.error(error);
      alert("Nu s-a putut șterge abonamentul. Încearcă din nou.");
      return;
    }

    router.refresh();
  };

  const handleTrimiteTest = async (id: string) => {
    if (seTrimiteTest) return;
    setSeTrimiteTest(id);
    setTestStatus((prev) => ({ ...prev, [id]: "trimite" }));

    try {
      const raspuns = await fetch("/api/test-notificare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abonament_id: id }),
      });
      const date = await raspuns.json().catch(() => ({}));

      if (!raspuns.ok) {
        setTestStatus((prev) => ({ ...prev, [id]: "eroare" }));
        console.error(date);
        return;
      }

      setTestStatus((prev) => ({ ...prev, [id]: "gata" }));
      setTimeout(() => {
        setTestStatus((prev) => ({ ...prev, [id]: undefined }));
      }, 8000);
    } catch {
      setTestStatus((prev) => ({ ...prev, [id]: "eroare" }));
    } finally {
      setSeTrimiteTest(null);
    }
  };

  return (
    <div className="space-y-3">
      {abonamente.map((abonament) => {
        const testare = testStatus[abonament.id];
        return (
          <div
            key={abonament.id}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <BadgeServiciu serviciu={abonament.serviciu} />
              {abonament.judet && (
                <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-violet-100 text-violet-700">
                  {formateazaText(abonament.judet)}
                </span>
              )}
              <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                {ETICHETE_CANAL[abonament.tip_contact] ?? abonament.tip_contact}
              </span>
            </div>
              <p className="text-sm font-semibold text-slate-800">{abonament.valoare_contact}</p>
              {abonament.tip_contact === "telegram" && abonament.valoare_contact && (
                <div className="mt-1">
                  <StatusTelegram username={abonament.valoare_contact} />
                </div>
              )}
              <p className="text-sm text-slate-500">
                {formateazaText(abonament.localitate_interes)}
                {abonament.strada_interes ? ` — ${formateazaText(abonament.strada_interes)}` : ""}
                {abonament.cartier_interes ? ` — ${formateazaText(abonament.cartier_interes)}` : ""}
              </p>
              {testare === "gata" && (
                <p className="text-xs font-semibold text-emerald-600 mt-1">
                  ✅ Notificarea de test e în curs de trimitere — verifică-ți{" "}
                  {abonament.tip_contact === "telegram" ? "Telegram" : "emailul"} în ~1-2 minute.
                </p>
              )}
              {testare === "eroare" && (
                <p className="text-xs font-semibold text-red-600 mt-1">
                  ❌ Nu s-a putut trimite testul. Încearcă din nou în câteva minute.
                </p>
              )}
            </div>
            <div className="flex gap-2 self-start md:self-center">
              <button
                onClick={() => handleTrimiteTest(abonament.id)}
                disabled={seTrimiteTest === abonament.id || !!seSterge}
                className="bg-blue-100 text-blue-700 font-semibold px-4 py-2 rounded-xl hover:bg-blue-200 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {seTrimiteTest === abonament.id ? "Se trimite..." : "Trimite notificare de test"}
              </button>
              <button
                onClick={() => handleDezabonare(abonament.id)}
                disabled={seSterge === abonament.id || !!seTrimiteTest}
                className="bg-red-100 text-red-600 font-semibold px-4 py-2 rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {seSterge === abonament.id ? "Se șterge..." : "Dezabonare"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
