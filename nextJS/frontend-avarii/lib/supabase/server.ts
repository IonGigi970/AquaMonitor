import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase pentru Server Components / Route Handlers.
 * In Next.js 16, cookies() este async, deci si aceasta functie este async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Poate fi apelat dintr-un Server Component, unde setarea cookie-urilor
            // nu este permisa. Se poate ignora daca exista middleware care
            // reimprospateaza sesiunea.
          }
        },
      },
    }
  );
}
