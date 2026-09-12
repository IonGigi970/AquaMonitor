"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/siteHeader";
import SiteFooter from "@/components/siteFooter";
import { SERVICII } from "@/lib/servicii";
import { useUser } from "@/lib/useUser";

export default function Home() {
  // Numărul de avarii active per serviciu, afișat pe carduri.
  // undefined = încă se încarcă; null = serviciul nu a răspuns.
  const [contoare, setContoare] = useState<Record<string, number | null>>({});
  const { user, incarcat } = useUser();

  useEffect(() => {
    async function incarcaContoarele() {
      const rezultate = await Promise.all(
        SERVICII.map(async (serviciu) => {
          try {
            const res = await fetch(`/api/avarii?serviciu=${serviciu.cheie}`);
            if (!res.ok) return [serviciu.cheie, null] as const;
            const date = await res.json();
            return [serviciu.cheie, Array.isArray(date) ? date.length : null] as const;
          } catch {
            return [serviciu.cheie, null] as const;
          }
        })
      );
      setContoare(Object.fromEntries(rezultate));
    }
    incarcaContoarele();
  }, []);

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <SiteHeader />

      {/* Zona de întâmpinare */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20 flex flex-col items-center text-center">
          <span className="bg-white/15 backdrop-blur px-4 py-1.5 rounded-full text-sm font-semibold mb-5">
            📡 Date preluate automat, la fiecare 15 minute
          </span>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl">
            Știi din timp când rămâi fără apă sau curent
          </h1>

          <p className="mt-5 text-lg md:text-xl text-blue-50 max-w-2xl">
            AquaMonitor CT adună avariile și întreruperile anunțate de operatori și îți trimite
            alertă pe zona ta de interes — pe email sau pe Telegram, gratuit.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            {incarcat && user ? (
              <>
                <Link
                  href="/avarii"
                  className="bg-white text-blue-700 px-7 py-3.5 rounded-xl font-semibold shadow-lg hover:bg-blue-50 transition-colors"
                >
                  Vezi situația avariilor
                </Link>
                <Link
                  href="/membership"
                  className="bg-blue-900/40 hover:bg-blue-900/60 border border-white/30 px-7 py-3.5 rounded-xl font-semibold transition-colors"
                >
                  🔔 Alertele mele
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="bg-white text-blue-700 px-7 py-3.5 rounded-xl font-semibold shadow-lg hover:bg-blue-50 transition-colors"
                >
                  Creează cont gratuit
                </Link>
                <Link
                  href="/login"
                  className="bg-blue-900/40 hover:bg-blue-900/60 border border-white/30 px-7 py-3.5 rounded-xl font-semibold transition-colors"
                >
                  Autentificare
                </Link>
              </>
            )}
          </div>

          <p className="mt-5 text-sm text-blue-100">
            Nu-ți cerem date personale. Te poți dezabona oricând, dintr-un singur click.
          </p>
        </div>
      </section>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-12 md:py-16 flex flex-col gap-14">
        {/* Serviciile monitorizate */}
        <section>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center">
            Ce monitorizăm
          </h2>
          <p className="text-slate-600 text-center mt-2">
            Alege un serviciu ca să vezi situația pe hartă și în listă.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {SERVICII.map((serviciu) => {
              const nr = contoare[serviciu.cheie];
              return (
                <Link
                  key={serviciu.cheie}
                  href={serviciu.href}
                  className={`bg-white rounded-3xl border-2 p-7 shadow-sm hover:shadow-lg transition-all flex flex-col ${serviciu.accent}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-4xl" aria-hidden="true">
                      {serviciu.iconita}
                    </span>
                    {nr === undefined ? (
                      <span className="text-xs font-semibold text-slate-400">
                        se încarcă...
                      </span>
                    ) : nr === null ? (
                      <span className="text-xs font-semibold text-slate-400">
                        indisponibil momentan
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-current">
                        {nr} {nr === 1 ? "avarie activă" : "avarii active"}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-slate-800 mt-5">{serviciu.eticheta}</h3>
                  <p className="text-sm text-slate-600 mt-2 flex-1">{serviciu.descriere}</p>

                  <span className="mt-6 font-semibold text-blue-700">Vezi situația →</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Cum funcționează */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-10">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 text-center">
            Cum funcționează
          </h2>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                pas: "1",
                titlu: "Îți alegi zona",
                text: "Localitatea, strada sau cartierul care te interesează — nu tot județul.",
              },
              {
                pas: "2",
                titlu: "Primești alerta",
                text: "Când apare o avarie în zona ta, îți trimitem un mesaj pe email sau pe Telegram.",
              },
              {
                pas: "3",
                titlu: "Te dezabonezi ușor",
                text: "Oprești alertele oricând, din pagina „Alertele mele”. Fără cont de operator, fără costuri.",
              },
            ].map((item) => (
              <div key={item.pas} className="flex flex-col items-center text-center">
                <span className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-md">
                  {item.pas}
                </span>
                <h3 className="font-bold text-lg text-slate-800 mt-4">{item.titlu}</h3>
                <p className="text-sm text-slate-600 mt-2 max-w-xs">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Susținerea proiectului */}
        <section className="bg-gradient-to-r from-amber-400 to-amber-300 rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-amber-950">Susții proiectul?</h2>
            <p className="text-amber-900 mt-2 max-w-xl">
              AquaMonitor CT este un proiect independent, făcut pe timpul liber și ținut
              gratuit pentru toată lumea. Dacă îți este de folos, o donație acoperă costurile
              de întreținere.
            </p>
          </div>
          <Link
            href="/sustine"
            className="shrink-0 bg-amber-950 text-amber-50 px-7 py-3.5 rounded-xl font-semibold shadow hover:bg-amber-900 transition-colors"
          >
            ☕ Susține Proiectul
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
