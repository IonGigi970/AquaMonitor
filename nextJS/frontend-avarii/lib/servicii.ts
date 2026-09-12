/**
 * Serviciile monitorizate de aplicație.
 *
 * Lista e singura sursă de adevăr: din ea se generează meniul din header și
 * cardurile de pe pagina principală. Ca să adaugi un serviciu nou (gaze,
 * transport, aer), adaugi o intrare aici — nu trebuie modificat nimic altundeva.
 */
export interface Serviciu {
  /** Valoarea trimisă către API (`/api/avarii?serviciu=...`). */
  cheie: "apa" | "curent";
  href: string;
  eticheta: string;
  iconita: string;
  /** Textul scurt afișat pe cardul de pe pagina principală. */
  descriere: string;
  /** Clasele Tailwind pentru accentul cardului (bordură, fundal, text). */
  accent: string;
}

export const SERVICII: Serviciu[] = [
  {
    cheie: "apa",
    href: "/avarii",
    eticheta: "Apă",
    iconita: "💧",
    descriere:
      "Avarii și lucrări la rețeaua de alimentare cu apă, preluate de la RAJA Constanța.",
    accent: "border-sky-200 hover:border-sky-400 bg-sky-50 text-sky-700",
  },
  {
    cheie: "curent",
    href: "/curent",
    eticheta: "Energie electrică",
    iconita: "⚡",
    descriere:
      "Întreruperi accidentale și deconectări programate, preluate de la Rețele Electrice.",
    accent: "border-amber-200 hover:border-amber-400 bg-amber-50 text-amber-700",
  },
];
