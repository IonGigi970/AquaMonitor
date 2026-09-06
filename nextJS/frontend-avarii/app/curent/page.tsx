"use client";

import { useEffect, useMemo, useState } from 'react';
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
  judet?: string | null;
  status: string;
  descriere_text: string;
  detalii_anunt?: string | null;
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

function esteAnulata(a: Intrerupere): boolean {
  return a.status === 'ANULATA';
}

function esteProgramata(a: Intrerupere): boolean {
  return a.tip_intrerupere === 'programata';
}

const HARTA_OFICIALA_RETELE =
  'https://edmro.maps.arcgis.com/apps/webappviewer/index.html?id=2cd727b1ddb84896a8cb6dc6245af3e5';

const ZILE = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];

function parseDataRO(text: string): Date | null {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return isNaN(d.getTime()) ? null : d;
}

function etichetaData(text: string): string {
  const d = parseDataRO(text);
  if (!d) return text;
  const zi = d.getDate();
  const luna = d.getMonth() + 1;
  const ora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${ZILE[d.getDay()]} ${String(zi).padStart(2, "0")}.${String(luna).padStart(2, "0")}.${d.getFullYear()} · ${ora}`;
}

function badgeClase(programata: boolean, rezolvata: boolean): string {
  if (rezolvata) return "bg-emerald-100 text-emerald-700";
  return programata ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
}

function badgeText(programata: boolean, rezolvata: boolean): string {
  if (rezolvata) return "✅ Rezolvat";
  return programata ? "📅 Programată" : "⚡ Întrerupere";
}

function CardAnulata({ item }: { item: Intrerupere }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-slate-400 opacity-90">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-700">
          🚫 {formateazaText(item.localitate)}
        </h4>
        {item.judet && (
          <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {item.judet}
          </span>
        )}
      </div>
      {item.data_inceput && (
        <p className="text-xs text-slate-500 mt-1.5">
          📅 Fusese programată: {etichetaData(item.data_inceput)}
          {item.data_sfarsit && (
            <span className="text-slate-400 font-semibold">
              {" "}– {item.data_sfarsit.split(" ")[1] || ""}
            </span>
          )}
        </p>
      )}
      <p className="text-xs font-bold text-slate-600 mt-1">
        🔕 Anunțul a fost retras de operator — întreruperea NU mai are loc.
      </p>
      {item.detalii_anunt && (
        <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{item.detalii_anunt}</p>
      )}
    </div>
  );
}

function CardAccidentala({ item }: { item: Intrerupere }) {
  return (
    <a
      href={HARTA_OFICIALA_RETELE}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white p-4 rounded-2xl shadow-sm border-l-4 border-red-500 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-800">⚡ {formateazaText(item.localitate)}</h4>
        {item.judet && (
          <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {item.judet}
          </span>
        )}
      </div>
      {item.cartier && (
        <p className="text-xs font-semibold text-slate-600 mt-0.5">{formateazaText(item.cartier)}</p>
      )}
      {item.data_inceput && (
        <p className="text-xs font-bold text-amber-700 mt-2">⏱️ Începută: {item.data_inceput}</p>
      )}
      <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-3">{item.descriere_text}</p>
      <p className="text-xs text-blue-600 mt-1.5 font-semibold">Vezi pe harta oficială →</p>
    </a>
  );
}

function CardRezolvata({ item }: { item: Intrerupere }) {
  const programata = esteProgramata(item);
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-emerald-500">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-800">
          {programata ? "📅" : "⚡"} {formateazaText(item.localitate)}
        </h4>
        {item.judet && (
          <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {item.judet}
          </span>
        )}
      </div>
      {item.data_inceput && (
        <p className="text-xs text-slate-500 mt-1.5">
          {programata ? "📅 Programată:" : "⏱️ Începută:"} {etichetaData(item.data_inceput)}
        </p>
      )}
      {item.data_sfarsit && (
        <p className="text-xs font-bold text-emerald-700 mt-0.5">✅ Rezolvată: {etichetaData(item.data_sfarsit)}</p>
      )}
      {programata && (
        <a
          href="/api/curent/anunt"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 font-semibold underline mt-1 inline-block"
        >
          Anunț oficial (PDF) →
        </a>
      )}
    </div>
  );
}

export default function CurentPage() {
  const [intreruperi, setIntreruperi] = useState<Intrerupere[]>([]);
  const [loading, setLoading] = useState(true);
  const [eroareFetch, setEroareFetch] = useState("");
  const [judetSelectat, setJudetSelectat] = useState("");
  const [arataAccidentale, setArataAccidentale] = useState(false);
  const [arataRezolvate, setArataRezolvate] = useState(false);

  const programate = useMemo(
    () =>
      intreruperi
        .filter((i) => esteProgramata(i) && !esteRezolvata(i) && !esteAnulata(i))
        .sort((a, b) => (a.data_inceput || "").localeCompare(b.data_inceput || "")),
    [intreruperi]
  );
  const accidentale = useMemo(
    () => intreruperi.filter((i) => !esteProgramata(i) && !esteRezolvata(i) && !esteAnulata(i)),
    [intreruperi]
  );
  const anulate = useMemo(
    () =>
      intreruperi
        .filter((i) => esteAnulata(i))
        .sort((a, b) => (a.data_inceput || "").localeCompare(b.data_inceput || "")),
    [intreruperi]
  );
  const rezolvate = useMemo(
    () =>
      intreruperi
        .filter((i) => esteRezolvata(i))
        .sort((a, b) => (b.data_sfarsit || "").localeCompare(a.data_sfarsit || "")),
    [intreruperi]
  );

  const judete = useMemo(() => {
    const set = new Set<string>();
    programate.forEach((p) => {
      if (p.judet) set.add(p.judet);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ro"));
  }, [programate]);

  const programateFiltrate = useMemo(() => {
    if (!judetSelectat) return programate;
    return programate.filter((p) => p.judet === judetSelectat);
  }, [programate, judetSelectat]);

  const grupatePeLocalitate = useMemo(() => {
    const harta = new Map<string, Intrerupere[]>();
    programateFiltrate.forEach((p) => {
      const lista = harta.get(p.localitate) || [];
      lista.push(p);
      harta.set(p.localitate, lista);
    });
    return Array.from(harta.entries()).sort((a, b) => a[0].localeCompare(b[0], "ro"));
  }, [programateFiltrate]);

  const accidentaleFiltrate = useMemo(() => {
    if (!judetSelectat) return accidentale;
    return accidentale.filter((a) => a.judet === judetSelectat);
  }, [accidentale, judetSelectat]);

  const accidentaleVizibile = arataAccidentale ? accidentaleFiltrate : accidentaleFiltrate.slice(0, 8);
  const rezolvateVizibile = arataRezolvate ? rezolvate : rezolvate.slice(0, 5);

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

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-1 flex flex-col gap-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Situația la zi — energie electrică
            </h2>
            <div className="flex flex-col gap-6">
              {loading ? (
                <p className="text-slate-500">Se încarcă datele...</p>
              ) : eroareFetch ? (
                <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">Eroare la încărcare: {eroareFetch}</p>
              ) : intreruperi.length === 0 ? (
                <p className="text-slate-500">Nu există întreruperi în curs sau programate.</p>
              ) : (
                <>
                  {programate.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 flex items-center gap-2">
                        📅 Deconectări programate
                        <span className="normal-case font-semibold text-amber-600/80 text-xs">
                          ({programateFiltrate.length})
                        </span>
                      </h3>

                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-600">
                          Filtru pe județ (liste + hartă):
                        </span>
                        <select
                          value={judetSelectat}
                          onChange={(e) => setJudetSelectat(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-xl outline-none focus:border-amber-500 text-sm text-slate-900"
                        >
                          <option value="">🌍 Toate județele ({programate.length})</option>
                          {judete.map((j) => (
                            <option key={j} value={j}>
                              {j} ({programate.filter((p) => p.judet === j).length})
                            </option>
                          ))}
                        </select>
                      </label>

                      {grupatePeLocalitate.length === 0 ? (
                        <p className="text-slate-500 text-sm">Nu există deconectări programate în acest județ.</p>
                      ) : (
                        <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
                          {grupatePeLocalitate.map(([localitate, intrari]) => (
                            <div
                              key={localitate}
                              className="bg-white p-4 rounded-2xl shadow-sm border-l-4 border-amber-500"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-bold text-slate-800">🏘 {formateazaText(localitate)}</h4>
                                <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  {intrari[0].judet}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-col gap-2">
                                {intrari.map((e) => (
                                  <div key={e.id} className="text-xs border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                                    <p className="font-bold text-amber-700">
                                      🕒 {etichetaData(e.data_inceput || e.data || "")}
                                      {e.data_sfarsit && (
                                        <span className="text-slate-500 font-semibold">
                                          {" "}– {e.data_sfarsit.split(" ")[1] || ""}
                                        </span>
                                      )}
                                    </p>
                                    {e.detalii_anunt ? (
                                      <p className="text-slate-600 mt-0.5 leading-relaxed">{e.detalii_anunt}</p>
                                    ) : (
                                      <p className="text-slate-600 mt-0.5 leading-relaxed">{e.descriere_text}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <a
                                href="/api/curent/anunt"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 font-semibold underline mt-2 inline-block"
                              >
                                Anunț oficial (PDF Rețele Electrice) →
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {accidentale.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-red-600 flex items-center gap-2">
                        ⚡ Întreruperi accidentale
                        <span className="normal-case font-semibold text-red-500/70 text-xs">
                          ({accidentaleFiltrate.length})
                        </span>
                      </h3>
                      {accidentaleFiltrate.length === 0 ? (
                        <p className="text-slate-500 text-sm">
                          Nicio întrerupere accidentală în curs în județul {judetSelectat}.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
                            {accidentaleVizibile.map((item, index) => (
                              <CardAccidentala key={item.id || `a-${index}`} item={item} />
                            ))}
                          </div>
                          {accidentaleFiltrate.length > 8 && (
                            <button
                              onClick={() => setArataAccidentale((v) => !v)}
                              className="w-full bg-slate-700 text-white font-semibold py-2.5 rounded-xl hover:bg-slate-800 transition-colors text-sm"
                            >
                              {arataAccidentale
                                ? "Arată mai puține"
                                : `Arată mai multe (${accidentaleFiltrate.length - 8})`}
                            </button>
                          )}
                        </>
                      )}
                    </section>
                  )}

                  {programate.length === 0 && accidentale.length === 0 && anulate.length === 0 && (
                    <p className="text-slate-500">Nu există întreruperi în curs sau programate.</p>
                  )}

                  {anulate.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                        🚫 Anunțuri retrase de operator
                        <span className="normal-case font-semibold text-slate-400 text-xs">
                          ({anulate.length})
                        </span>
                      </h3>
                      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                        {anulate.map((item, index) => (
                          <CardAnulata key={item.id || `an-${index}`} item={item} />
                        ))}
                      </div>
                    </section>
                  )}

                  {rezolvate.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-600">
                        ✅ Rezolvate recent
                      </h3>
                      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                        {rezolvateVizibile.map((item, index) => (
                          <CardRezolvata key={item.id || `r-${index}`} item={item} />
                        ))}
                      </div>
                      {rezolvate.length > 5 && (
                        <button
                          onClick={() => setArataRezolvate((v) => !v)}
                          className="w-full bg-emerald-600 text-white font-semibold py-2.5 rounded-xl hover:bg-emerald-700 transition-colors text-sm"
                        >
                          {arataRezolvate ? "Arată mai puține" : `Arată mai multe (${rezolvate.length - 5})`}
                        </button>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col gap-4">
            <div className="flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 isolate">
                <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-800">Harta Întreruperilor Accidentale</h2>
                        {judetSelectat && (
                            <button
                              onClick={() => setJudetSelectat("")}
                              title="Resetează filtrul pe județ"
                              className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                            >
                                {judetSelectat} ✕
                            </button>
                        )}
                    </div>
                    <a
                      href={HARTA_OFICIALA_RETELE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 underline"
                    >
                      Harta oficială Rețele Electrice →
                    </a>
                </div>
                <div className="relative w-full flex-1 min-h-[500px] rounded-b-3xl overflow-hidden">
                  <MapComponent avarii={accidentaleFiltrate} />
                  {judetSelectat && accidentaleFiltrate.length === 0 && (
                    <div className="absolute inset-0 z-[1100] flex items-center justify-center pointer-events-none">
                      <p className="text-sm font-semibold text-slate-600 bg-white/90 px-4 py-3 rounded-xl shadow">
                        Nu există întreruperi accidentale active în județul {judetSelectat} — harta arată județele cu avarii.
                      </p>
                    </div>
                  )}
                </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed px-1">
              💡 Selectează un județ în lista din stânga ca să vezi doar avariile lui —
              atât în listă, cât și pe hartă. Deconectările programate apar doar în listă;
              harta oficială Rețele Electrice le arată pe toate, cu poziționare exactă.
            </p>
        </div>
      </div>

      <footer className="bg-amber-800 text-white mt-8">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-center">
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">⚡ AquaMonitor CT — Energie electrică</h3>
            <p className="text-sm text-amber-100 max-w-xs">
              Monitorizăm întreruperile de energie electrică anunțate de Rețele Electrice
              în toate județele deservite, în timp real.
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
