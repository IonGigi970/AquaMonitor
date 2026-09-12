import Link from "next/link";

/**
 * Subsolul aplicației. Fără stare, deci poate fi folosit în orice pagină
 * (și în componente de server).
 */
export default function SiteFooter() {
  return (
    <footer className="bg-blue-700 text-white mt-8">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="flex flex-col items-center">
          <h3 className="font-bold text-lg mb-2">AquaMonitor CT</h3>
          <p className="text-sm text-blue-100 max-w-xs">
            Monitorizăm avariile de apă și întreruperile de energie electrică din Constanța
            și împrejurimi, în timp real.
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
  );
}
