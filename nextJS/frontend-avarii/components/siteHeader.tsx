"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SERVICII } from "@/lib/servicii";
import { useUser } from "@/lib/useUser";

const supabase = createClient();

/**
 * Bara de sus a aplicației: identitatea proiectului, serviciile monitorizate,
 * linkul către abonamente, butonul de susținere și starea de autentificare.
 *
 * `activ` este ruta paginii curente (ex: "/avarii"), folosită doar ca să
 * evidențiem serviciul pe care se află utilizatorul.
 */
export default function SiteHeader({ activ }: { activ?: string }) {
  const router = useRouter();
  const { user, incarcat } = useUser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="bg-blue-700 text-white p-4 shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <Link
          href="/"
          className="text-2xl font-bold flex items-center gap-2 tracking-tight hover:text-blue-100 transition-colors"
        >
          <span aria-hidden="true">💧</span> AquaMonitor CT
        </Link>

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
