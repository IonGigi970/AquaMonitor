"""AquaMonitor CT - pachetul cu logica scraper-ului.

Punctul de intrare rămâne `scraper.py` (din rădăcina proiectului), care doar
orchestrează modulele de aici, pe domenii:

  config.py            - variabile de mediu, clienți (Supabase, Gemini), constante
  utils.py             - normalizare de text, data României
  geocodare.py         - adrese -> coordonate GPS (Nominatim/OpenStreetMap)
  ai_extract.py        - extragerea avariilor din textul articolelor, cu Gemini
  apa.py               - avarii de apă: articole RAJA -> baza de date
  curent/              - energie electrică (Rețele Electrice)
    comun.py           -     localități, județe, canonizarea lor
    accidentale.py     -     întreruperi active, din API-ul ArcGIS
    programate.py      -     deconectări viitoare, din PDF-ul săptămânal
  notificari/          - trimiterea alertelor
    email.py           -     Gmail SMTP / Resend + loguri admin
    telegram.py        -     botul @JimmyWaterBot
    abonati.py         -     potrivirea avariilor cu abonamentele
"""
