// Cârlig de rezolvare a modulelor pentru teste:
//  1. înlocuiește @supabase/supabase-js cu un client fals, ca testele să nu
//     atingă baza de date reală (namespace-urile de module sunt read-only, deci
//     nu se poate suprascrie createClient după import);
//  2. transformă "@/x" în "<rădăcină>/x", la fel ca aliasul din tsconfig.json;
//  3. adaugă extensia lipsă la importurile relative și la "next/server", pe care
//     Next.js le rezolvă singur, dar Node le cere scrise complet.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const RADACINA = path.resolve(import.meta.dirname, "..", "..");

export async function resolve(specifier, context, nextResolve) {
  // 1. Orice import al pachetului ajunge la clientul fals din teste, ca botul și
  // testele să folosească aceeași bază de date (vezi supabase-client-fals.ts).
  if (specifier === "@supabase/supabase-js") {
    return nextResolve(
      pathToFileURL(path.join(import.meta.dirname, "supabase-client-fals.ts")).href,
      context
    );
  }
  // 2. Aliasul "@/" din tsconfig (Next rezolvă și fără extensie).
  if (specifier.startsWith("@/")) {
    const cale = path.join(RADACINA, specifier.slice(2));
    // Next.js rezolvă și fără extensie ("@/lib/env" -> lib/env.ts); Node nu.
    for (const varianta of [cale, `${cale}.ts`, `${cale}.tsx`, path.join(cale, "index.ts")]) {
      if (fs.existsSync(varianta) && fs.statSync(varianta).isFile()) {
        return nextResolve(pathToFileURL(varianta).href, context);
      }
    }
    return nextResolve(pathToFileURL(cale).href, context);
  }
  // Next.js permite importul "next/server" fără extensie; Node nu. Adăugăm
  // extensia, ca route.ts să poată fi importat direct în teste.
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  // 3. Importurile relative fără extensie din codul aplicației și din teste.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
    const cale = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const varianta of [`${cale}.ts`, `${cale}.tsx`, path.join(cale, "index.ts")]) {
      if (fs.existsSync(varianta)) return nextResolve(pathToFileURL(varianta).href, context);
    }
  }
  return nextResolve(specifier, context);
}

