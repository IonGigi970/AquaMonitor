"""Geocodare: transforma adrese (localitate/strada/cartier) in coordonate GPS.

Foloseste Nominatim (OpenStreetMap), cu verificari suplimentare care elimina
pinii greșiți (statii de autobuz, strazi omonime din alt oras, portiuni de
footway din parc) - mai bine fara pin decat un pin greșit.
"""

import time

import requests

from .utils import normalizeaza_text

# Coordonate corecte pentru strazi pe care geocodarea (Nominatim/OpenStreetMap)
# le plaseaza gresit in mod constant (ex: o statie de autobuz in locul strazii,
# o strada omonima din alt oras, sau o portiune de footway din parc).
# Cheia = numele strazii normalizat (litere mici, fara diacritice, fara prefix "strada").
# Valoarea = (latitudine, longitudine) verificate manual pe harta.
COORDONATE_CUNOSCUTE = {
    "i.c. bratianu": (44.1705329, 28.6006419),   # bulevardul din Constanta (nu strada omonima din Mangalia)
    "soveja": (44.2014674, 28.6281196),          # segmentul din Tomis 3
    "rotterdam": (44.1996941, 28.6565113),       # portiunea rezidentiala, nu footway-ul din parc
    "pescarilor": (44.2013851, 28.6522633),      # strada reala, nu statia de autobuz
}


def este_punct_termic(cartier_curat):
    """Reperele de tip 'PT 3' / 'punct termic X' nu au o locație reală în OpenStreetMap.
    Cautarea lor esueaza mereu, iar fallback-ul pe centrul localitatii ar plasa un pin
    exact in mijlocul orasului, ceea ce e inselator (pare o locatie precisa, dar nu e).
    Le tratam separat: nu incercam sa le geocodam deloc."""
    if not cartier_curat:
        return False
    text = cartier_curat.strip()
    if text == "pt" or text.startswith("pt ") or text.startswith("pt."):
        return True
    return "punct termic" in text


# Tipuri de obiecte din reverse-geocoding care NU sunt o stradă reală (drum carosabil).
# O stație de autobuz sau o porțiune de footway din parc se numesc adesea la fel ca
# strada, dar nu sunt strada — le respingem explicit.
TIPURI_NON_DRUM = {"bus_stop", "footway", "path", "steps", "pedestrian", "cycleway", "track", "service", "bridleway"}


def verifica_strada(lat, lon, strada_curata):
    """Reverse-geocoding: confirmă că punctul (lat, lon) e chiar pe strada căutată.
    Geocodarea poate returna o stație de autobuz, o stradă omonimă din alt oraș sau
    o porțiune de footway din parc. Verificăm numele străzii la punctul găsit și
    respingem tipurile care nu sunt drum (bus_stop, footway etc.). Dacă nu se
    potrivește, respingem rezultatul (mai bine fără pin decât pin greșit)."""
    try:
        time.sleep(1)  # Pauză obligatorie pentru Nominatim
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=18"
        headers = {'User-Agent': 'AquaMonitorCT-Scraper/2.0'}
        raspuns = requests.get(url, headers=headers, timeout=15)
        if raspuns.status_code == 200:
            date = raspuns.json()
            tip = date.get("type", "")
            if tip in TIPURI_NON_DRUM:
                return False  # stație de autobuz / footway / etc., nu strada
            nume = date.get("display_name", "")
            nume_norm = normalizeaza_text(nume)
            strada_norm = normalizeaza_text(strada_curata)
            # Verificăm dacă numele străzii apare în adresa punctului găsit.
            # Folosim cuvinte întregi ca să nu confundăm "Verde" cu "Movila Verde".
            cuvinte = [c for c in strada_norm.split() if len(c) > 2]
            if cuvinte and all(c in nume_norm for c in cuvinte):
                return True
            return False
    except Exception as e:
        print(f"⚠️ Eroare la verificarea străzii {strada_curata}: {e}")
    return False


