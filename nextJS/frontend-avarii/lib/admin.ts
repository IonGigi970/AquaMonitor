import { createClient } from "@/lib/supabase/server";

// Lista de administratori, citită din variabila de mediu ADMIN_EMAILS
// (separată prin virgule). Adresa implicită e cea a contului de administrare.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "aquamonitorct@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

/**
 * Verifică pe server dacă cererea vine de la un administrator autentificat.
 *
 * Verificarea se face pe sesiunea Supabase (cookie), nu pe un header trimis de
 * client: un header cu adresa de admin poate fi trimis de oricine, iar adresa
 * de admin e publică (apare în footer).
 */
export async function esteAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}
