import { createBrowserClient } from "@supabase/ssr";

function cleanEnv(value?: string): string {
  if (!value) return "";
  // Elimina BOM (Byte Order Mark) si alte whitespace-uri invizibile
  return value.replace(/^\uFEFF/, "").trim();
}

/**
 * Client Supabase pentru componente de tip "client" (browser).
 * Foloseste cheile publice din .env.local.
 */
export function createClient() {
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
