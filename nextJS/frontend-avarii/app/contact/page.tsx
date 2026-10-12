"use client";

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/siteHeader";
import SiteFooter from "@/components/siteFooter";

const STARE = {
  initial: "initial",
  trimite: "trimite",
  reusit: "reusit",
  eroare: "eroare",
} as const;

export default function ContactPage() {
  const [form, setForm] = useState({ nume: "", email: "", subiect: "", mesaj: "" });
  const [stare, setStare] = useState<(typeof STARE)[keyof typeof STARE]>(STARE.initial);
  const [eroare, setEroare] = useState("");

  async function trimite(e: React.FormEvent) {
    e.preventDefault();
    setStare(STARE.trimite);
    setEroare("");
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const corp = await r.json();
        throw new Error(corp?.error ?? "Nu am putut trimite mesajul.");
      }
      setStare(STARE.reusit);
    } catch (err) {
      setEroare(err instanceof Error ? err.message : String(err));
      setStare(STARE.eroare);
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-10 flex flex-col gap-6">
        <Link href="/" className="text-sm text-blue-700 hover:underline self-start">
          ← Înapoi la prima pagină
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Contact & Sugestii</h1>
        <p className="text-sm text-slate-600">
          Ai o problemă cu alertele, o sugestie sau o întrebare? Scrie-ne direct din aplicație.
          Preferi emailul? Ne găsești la{" "}
          <a
            href="mailto:aquamonitorct@gmail.com"
            className="text-blue-700 font-semibold hover:underline"
          >
            aquamonitorct@gmail.com
          </a>
          .
        </p>

        {stare === STARE.reusit ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <p className="text-emerald-700 font-semibold">
              ✓ Mesajul a fost trimis. Îți mulțumim!
            </p>
            <p className="text-sm text-emerald-600 mt-1">
              Îți răspundem în curând, de obicei în 1-2 zile lucrătoare.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-sm text-blue-700 font-semibold hover:underline"
            >
              Înapoi la prima pagină
            </Link>
          </div>
        ) : (
          <form
            onSubmit={trimite}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="c-nume" className="block text-sm font-semibold text-slate-700 mb-1">
                  Nume *
                </label>
                <input
                  id="c-nume"
                  type="text"
                  required
                  maxLength={100}
                  placeholder="Numele tău"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                  value={form.nume}
                  onChange={(e) => setForm({ ...form, nume: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="c-email" className="block text-sm font-semibold text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  id="c-email"
                  type="email"
                  required
                  placeholder="adresa@email.ro"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="c-subiect" className="block text-sm font-semibold text-slate-700 mb-1">
                Subiect *
              </label>
              <input
                id="c-subiect"
                type="text"
                required
                maxLength={200}
                placeholder="Ex: nu am primit o alertă"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={form.subiect}
                onChange={(e) => setForm({ ...form, subiect: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="c-mesaj" className="block text-sm font-semibold text-slate-700 mb-1">
                Mesaj *
              </label>
              <textarea
                id="c-mesaj"
                required
                maxLength={2000}
                rows={6}
                placeholder="Descrie problema sau sugestia ta..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400 resize-y"
                value={form.mesaj}
                onChange={(e) => setForm({ ...form, mesaj: e.target.value })}
              />
              <p className="text-xs text-slate-400 mt-1 text-right">
                {form.mesaj.length}/2000
              </p>
            </div>

            {eroare && <p className="text-sm text-red-500">{eroare}</p>}

            <button
              type="submit"
              disabled={stare === STARE.trimite}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {stare === STARE.trimite ? "Se trimite..." : "Trimite mesajul"}
            </button>
          </form>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
