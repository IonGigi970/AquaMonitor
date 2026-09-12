"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SERVICII } from "@/lib/servicii";
import { useUser } from "@/lib/useUser";

const supabase = createClient();

/**
 * Bara de sus a aplicației. Două variante:
 *
 * - "complet" (implicit): identitatea proiectului, serviciile monitorizate,
 *   linkul către abonamente, butonul de susținere și starea de autentificare.
 *   Se folosește pe paginile principale.
 * - "simplu": doar identitatea proiectului și, opțional, un link de întoarcere.
 *   Se folosește pe paginile de autentificare și de informare, unde meniul
 *   complet ar distrage de la formular.
 *
 * `activ` este ruta paginii curente (ex: "/avarii") și servește doar la
 * evidențierea serviciului pe care se află utilizatorul.
 */
export default function SiteHeader({
  activ,
  varianta = "complet",
  inapoi,
}: {
  activ?: string;
  varianta?: "complet" | "simplu";
  /** Link de întoarcere, afișat doar la varianta simplă. */
  inapoi?: { href: string; eticheta: string };
}) {
  const router = useRouter();
  const { user, incarcat } = useUser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const logo = (
    <Link
      href="/"
      className="flex flex-col items-start leading-tight group"
    >
      <span className="text-2xl font-bold flex items-center gap-2 tracking-tight group-hover:text-blue-100 transition-colors">
        <span aria-hidden="true">💧</span> AquaMonitor CT
      </span>
    </Link>
  );

  if (varianta === "simplu") {
    return (
      <nav className="bg-blue-700 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {logo}
          {inapoi && (
            <Link
              href={inapoi.href}
              className="bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-xl text-sm font-semibold"
            >
              {inapoi.eticheta}
            </Link>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        {logo}

        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 font-semibold">
          {SERVICII.map((serviciu) => (
            <Link
              key={serviciu.href}
              href={serviciu.href}
              aria-current={activ === serviciu.href ? "page" : undefined}
              className={`transition-colors px-2 py-1 ${
                activ === serviciu.href
                  ? "text-white underline decoration-2 underline-offset-4"
                  : "text-blue-100 hover:text-white"
              }`}
            >
              <span aria-hidden="true">{serviciu.iconita}</span> {serviciu.eticheta}
            </Link>
          ))}

          <Link
            href="/membership"
            className="text-blue-100 hover:text-blue-200 transition-colors px-2 py-1"
          >
            🔔 Alertele mele
          </Link>

          <Link
            href="/sustine"
            className="bg-amber-400 text-amber-950 px-5 py-2.5 rounded-xl shadow hover:bg-amber-300 transition-all transform hover:scale-105 flex items-center gap-2"
          >
            ☕ Susține Proiectul
          </Link>

          {incarcat && user ? (
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
                Autentificare
              </Link>
              <Link
                href="/register"
                className="bg-white text-blue-700 px-4 py-2 rounded-xl shadow hover:bg-blue-50 transition-colors"
              >
                Cont nou
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
