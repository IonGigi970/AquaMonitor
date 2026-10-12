"use client";

import { useEffect, useState } from "react";

interface MesajContact {
  id: string;
  nume: string;
  email: string;
  subiect: string;
  mesaj: string;
  procesat: boolean;
  creatLa: string;
}

/** Mesajele din formularul de contact, doar pentru admin: listează cu badge de
 *  necitit și permite marcarea ca procesat. */
export default function AdminMesajeContact() {
  const [mesaje, setMesaje] = useState<MesajContact[]>([]);
  const [incarcat, setIncarcat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let activ = true;
    fetch("/api/admin/contact")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => {
        if (activ) {
          setMesaje(data.mesaje ?? []);
          setIncarcat(true);
        }
      })
      .catch((err) => {
        if (activ) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      activ = false;
    };
  }, [refresh]);

  async function marcheazaProcesat(id: string) {
    try {
      const r = await fetch("/api/admin/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const corp = await r.json();
        throw new Error(corp?.error ?? "Eroare la marcaje");
      }
      setRefresh((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const necitite = mesaje.filter((m) => !m.procesat);

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-slate-700">Mesaje de contact</p>
        {necitite.length > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            {necitite.length} noi
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-2">Eroare: {error}</p>}

      {!incarcat ? (
        <p className="text-sm text-slate-500">Se încarcă mesajele...</p>
      ) : mesaje.length === 0 ? (
        <p className="text-sm text-slate-500">Niciun mesaj de contact momentan.</p>
      ) : (
        <ul className="space-y-3 mt-2">
          {mesaje.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border p-3 ${m.procesat ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.subiect}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {m.nume} — {m.email} — {new Date(m.creatLa).toLocaleString("ro-RO")}
                  </p>
                </div>
                {!m.procesat && (
                  <button
                    onClick={() => marcheazaProcesat(m.id)}
                    className="shrink-0 px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Marchează procesat
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap break-words">{m.mesaj}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
