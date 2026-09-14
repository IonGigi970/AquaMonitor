/**
 * Curăță o valoare citită din variabilele de mediu: scoate BOM-ul (unele panouri
 * de configurare îl adaugă la copiere) și spațiile de la capete. Fără asta, un
 * URL sau o cheie „murdară" produce erori greu de depistat (fetch invalid,
 * autentificare respinsă).
 *
 * Funcția era copiată în 11 fișiere; acum stă într-un singur loc.
 */
export function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}
