"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [confirmareParola, setConfirmareParola] = useState("");
  const [eroare, setEroare] = useState("");
  const [mesajSucces, setMesajSucces] = useState("");
  const [seIncarca, setSeIncarca] = useState(false);

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEroare("");
    setMesajSucces("");

    if (parola !== confirmareParola) {
      setEroare("Parolele introduse nu coincid.");
      return;
    }

    if (parola.length < 6) {
      setEroare("Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }

    setSeIncarca(true);

    const { error } = await supabase.auth.signUp({
      email,
      password: parola,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    setSeIncarca(false);

    if (error) {
      setEroare(
        error.message.includes("already registered")
          ? "Există deja un cont cu acest email."
          : "A apărut o eroare la înregistrare. Încearcă din nou."
      );
      return;
    }

    setMesajSucces(
      "Cont creat cu succes! Verifică-ți emailul pentru a confirma adresa, apoi te poți autentifica."
    );

    setTimeout(() => {
      router.push("/login");
    }, 3000);
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
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Creează cont</h1>
          <p className="text-sm text-slate-500 mb-6">
            Înregistrează-te ca să poți activa alerte pentru zonele tale de interes.
          </p>

          {eroare && (
            <div className="bg-red-100 text-red-600 text-sm font-semibold p-3 rounded-xl mb-4">
              {eroare}
            </div>
          )}

          {mesajSucces && (
            <div className="bg-emerald-100 text-emerald-700 text-sm font-semibold p-3 rounded-xl mb-4">
              {mesajSucces}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
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
                minLength={6}
                placeholder="Minim 6 caractere"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={parola}
                onChange={(e) => setParola(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Confirmă parola
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
                value={confirmareParola}
                onChange={(e) => setConfirmareParola(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={seIncarca}
              className="w-full mt-2 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {seIncarca ? "Se creează contul..." : "Creează cont"}
            </button>
          </form>

          <p className="text-sm text-slate-500 mt-6 text-center">
            Ai deja cont?{" "}
            <Link href="/login" className="text-blue-700 font-semibold hover:underline">
              Autentifică-te
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
