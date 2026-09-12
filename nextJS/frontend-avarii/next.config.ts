import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fără asta, Turbopack pornește căutarea rădăcinii din folderul părinte
  // al repo-ului și găsește acolo un package-lock.json străin, pe care apoi
  // îl ignoră cu un warning la fiecare build. Fixând rădăcina pe folderul
  // aplicației, build-ul e determinist indiferent unde e clonat proiectul.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
