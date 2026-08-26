import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase pentru componente de tip "client" (browser).
 * Foloseste cheile publice din .env.local.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
