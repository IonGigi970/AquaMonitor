import { createBrowserClient } from "@supabase/ssr";
import { cleanEnv } from "@/lib/env";


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
