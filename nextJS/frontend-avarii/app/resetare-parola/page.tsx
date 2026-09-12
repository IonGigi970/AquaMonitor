"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SiteHeader from "@/components/siteHeader";

export default function ResetareParolaPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [eroare, setEroare] = useState("");
  const [mesajSucces, setMesajSucces] = useState("");
  const [seIncarca, setSeIncarca] = useState(false);

  const handleReset = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEroare("");
    setMesajSucces("");
    setSeIncarca(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/resetare-parola/confirmare`,
      });

      if (error) {
        setEroare("A apărut o eroare. Încearcă din nou.");
      } else {
        setMesajSucces(
          "Dacă există un cont cu acest email, ți-am trimis un link de resetare a parolei."
        );
      }
    } catch {
      setEroare("A apărut o eroare. Încearcă din nou.");
    } finally {
      setSeIncarca(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <SiteHeader varianta="simplu" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Resetare parolă</h1>
          <p className="text-sm text-slate-500 mb-6">
            Introdu adresa de email și îți trimitem un link pentru a-ți reseta parola.
          </p>

          {eroare && (
            <div className="bg-red-100 text-red-600 text-sm font-semibold p-3 rounded-xl mb-4">
              {eroare}
            </div>
          )}

          {mesajSucces && (
            <div className="bg-green-100 text-green-700 text-sm font-semibold p-3 rounded-xl mb-4">
              {mesajSucces}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="adresa@email.com"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={seIncarca}
              className="w-full mt-2 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {seIncarca ? "Se trimite..." : "Trimite link de resetare"}
            </button>
          </form>

          <p className="text-sm text-slate-500 mt-6 text-center">
            Ți-ai amintit parola?{" "}
            <Link href="/login" className="text-blue-700 font-semibold hover:underline">
              Autentifică-te
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
