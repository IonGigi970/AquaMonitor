import Link from "next/link";
import SiteHeader from "@/components/siteHeader";
import SiteFooter from "@/components/siteFooter";

// Noutăți / istoricul lansărilor. Se actualizează manual, doar la lansările
// notabile pentru utilizatori (nu la fiecare commit). O intrare nouă se adaugă
// în capul listei.

interface Versiune {
  data: string;
  titlu: string;
  detalii: string[];
}

const VERSIUNI: Versiune[] = [
  {
    data: "Octombrie 2026",
    titlu: "Alerte mai exacte",
    detalii: [
      "Potrivirea abonament-avarie respectă acum granița cuvintelor: „mai” nu mai declanșează alerte pentru „Mamaia”, iar „tomis” nu mai prinde „Tomisul”.",
      "Zona „Tomis Nord” este tratată ca un cartier distinct, nu ca o variantă a străzii Tomis — abonații pe strada Tomis nu mai primesc alerte pentru Tomis Nord.",
      "Potrivirea pe număr de casă: dacă ești abonat pe „Tomis 281”, primești alerte pentru „Tomis 281”, nu și pentru „Tomis 285”.",
      "Opțiune „Doar potriviri exacte”: dacă ai completat stradă și cartier, poți alege să primești alerte doar când avaria se referă clar la amândouă.",
      "Rezumatul adminului arată acum cum s-a potrivit fiecare alertă, ca potrivirile slabe să poată fi revizuite.",
      "Mod uscat (dry-run): se poate simula o avarie și se vede exact cine ar fi notificat și de ce, fără a trimite nimic.",
    ],
  },
  {
    data: "Septembrie 2026",
    titlu: "Energie electrică și abonamente Telegram",
    detalii: [
      "Monitorizăm și întreruperile de energie electrică (accidentale și programate), cu județ, la fel ca avariile de apă.",
      "Îți poți urmări alertele și edita zona de interes din pagina „Alertele mele”.",
      "Abonamente Telegram sincronizate cu utilizatorii care au dat /start botului.",
    ],
  },
  {
    data: "August 2026",
    titlu: "Lansare AquaMonitor CT",
    detalii: [
      "Lansăm monitorizarea avariilor de apă RAJA pentru Constanța, cu alerte pe email.",
      "Harta și lista avariilor în timp real, actualizate la fiecare 15 minute.",
    ],
  },
];

export default function NoutatiPage() {
  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 flex flex-col gap-8">
        <Link href="/" className="text-sm text-blue-700 hover:underline self-start">
          ← Înapoi la prima pagină
        </Link>

        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Noutăți & Actualizări</h1>
          <p className="text-sm text-slate-600 mt-2">
            Ce s-a schimbat în AquaMonitor CT, versiune după versiune.
          </p>
        </header>

        <ol className="relative border-l border-slate-200 ml-2 space-y-8">
          {VERSIUNI.map((v) => (
            <li key={v.data} className="pl-6 relative">
              <span className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-slate-50" />
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">{v.data}</p>
              <h2 className="text-lg font-bold text-slate-800 mt-0.5">{v.titlu}</h2>
              <ul className="mt-2 space-y-1.5">
                {v.detalii.map((d) => (
                  <li key={d} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-blue-600 shrink-0">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter />
    </div>
  );
}
