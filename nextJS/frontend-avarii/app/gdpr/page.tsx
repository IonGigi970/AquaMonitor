import Link from "next/link";

export default function GdprPage() {
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
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Confidențialitate & Termeni</h1>
        <p className="text-sm text-slate-500 mb-8">Ultima actualizare: august 2026</p>

        <div className="space-y-6">
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">1. Cine suntem</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              AquaMonitor CT este un proiect independent care monitorizează avariile de apă
              publicate de RAJA pe site-ul oficial, pentru a informa comunitatea din Constanța
              și împrejurimi. Proiectul <b>nu este afiliat, sponsorizat sau aprobat de RAJA</b>.
              Datele despre avarii sunt preluate din surse publice și pot conține erori sau
              întârzieri.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">2. Datele pe care le colectăm</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Pentru a-ți oferi alertele, colectăm și stocăm următoarele date personale:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
              <li>Adresa de email (sau datele de contact alese pentru alerte)</li>
              <li>Zonele de interes selectate (localități, străzi, cartiere)</li>
              <li>Canalele de notificare alese (email, Telegram)</li>
              <li>Data și ora înregistrării contului</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Nu colectăm date de localizare, date bancare sau alte date sensibile.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">3. Baza legală și scopul prelucrării</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Prelucrăm datele tale pe baza <b>consimțământului</b> (art. 6 alin. 1 lit. a GDPR),
              pe care îl acorzi prin crearea contului și abonarea la alerte. Datele sunt folosite
              exclusiv pentru a-ți trimite notificări despre avariile din zonele selectate.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">4. Cookie-uri</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Folosim cookie-uri strict necesare pentru funcționarea autentificării și a sesiunii
              tale (ex. păstrarea stării de conectare). Nu folosim cookie-uri de publicitate sau
              de urmărire a comportamentului. Poți șterge cookie-urile din setările browserului
              oricând, dar s-ar putea să fii nevoit să te autentifici din nou.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">5. Drepturile tale (GDPR)</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Conform Regulamentului General privind Protecția Datelor (GDPR), ai următoarele
              drepturi:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
              <li>Dreptul de acces la datele tale</li>
              <li>Dreptul la rectificarea datelor incorecte</li>
              <li>Dreptul la ștergerea datelor ("dreptul de a fi uitat")</li>
              <li>Dreptul la restricționarea prelucrării</li>
              <li>Dreptul la portabilitatea datelor</li>
              <li>Dreptul de a-ți retrage consimțământul oricând</li>
              <li>Dreptul de a depune o plângere la ANSPDCP</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Îți poți exercita oricare dintre aceste drepturi scriindu-ne la adresa de contact
              de mai jos. Poți, de asemenea, să-ți ștergi contul și abonamentele direct din
              aplicație.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">6. Stocarea și securitatea datelor</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Datele sunt stocate pe servere securizate (Supabase, cu criptare în tranzit și în
              repaus). Accesul la date este restricționat și protejat prin autentificare. Păstrăm
              datele atât timp cât contul tău este activ; la ștergerea contului, datele asociate
              sunt eliminate.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">7. Termeni de utilizare</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Informațiile afișate pe acest site sunt furnizate "ca atare", cu bună-credință, dar
              fără garanții de exactitate sau actualitate. Nu ne asumăm răspunderea pentru
              deciziile luate pe baza acestor informații. Sursa oficială a avariilor este site-ul
              RAJA. Este interzisă utilizarea site-ului în scopuri ilegale sau pentru a deranja
              alți utilizatori.
            </p>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">8. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Pentru orice întrebare legată de confidențialitate sau pentru a-ți exercita
              drepturile, ne poți contacta la:
            </p>
            <a
              href="mailto:aquamonitorct@gmail.com"
              className="text-sm font-semibold text-blue-700 hover:underline inline-block mt-2"
            >
              aquamonitorct@gmail.com
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
