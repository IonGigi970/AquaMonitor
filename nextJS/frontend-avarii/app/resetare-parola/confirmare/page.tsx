"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/passwordInput";

export default function ConfirmareResetarePage() {
  const router = useRouter();
  const supabase = createClient();

  const [parola, setParola] = useState("");
  const [confirmareParola, setConfirmareParola] = useState("");
  const [eroare, setEroare] = useState("");
  const [mesajSucces, setMesajSucces] = useState("");
  const [seIncarca, setSeIncarca] = useState(false);

  useEffect(() => {
    // Supabase setează sesiunea după ce utilizatorul a dat click pe linkul din email.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setEroare("Linkul de resetare este invalid sau a expirat.");
      }
    });
  }, [supabase]);

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEroare("");
    setMesajSucces("");

    if (parola.length < 6) {
      setEroare("Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }
    if (parola !== confirmareParola) {
      setEroare("Parolele introduse nu coincid.");
      return;
    }

    setSeIncarca(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: parola });
      if (error) {
        setEroare("A apărut o eroare la actualizarea parolei. Încearcă din nou.");
      } else {
        setMesajSucces("Parola a fost schimbată cu succes!");
        setTimeout(() => router.push("/login"), 1500);
      }
    } catch {
      setEroare("A apărut o eroare la actualizarea parolei. Încearcă din nou.");
    } finally {
      setSeIncarca(false);
    }
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
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Setează o parolă nouă</h1>
          <p className="text-sm text-slate-500 mb-6">
            Alege o parolă nouă pentru contul tău.
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="parola" className="block text-sm font-semibold text-slate-700 mb-1">
                Parolă nouă
              </label>
              <PasswordInput
                id="parola"
                name="parola"
                required
                minLength={6}
                placeholder="Minim 6 caractere"
                value={parola}
                onChange={(e) => setParola(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="confirmareParola" className="block text-sm font-semibold text-slate-700 mb-1">
                Confirmă parola
              </label>
              <PasswordInput
                id="confirmareParola"
                name="confirmareParola"
                required
                placeholder="••••••••"
                value={confirmareParola}
                onChange={(e) => setConfirmareParola(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={seIncarca}
              className="w-full mt-2 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {seIncarca ? "Se salvează..." : "Schimbă parola"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
