"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Abonament {
  id: string;
  tip_contact: string;
  valoare_contact: string;
  localitate_interes: string;
  strada_interes?: string | null;
}

const ETICHETE_CANAL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

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

  return (
    <div className="space-y-3">
      {abonamente.map((abonament) => (
        <div
          key={abonament.id}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div>
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700 mb-2">
              {ETICHETE_CANAL[abonament.tip_contact] ?? abonament.tip_contact}
            </span>
            <p className="text-sm font-semibold text-slate-800">{abonament.valoare_contact}</p>
            <p className="text-sm text-slate-500">
              {abonament.localitate_interes}
              {abonament.strada_interes ? ` — ${abonament.strada_interes}` : ""}
            </p>
          </div>
          <button
            onClick={() => handleDezabonare(abonament.id)}
            disabled={seSterge === abonament.id}
            className="self-start md:self-center bg-red-100 text-red-600 font-semibold px-4 py-2 rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {seSterge === abonament.id ? "Se șterge..." : "Dezabonare"}
          </button>
        </div>
      ))}
    </div>
  );
}
