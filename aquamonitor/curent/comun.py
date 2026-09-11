"""Elemente comune pentru energia electrica: localitati, județe, canonizare."""

import re

# Localități din județul Constanța (normalizate). API-ul anunță uneori doar zona
# (ex: "NAVODARI"), alteori o zonă dintr-un oraș mare fără numele orașului
# (ex: "PALAS" = zonă din Constanța) — lista ne ajută să recunoaștem numele.
LOCALITATI_CONSTANTA = {
    "constanta", "navodari", "medgidia", "mangalia", "harsova", "ovidiu",
    "eforie nord", "eforie sud", "techirghiol", "murfatlar", "cernavoda",
    "valu lui traian", "lumina", "corbu", "mihail kogalniceanu", "agigea",
    "basarabi", "cumpana", "topraisar", "comana", "23 august", "costinesti",
    "limanu", "negru voda", "cogealac", "dobromir", "garliciu", "ghindaresti",
    "gradina", "independenta", "ion corvin", "istria", "lipnita", "mereni",
    "mihai viteazu", "mircea voda", "nicolae balcescu", "olari", "ostrov",
    "pantelimon", "pecineaga", "pestera", "poarta alba", "rasova", "sacele",
    "saraiu", "seimeni", "silistea", "targusor", "tuzla", "vulturu",
    "2 mai", "doua mai", "baneasa", "saligny",
}


# Nume canonice (cu diacritice) pentru județele Rețele Electrice — ArcGIS le trimite
# cu litere mari și fără diacritice; PDF-ul le are deja corecte.
JUDETE_CANONICE = {
    "ARAD": "Arad", "CARAS-SEVERIN": "Caraș-Severin", "CARAȘ-SEVERIN": "Caraș-Severin",
    "HUNEDOARA": "Hunedoara", "TIMIS": "Timiș", "TIMIȘ": "Timiș",
    "CONSTANTA": "Constanța", "TULCEA": "Tulcea", "IALOMITA": "Ialomița",
    "IALOMIȚA": "Ialomița", "CALARASI": "Călărași", "CĂLĂRAȘI": "Călărași",
    "GIURGIU": "Giurgiu", "ILFOV": "Ilfov", "BUCURESTI": "București",
    "BUCUREȘTI": "București", "TELEORMAN": "Teleorman", "PRAHOVA": "Prahova",
    "DAMBOVITA": "Dâmbovița", "DÂMBOVIȚA": "Dâmbovița",
}


def judet_canonizat(nume):
    """Normalizează numele unui județ la forma cu diacritice (ex: CONSTANTA → Constanța)."""
    if not nume:
        return ""
    curat = re.sub(r"[\s\d]+$", "", str(nume)).strip()
    return JUDETE_CANONICE.get(curat.upper(), curat)
