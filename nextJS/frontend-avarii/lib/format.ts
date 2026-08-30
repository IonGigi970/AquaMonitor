// Restaurează diacriticele pentru cuvinte românești comune (nume de localități, străzi).
// Datele sunt stocate normalizat (fără diacritice), deci le reconstruim la afișare.
const MAPA_DIACRITICE: Record<string, string> = {
  constanta: "Constanța",
  harsova: "Hârșova",
  navodari: "Năvodari",
  cernavoda: "Cernavodă",
  "negru voda": "Negru Vodă",
  "mihail kogalniceanu": "Mihail Kogălniceanu",
  tandarei: "Țăndărei",
  jegalia: "Jegălia",
  vanatori: "Vânători",
  ciocarlia: "Ciocârlia",
  baneasa: "Băneasa",
  "poarta alba": "Poarta Albă",
  targusor: "Târgușor",
  silistea: "Siliștea",
  costinesti: "Costinești",
  cumpana: "Cumpăna",
  "cuza voda": "Cuza Vodă",
  "douazeci si trei august": "Douăzeci și Trei August",
  fantanele: "Fântânele",
  garliciu: "Gârliciu",
  ghindaresti: "Ghindărești",
  gradina: "Grădina",
  independenta: "Independența",
  lipnita: "Lipnița",
  "mihai viteazu": "Mihai Viteazu",
  "mircea voda": "Mircea Vodă",
  "nicolae balcescu": "Nicolae Bălcescu",
  pestera: "Peștera",
  sacele: "Săcele",
  sageata: "Săgeata",
  valcelele: "Vâlcelele",
  "toata localitatea": "Toată localitatea",
  "toată localitatea": "Toată localitatea",
  "presiune scazuta": "Presiune scăzută",
  "presiune scăzută": "Presiune scăzută",
  avarie: "Avarie",
  remediat: "Remediat",
  strada: "Strada",
  bulevardul: "Bulevardul",
  aleea: "Aleea",
  intrarea: "Intrarea",
  cartierul: "Cartierul",
  "prelungirea ion ratiu": "Prelungirea Ion Rațiu",
  "ion ratiu": "Ion Rațiu",
};

// Transformă un text normalizat în formă afișabilă: diacritice + literă mare la fiecare cuvânt.
export function formateazaText(text?: string | null): string {
  if (!text) return "";

  const cuvinte = text.split(/\s+/).filter(Boolean);
  const rezultat = cuvinte.map((cuvant) => {
    const cheie = cuvant.toLowerCase();
    if (MAPA_DIACRITICE[cheie]) {
      return MAPA_DIACRITICE[cheie];
    }
    // Literă mare la prima literă, restul litere mici
    return cuvant.charAt(0).toUpperCase() + cuvant.slice(1).toLowerCase();
  });

  return rezultat.join(" ");
}

// Formatează o dată "YYYY-MM-DD" în formă românească (ex: "27 august 2026").
export function formateazaData(data?: string | null): string {
  if (!data) return "";
  const [an, luna, zi] = data.split("-");
  if (!an || !luna || !zi) return data;
  const luni = [
    "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
    "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
  ];
  const lunaIdx = parseInt(luna, 10) - 1;
  if (lunaIdx < 0 || lunaIdx > 11) return data;
  return `${parseInt(zi, 10)} ${luni[lunaIdx]} ${an}`;
}
