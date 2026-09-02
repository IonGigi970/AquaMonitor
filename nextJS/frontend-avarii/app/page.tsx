"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import { formateazaData } from '@/lib/format';

const MapComponent = dynamic(() => import('../components/mapComponent'), { 
  ssr: false,
  loading: () => <div className="w-full min-h-[500px] flex items-center justify-center bg-slate-100 rounded-3xl text-slate-500">Se încarcă harta...</div>
});

const supabase = createClient();

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

export default function Home() {
  const router = useRouter();
  const [avarii, setAvarii] = useState<Avarie[]>([]);
  const [loading, setLoading] = useState(true);
  const [eroareFetch, setEroareFetch] = useState("");
  const [user, setUser] = useState<User | null>(null);
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col relative">
      <nav className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-2xl font-bold flex items-center gap-2 tracking-tight">
                AquaMonitor CT
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 font-semibold">
                <Link
                  href="/membership"
                  className="hover:text-blue-200 transition-colors text-blue-100 px-2 py-1"
                >
                  🔔 Alertele mele
                </Link>
                <Link
                  href="/sustine"
                  className="bg-amber-400 text-amber-950 px-5 py-2.5 rounded-xl shadow hover:bg-amber-300 transition-all transform hover:scale-105 flex items-center gap-2"
                >
                    ☕ Susține Proiectul
                </Link>
                {user ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-blue-100 hidden md:inline">{user.email}</span>
                    <button
                      onClick={handleLogout}
                      className="bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-xl"
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link
                      href="/login"
                      className="text-blue-100 hover:text-white transition-colors px-3 py-2"
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      className="bg-white text-blue-700 px-4 py-2 rounded-xl shadow hover:bg-blue-50 transition-colors"
                    >
                      Sign up
                    </Link>
                  </div>
                )}
            </div>
        </div>
      </nav>

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

      <footer className="bg-blue-700 text-white mt-8">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-center">
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">AquaMonitor CT</h3>
            <p className="text-sm text-blue-100 max-w-xs">
              Monitorizăm avariile de apă RAJA din Constanța și împrejurimi, în timp real.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <h3 className="font-bold text-lg mb-2">Contact & Sugestii</h3>
            <p className="text-sm text-blue-100">
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
            <ul className="text-sm text-blue-100 space-y-1">
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
              <li>
                <Link href="/gdpr" className="hover:text-white transition-colors">
                  Confidențialitate & Termeni
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-blue-600 py-4 text-center text-xs text-blue-200">
          © {new Date().getFullYear()} AquaMonitor CT. Proiect independent, neafiliat cu RAJA.
        </div>
      </footer>
    </div>
  );
}