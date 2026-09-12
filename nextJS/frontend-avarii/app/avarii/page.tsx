"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import SiteHeader from '@/components/siteHeader';
import SiteFooter from '@/components/siteFooter';
import { formateazaData } from '@/lib/format';

const MapComponent = dynamic(() => import('../../components/mapComponent'), { 
  ssr: false,
  loading: () => <div className="w-full min-h-[500px] flex items-center justify-center bg-slate-100 rounded-3xl text-slate-500">Se încarcă harta...</div>
});

interface Avarie {
  id?: string;
  localitate: string;
  strada: string;
  cartier?: string | null;
  status: string;
  descriere_text: string;
  data_inceput?: string;
  data_sfarsit?: string;
  data?: string | null;
  sursa_url?: string | null;
  latitudine?: number;
  longitudine?: number;
}

export default function AvariiApa() {
  const [avarii, setAvarii] = useState<Avarie[]>([]);
  const [loading, setLoading] = useState(true);
  const [eroareFetch, setEroareFetch] = useState("");
  const [arataToate, setArataToate] = useState(false);

  const alerteVizibile = arataToate ? avarii : avarii.slice(0, 5);

  useEffect(() => {
    async function fetchAvarii() {
      try {
        const res = await fetch('/api/avarii');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setEroareFetch(body.error || `Eroare HTTP ${res.status}`);
        } else {
          const data = await res.json();
          setAvarii(data);
        }
      } catch (err) {
        setEroareFetch(err instanceof Error ? err.message : "Eroare la încărcarea avariilor.");
      }
      setLoading(false);
    }
    fetchAvarii();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col relative">
      <SiteHeader activ="/avarii" />

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-1 flex flex-col gap-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Situația la zi
            </h2>
            <div className="space-y-4 overflow-y-auto pr-2 max-h-[600px]">
              {loading ? (
                <p className="text-slate-500">Se încarcă datele...</p>
              ) : eroareFetch ? (
                <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">Eroare la încărcare: {eroareFetch}</p>
              ) : avarii.length === 0 ? (
                <p className="text-slate-500">Nu există avarii active.</p>
              ) : (
                <>
                  {alerteVizibile.map((item, index) => (
                    <a
                      key={item.id || index}
                      href={item.sursa_url || "#"}
                      target={item.sursa_url ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className={`block bg-white p-5 rounded-2xl shadow-sm border-l-4 hover:shadow-md transition-shadow relative overflow-hidden ${item.status === 'AVARIE' ? 'border-red-500' : 'border-amber-400'}`}
                    >
                        <div className={`absolute top-0 right-0 text-xs font-bold px-3 py-1 rounded-bl-lg ${item.status === 'AVARIE' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                          {item.status}
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mt-2">{item.localitate}</h3>
                        <p className="text-sm font-semibold text-slate-700 mt-1">
                          {item.strada || item.cartier || "Toată localitatea"}
                        </p>

                        {item.data && (
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 mt-3 bg-blue-50 p-2 rounded-lg">
                            📅 {formateazaData(item.data)}
                          </div>
                        )}

                        {(item.data_inceput || item.data_sfarsit) && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-3 bg-slate-50 p-2 rounded-lg">
                              ⏱️ {item.data_inceput || "?"} - {item.data_sfarsit || "?"}
                          </div>
                        )}
                        <p className="text-xs text-slate-600 mt-3 leading-relaxed">{item.descriere_text}</p>
                        {item.sursa_url && (
                          <p className="text-xs text-blue-600 mt-2 font-semibold">
                            Vezi comunicatul oficial RAJA →
                          </p>
                        )}
                    </a>
                  ))}

                  {avarii.length > 5 && (
                    <button
                      onClick={() => setArataToate((v) => !v)}
                      className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      {arataToate ? "Arată mai puține" : `Arată mai multe (${avarii.length - 5})`}
                    </button>
                  )}
                </>
              )}
            </div>
        </div>

        <div className="col-span-1 lg:col-span-2 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 isolate">
            <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800">Harta Avariilor</h2>
            </div>
            <div className="relative w-full flex-1 min-h-[500px] rounded-b-3xl overflow-hidden">
              <MapComponent avarii={avarii} />
            </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}