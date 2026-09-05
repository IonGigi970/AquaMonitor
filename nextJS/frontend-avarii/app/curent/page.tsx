"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { formateazaData, formateazaText } from '@/lib/format';

const MapComponent = dynamic(() => import('@/components/mapComponent'), {
  ssr: false,
  loading: () => <div className="w-full min-h-[500px] flex items-center justify-center bg-slate-100 rounded-3xl text-slate-500">Se încarcă harta...</div>
});

interface Intrerupere {
  id?: string;
  localitate: string;
  strada: string;
  cartier?: string | null;
  status: string;
  descriere_text: string;
  data?: string | null;
  data_inceput?: string;
  data_sfarsit?: string;
  sursa_url?: string | null;
  tip_intrerupere?: string | null;
  latitudine?: number;
  longitudine?: number;
}

function esteRezolvata(a: Intrerupere): boolean {
  return a.status === 'REMEDIAT';
}

function esteProgramata(a: Intrerupere): boolean {
  return a.tip_intrerupere === 'programata';
}

function CardIntrerupere({ item }: { item: Intrerupere }) {
  const programata = esteProgramata(item);
  const rezolvata = esteRezolvata(item);

  const culoareBord = rezolvata ? 'border-emerald-500' : programata ? 'border-amber-500' : 'border-red-500';
  const culoareBadge = rezolvata ? 'bg-emerald-100 text-emerald-700' : programata ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';
  const textBadge = rezolvata ? '✅ Rezolvat' : programata ? '📅 Programată' : '⚡ Întrerupere';

  return (
    <div className={`block bg-white p-5 rounded-2xl shadow-sm border-l-4 hover:shadow-md transition-shadow relative overflow-hidden ${culoareBord}`}>
      <div className={`absolute top-0 right-0 text-xs font-bold px-3 py-1 rounded-bl-lg ${culoareBadge}`}>
        {textBadge}
      </div>
      <h3 className="font-bold text-lg text-slate-800 mt-2">
        {programata ? '📅' : '⚡'} {formateazaText(item.localitate)}
      </h3>
      <p className="text-sm font-semibold text-slate-700 mt-1">
        {item.cartier ? formateazaText(item.cartier) : "Zonă nespecificată"}
      </p>

      {item.data_inceput && (
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 mt-3 bg-amber-50 p-2 rounded-lg">
          {programata ? '🕒 Începe:' : '⏱️ Începută:'} {item.data_inceput}
        </div>
      )}

      {item.data_sfarsit && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 mt-3 bg-emerald-50 p-2 rounded-lg">
          {programata ? '🏁 Sfârșit estimat:' : '✅ Rezolvată:'} {item.data_sfarsit}
        </div>
      )}

      {!item.data_inceput && item.data && (
        <div className="flex items-center gap-2 text-xs font-bold text-blue-700 mt-3 bg-blue-50 p-2 rounded-lg">
          📅 {formateazaData(item.data)}
        </div>
      )}
      <p className="text-xs text-slate-600 mt-3 leading-relaxed">{item.descriere_text}</p>
    </div>
  );
}

