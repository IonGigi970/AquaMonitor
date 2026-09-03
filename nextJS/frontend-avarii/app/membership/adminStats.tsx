"use client";

import { useEffect, useState } from "react";
import { formateazaText } from "@/lib/format";

interface Stats {
  avarii: {
    active: number;
    total: number;
    peStatus: Record<string, number>;
    topLocalitati: [string, number][];
  };
  abonamente: {
    active: number;
    email: number;
    telegram: number;
    telegramFaraStart: number;
  };
  telegram: {
    totalCuStart: number;
  };
  notificari: {
    totalTrimise: number;
  };
  utilizatori: {
    totalConturi: number;
  };
}

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
        <Card titlu="Avarii active" valoare={stats.avarii.active} culoare="text-red-600" />
        <Card titlu="Avarii total (istoric)" valoare={stats.avarii.total} />
        <Card titlu="Conturi înregistrate" valoare={stats.utilizatori.totalConturi} />
        <Card titlu="Abonamente active" valoare={stats.abonamente.active} culoare="text-blue-600" />
        <Card titlu="Abonamente Email" valoare={stats.abonamente.email} />
        <Card titlu="Abonamente Telegram" valoare={stats.abonamente.telegram} />
        <Card
          titlu="Telegram fără /start"
          valoare={stats.abonamente.telegramFaraStart}
          culoare={stats.abonamente.telegramFaraStart > 0 ? "text-orange-600" : "text-emerald-600"}
        />
        <Card titlu="Notificări trimise (total)" valoare={stats.notificari.totalTrimise} />
      </div>

      {Object.keys(stats.avarii.peStatus).length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-sm font-semibold text-slate-700 mb-2">Avarii active pe status</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.avarii.peStatus).map(([status, nr]) => (
              <span key={status} className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                {status}: {nr}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.avarii.topLocalitati.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-sm font-semibold text-slate-700 mb-2">Top localități afectate acum</p>
          <div className="space-y-1">
            {stats.avarii.topLocalitati.map(([localitate, nr]) => (
              <div key={localitate} className="flex justify-between text-sm text-slate-600">
                <span>{formateazaText(localitate)}</span>
                <span className="font-semibold">{nr}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
