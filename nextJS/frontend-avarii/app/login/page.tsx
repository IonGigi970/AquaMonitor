"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [eroare, setEroare] = useState("");
  const [seIncarca, setSeIncarca] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEroare("");
    setSeIncarca(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: parola,
    });

    setSeIncarca(false);

    if (error) {
      setEroare(
        error.message === "Invalid login credentials"
          ? "Email sau parolă incorectă."
          : "A apărut o eroare la autentificare. Încearcă din nou."
      );
      return;
    }

    router.push("/membership");
    router.refresh();
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <nav className="bg-blue-700 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            AquaMonitor CT
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Autentificare</h1>
          <p className="text-sm text-slate-500 mb-6">
            Conectează-te pentru a-ți gestiona alertele de avarii.
          </p>

          {eroare && (
            <div className="bg-red-100 text-red-600 text-sm font-semibold p-3 rounded-xl mb-4">
              {eroare}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                placeholder="adresa@email.com"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Parolă
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={parola}
                onChange={(e) => setParola(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={seIncarca}
              className="w-full mt-2 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {seIncarca ? "Se conectează..." : "Autentificare"}
            </button>
          </form>

          <p className="text-sm text-slate-500 mt-6 text-center">
            Nu ai cont?{" "}
            <Link href="/register" className="text-blue-700 font-semibold hover:underline">
              Creează unul aici
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
