"use client";

import { useEffect, useState } from "react";

interface ZonaDistincta {
  id: string;
  text: string;
}

/**
 * Gestionarea zonelor distincte (admin): cartiere/zone care încep cu un cuvânt
 * folosit și ca nume de stradă generică în altă parte a orașului, dar denumesc
 * o zonă diferită (ex: "ct tomis nord"). Ele sunt excluse de la potrivirea
 * încrucișată pe termen generic — vezi aquamonitor/utils.py.
 */
export default function AdminZoneDistincte() {
  const [zone, setZone] = useState<ZonaDistincta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let activ = true;
    fetch("/api/admin/zone-distincte")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => {
        if (activ) setZone(data.zone ?? []);
      })
      .catch((err) => {
        if (activ) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      activ = false;
    };
  }, [refresh]);

  async function adauga() {
    const valoare = text.trim();
    if (!valoare) return;
    setMesaj(null);
    setError(null);
    try {
      const r = await fetch("/api/admin/zone-distincte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: valoare }),
      });
      if (!r.ok) {
        const corp = await r.json();
        throw new Error(corp?.error ?? "Eroare la salvare");
      }
      setText("");
      setMesaj("Zonă adăugată. Se aplică de la următoarea rulare a scraperului.");
      setRefresh((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sterge(id: string) {
    setMesaj(null);
    setError(null);
    try {
      const r = await fetch(`/api/admin/zone-distincte?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const corp = await r.json();
        throw new Error(corp?.error ?? "Eroare la ștergere");
      }
      setMesaj("Zonă ștearsă.");
      setRefresh((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200">
      <p className="text-sm font-semibold text-slate-700 mb-1">Zone distincte (potrivire alerte)</p>
      <p className="text-xs text-slate-500 mb-3">
        Zonele de aici sunt excluse de la potrivirea încrucișată pe termen generic. De exemplu,
        cartierul ct tomis nord este diferit de strada Tomis — un abonat pe Tomis nu primește
        alerte pentru Tomis Nord. Scrie-le normalizat (fără diacritice, litere mici).
      </p>

      {error && <p className="text-sm text-red-500 mb-2">Eroare: {error}</p>}
      {mesaj && <p className="text-sm text-emerald-600 mb-2">{mesaj}</p>}

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Ex: ct tomis nord"
          className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adauga();
          }}
        />
        <button
          onClick={adauga}
          disabled={!text.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-40"
        >
          Adaugă
        </button>
      </div>

      {!zone ? (
        <p className="text-sm text-slate-500">Se încarcă...</p>
      ) : (
        <ul className="space-y-1">
          {zone.map((z) => (
            <li key={z.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-800">{z.text}</span>
              <button
                onClick={() => sterge(z.id)}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
              >
                Șterge
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
