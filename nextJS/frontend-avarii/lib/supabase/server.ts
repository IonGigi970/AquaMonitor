import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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