export default function CurentPage() {
  const [intreruperi, setIntreruperi] = useState<Intrerupere[]>([]);
  const [loading, setLoading] = useState(true);
  const [eroareFetch, setEroareFetch] = useState("");
  const [arataToate, setArataToate] = useState(false);

  const programate = intreruperi.filter((i) => esteProgramata(i) && !esteRezolvata(i));
  const accidentale = intreruperi.filter((i) => !esteProgramata(i) && !esteRezolvata(i));
  const rezolvate = intreruperi.filter((i) => esteRezolvata(i));
  const rezolvateVizibile = arataToate ? rezolvate : rezolvate.slice(0, 5);

  useEffect(() => {
    async function fetchIntreruperi() {
      try {
        const res = await fetch('/api/avarii?serviciu=curent');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setEroareFetch(body.error || `Eroare HTTP ${res.status}`);
        } else {
          const data = await res.json();
          setIntreruperi(data);
        }
      } catch (err) {
        setEroareFetch(err instanceof Error ? err.message : "Eroare la încărcarea întreruperilor.");
      }
      setLoading(false);
    }
    fetchIntreruperi();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col relative">
      <nav className="bg-amber-600 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col items-start leading-tight">
                <div className="text-2xl font-bold flex items-center gap-2 tracking-tight">
                    ⚡ AquaMonitor CT
                </div>
                <div className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-amber-200 mt-0.5">
                    Energie electrică
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 font-semibold">
                <Link
                  href="/"
                  className="hover:text-amber-100 transition-colors text-amber-50 px-2 py-1"
                >
                  💧 Avarii apă
                </Link>
                <Link
                  href="/membership"
                  className="hover:text-amber-100 transition-colors text-amber-50 px-2 py-1"
                >
                  🔔 Alertele mele
                </Link>
                <Link
                  href="/sustine"
                  className="bg-white text-amber-900 px-5 py-2.5 rounded-xl shadow hover:bg-amber-100 transition-all transform hover:scale-105 flex items-center gap-2"
                >
                    ☕ Susține Proiectul
                </Link>
            </div>
        </div>
      </nav>

      <div className="bg-amber-400 text-amber-950">
        <div className="max-w-7xl mx-auto px-4 py-3 text-sm md:text-base font-bold flex items-start gap-3">
          <span className="shrink-0">⚠️</span>
          <span>
            Modulul „Energie electrică" este în dezvoltare: informațiile afișate pot fi
            incomplete sau întârziate. Extindem treptat AquaMonitor CT de la avariile de apă
            (RAJA) la întreruperile de energie electrică.
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-1 flex flex-col gap-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Situația la zi — energie electrică
            </h2>
            <div className="space-y-4 overflow-y-auto pr-2 max-h-[600px]">
              {loading ? (
                <p className="text-slate-500">Se încarcă datele...</p>
              ) : eroareFetch ? (
                <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">Eroare la încărcare: {eroareFetch}</p>
              ) : intreruperi.length === 0 ? (
                <p className="text-slate-500">Nu există întreruperi în curs sau programate.</p>
              ) : (
                <>
                  {programate.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 mb-2 flex items-center gap-2">
                        📅 Deconectări programate
                      </h3>
                      <div className="space-y-4">
                        {programate.map((item, index) => (
                          <CardIntrerupere key={item.id || `p-${index}`} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {accidentale.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-red-600 mb-2 flex items-center gap-2">
                        ⚡ Întreruperi accidentale
                      </h3>
                      <div className="space-y-4">
                        {accidentale.map((item, index) => (
                          <CardIntrerupere key={item.id || `a-${index}`} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {programate.length === 0 && accidentale.length === 0 && (
                    <p className="text-slate-500">Nu există întreruperi în curs sau programate.</p>
                  )}

                  {rezolvate.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-600 mb-2 flex items-center gap-2">
                        ✅ Rezolvate recent
                      </h3>
                      <div className="space-y-4">
                        {rezolvateVizibile.map((item, index) => (
                          <CardIntrerupere key={item.id || `r-${index}`} item={item} />
                        ))}
                      </div>
                      {rezolvate.length > 5 && (
                        <button
                          onClick={() => setArataToate((v) => !v)}
                          className="w-full bg-amber-600 text-white font-semibold py-3 rounded-xl hover:bg-amber-700 transition-colors mt-3"
                        >
                          {arataToate ? "Arată mai puține" : `Arată mai multe (${rezolvate.length - 5})`}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 isolate">
            <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800">Harta Întreruperilor</h2>
            </div>
            <div className="relative w-full flex-1 min-h-[500px] rounded-b-3xl overflow-hidden">
              <MapComponent avarii={intreruperi} />
            </div>
        </div>
      </div>

      <footer className="bg-amber-800 text-white mt-8">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-center">
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">⚡ AquaMonitor CT — Energie electrică</h3>
            <p className="text-sm text-amber-100 max-w-xs">
              Monitorizăm întreruperile de energie electrică din județul Constanța,
              anunțate de Rețele Electrice, în timp real.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">Contact & Sugestii</h3>
            <p className="text-sm text-amber-100">
              Ai o sugestie sau o problemă? Scrie-ne la:
            </p>
            <a
              href="mailto:aquamonitorct@gmail.com"
              className="text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors inline-block mt-1"
            >
              aquamonitorct@gmail.com
            </a>
          </div>
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">Linkuri utile</h3>
            <ul className="text-sm text-amber-100 space-y-1">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  💧 Avarii apă
                </Link>
              </li>
              <li>
                <Link href="/membership" className="hover:text-white transition-colors">
                  Alertele mele
                </Link>
              </li>
              <li>
                <Link href="/sustine" className="hover:text-white transition-colors">
                  Susține proiectul
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-amber-700 py-4 text-center text-xs text-amber-200">
          © {new Date().getFullYear()} AquaMonitor CT. Proiect independent, neafiliat cu RAJA sau Rețele Electrice.
        </div>
      </footer>
    </div>
  );
}
