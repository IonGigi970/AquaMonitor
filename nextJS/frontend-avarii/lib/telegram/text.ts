// Helperi puri pentru textul primit de la utilizatori: normalizare (fără
// diacritice și fără prefixe de stradă), recunoașterea județului și a
// serviciului, plus formatarea unei zone de abonament.

export const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani",
  "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj",
  "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj",
  "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți",
  "Mureș", "Neamț", "Olt", "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava",
  "Teleorman", "Timiș", "Tulcea", "Vaslui", "Vâlcea", "Vrancea",
];

export const ETICHETE_SERVICIU: Record<string, string> = {
  apa: "💧 Apă (RAJA)",
  curent: "⚡ Energie electrică",
};

export function normalizeazaText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(strada|str\.|bulevardul|bd\.|b-dul|alee|aleea|intrarea|cartier|cartierul)\s+/i, "")
    .trim();
}

export function gasesteJudet(text: string): string | null {
  const cautat = normalizeazaText(text).replace(/jud(etul)?\.?\s*/i, "");
  if (!cautat) return null;
  const exact = JUDETE.find((j) => normalizeazaText(j) === cautat);
  if (exact) return exact;
  const partial = JUDETE.find((j) => normalizeazaText(j).includes(cautat) && cautat.length >= 4);
  return partial || null;
}

export function gasesteServiciu(text: string): "apa" | "curent" | null {
  const t = normalizeazaText(text);
  if (t.includes("apa") || t === "1" || t.includes("💧")) return "apa";
  if (t.includes("energie") || t.includes("curent") || t.includes("electric") || t === "2" || t.includes("⚡")) return "curent";
  return null;
}

export function descriereZona(ab: Record<string, unknown>): string {
  const capitalize = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const bucati = [capitalize(String(ab.localitate_interes ?? ""))];
  if (ab.strada_interes) bucati.push(`strada ${capitalize(String(ab.strada_interes))}`);
  if (ab.cartier_interes) bucati.push(`cartierul ${capitalize(String(ab.cartier_interes))}`);
  if (!ab.strada_interes && !ab.cartier_interes) bucati.push("toată localitatea");
  return bucati.join(", ");
}
