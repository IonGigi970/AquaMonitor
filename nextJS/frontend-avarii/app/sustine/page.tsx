import Link from "next/link";

export default function SustinePage() {
  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <nav className="bg-blue-700 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            AquaMonitor CT
          </Link>
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-xl text-sm font-semibold"
          >
            ← Înapoi la hartă
          </Link>
        </div>
      </nav>

      <div className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">💧</div>
          <h1 className="text-3xl font-bold text-slate-800">Susține Proiectul</h1>
          <p className="text-slate-500 mt-3 max-w-xl mx-auto">
            AquaMonitor CT este un proiect independent care te ține la curent cu avariile de apă
            din Constanța și împrejurimi. Donațiile ne ajută să acoperim costurile de hosting,
            notificări și dezvoltare.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col">
            <div className="text-3xl mb-3">☕</div>
            <h2 className="text-lg font-bold text-slate-800">O cafea</h2>
            <p className="text-sm text-slate-500 mt-1 flex-1">
              O donație mică, o singură dată, ca să ne susții munca.
            </p>
            <a
              href="https://revolut.me/iongigi97"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 bg-blue-600 text-white font-bold py-3 rounded-xl text-center hover:bg-blue-700 transition-colors"
            >
              Donează prin Revolut
            </a>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 mt-6">
          <h3 className="font-bold text-slate-800 mb-2">Mulțumim pentru sprijin! 🙏</h3>
          <p className="text-sm text-slate-600">
            Fiecare donație, oricât de mică, ne ajută să menținem serviciul gratuit și să
            îmbunătățim alertele pentru comunitate.
          </p>
        </div>
      </div>
    </div>
  );
}
