"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/**
 * Utilizatorul autentificat curent, actualizat automat la login/logout.
 *
 * Era descris de mână în fiecare pagină care are nevoie de el (abonare la
 * onAuthStateChange, curățare la demontare). Acum stă într-un singur loc.
 * `incarcat` spune dacă răspunsul a venit deja, ca să nu pâlpâie interfața
 * între "delogat" și "logat" la prima randare.
 */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [incarcat, setIncarcat] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setIncarcat(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIncarcat(true);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, incarcat };
}
