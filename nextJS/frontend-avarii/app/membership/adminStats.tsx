"use client";

import { useEffect, useState } from "react";
import { formateazaText } from "@/lib/format";

interface AbonamentRand {
  id: string;
  tipContact: string;
  contact: string;
  serviciu: string;
  judet: string | null;
  localitate: string;
  strada: string | null;
  cartier: string | null;
}

interface Stats {
  abonamente: {
    active: number;
    email: number;
    telegram: number;
    telegramFaraStart: number;
    lista: AbonamentRand[];
  };
  telegram: {
    totalCuStart: number;
  };
}

const ETICHETE_CANAL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

const ETICHETE_SERVICIU: Record<string, string> = {
  apa: "💧 Apă",
  curent: "⚡ Energie electrică",
};

function Card({ titlu, valoare, culoare }: { titlu: string; valoare: number | string; culoare?: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200">
      <p className="text-xs text-slate-500 mb-1">{titlu}</p>
      <p className={`text-2xl font-bold ${culoare ?? "text-slate-800"}`}>{valoare}</p>
    </div>
  );
}

export default function AdminStats({ userEmail }: { userEmail: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${userEmail}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [userEmail]);

  if (error) return <p className="text-sm text-red-500">Eroare la încărcare statistici: {error}</p>;
  if (!stats) return <p className="text-sm text-slate-500">Se încarcă statisticile...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card titlu="Abonamente active" valoare={stats.abonamente.active} culoare="text-blue-600" />
        <Card titlu="Abonamente Telegram" valoare={stats.abonamente.telegram} />
        <Card titlu="Abonamente Email" valoare={stats.abonamente.email} />
        <Card
          titlu="Telegram fără /start"
          valoare={stats.abonamente.telegramFaraStart}
          culoare={stats.abonamente.telegramFaraStart > 0 ? "text-orange-600" : "text-emerald-600"}
        />
      </div>

      {stats.abonamente.lista.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 overflow-x-auto">
          <p className="text-sm font-semibold text-slate-700 mb-2">Abonați și zonele urmărite</p>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Canal</th>
                <th className="py-2 pr-3">Serviciu</th>
                <th className="py-2 pr-3">Zonă urmărită</th>
              </tr>
            </thead>
            <tbody>
              {stats.abonamente.lista.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 text-slate-800 font-medium">{a.contact}</td>
                  <td className="py-2 pr-3 text-slate-600">{ETICHETE_CANAL[a.tipContact] ?? a.tipContact}</td>
                  <td className="py-2 pr-3 text-slate-600">{ETICHETE_SERVICIU[a.serviciu] ?? a.serviciu}</td>
                  <td className="py-2 pr-3 text-slate-600">
                    {a.judet ? `${formateazaText(a.judet)} — ` : ""}
                    {formateazaText(a.localitate)}
                    {a.strada ? ` — ${formateazaText(a.strada)}` : ""}
                    {a.cartier ? ` — ${formateazaText(a.cartier)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