def alege_cel_mai_bun_rezultat(date, prefera_clasa):
    """Alege rezultatul cel mai potrivit din lista Nominatim.
    Nominatim ordoneaza dupa relevanta, dar uneori pune pe primul loc un rezultat
    inselator: o statie de autobuz in locul strazii, sau centrul poligonului
    administrativ in locul localitatii. Preferam clasa corecta:
    - 'highway' pentru strazi (exclude statii de autobuz, care sunt tot 'highway'
      dar au type 'bus_stop' -> le evitam explicit)
    - 'place' pentru localitati/cartiere (exclude 'boundary' = centrul poligonului)"""
    if not date:
        return None
    for r in date:
        if r.get("class") == prefera_clasa:
            if prefera_clasa == "highway" and r.get("type") == "bus_stop":
                continue  # statie de autobuz, nu strada
            return r
    return date[0]


def obtine_coordonate(localitate, strada, cartier=None):
    """Transformă o adresă în coordonate GPS cu reguli de curățare a textului."""
    try:
        strada_curata = strada.lower() if strada else ""
        cartier_curat = cartier.lower() if cartier else ""

        if "toată" in strada_curata or "nespecificata" in strada_curata or not strada_curata:
            # Dacă nu avem stradă, încercăm cartierul, altfel doar localitatea
            if cartier_curat and este_punct_termic(cartier_curat):
                # Nu geocodam punctele termice: nu au adresa reala, iar un pin
                # "aproximativ" in centrul orasului ar induce in eroare utilizatorii.
                # Avaria tot apare in lista textuala, doar nu primeste pin pe harta.
                return None, None
            if cartier_curat:
                query = f"{cartier_curat}, {localitate}, Romania"
                prefera_clasa = "place"
            else:
                query = f"{localitate}, Romania"
                prefera_clasa = "place"
        else:
            if "," in strada_curata:
                strada_curata = strada_curata.split(",")[0]
            strada_curata = strada_curata.replace("strada ", "").strip()
            # Daca strada e in lista celor cu coordonate cunoscute (verificate manual),
            # o folosim direct, fara sa mai apelam geocodarea nesigura.
            cheie = normalizeaza_text(strada_curata)
            if cheie in COORDONATE_CUNOSCUTE:
                return COORDONATE_CUNOSCUTE[cheie]
            # Adaugam "strada" ca indiciu pentru Nominatim, altfel nume scurte si comune
            # (ex: "Verde") sunt confundate cu localitati/zone omonime (ex: satul "Movila
            # Verde") in loc de strada respectiva din Constanta.
            query = f"strada {strada_curata}, {localitate}, Romania"
            prefera_clasa = "highway"

        time.sleep(1)  # Pauză obligatorie pentru Nominatim
        url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5"
        headers = {'User-Agent': 'AquaMonitorCT-Scraper/2.0'}

        raspuns = requests.get(url, headers=headers, timeout=15)

        if raspuns.status_code == 200:
            date = raspuns.json()
            ales = alege_cel_mai_bun_rezultat(date, prefera_clasa)
            if ales:
                lat, lon = float(ales['lat']), float(ales['lon'])
                # Pentru străzi, confirmăm că punctul e chiar pe strada căutată.
                # Dacă nu, încercăm următorii candidați; dacă niciunul nu se
                # potrivește, nu punem pin (mai bine fără pin decât pin greșit).
                if prefera_clasa == "highway":
                    for candidat in date:
                        if candidat.get("class") != "highway" or candidat.get("type") == "bus_stop":
                            continue
                        clat, clon = float(candidat['lat']), float(candidat['lon'])
                        if verifica_strada(clat, clon, strada_curata):
                            return clat, clon
                    return None, None
                return lat, lon
            else:
                if query != f"{localitate}, Romania":
                    fallback_url = f"https://nominatim.openstreetmap.org/search?q={localitate}, Romania&format=json&limit=5"
                    rasp_fallback = requests.get(fallback_url, headers=headers, timeout=15)
                    if rasp_fallback.status_code == 200:
                        ales_fallback = alege_cel_mai_bun_rezultat(rasp_fallback.json(), "place")
                        if ales_fallback:
                            return float(ales_fallback['lat']), float(ales_fallback['lon'])

    except Exception as e:
        print(f"⚠️ Eroare la geocoding pentru {localitate}: {e}")

    return None, None
