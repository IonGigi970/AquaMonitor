"""Funcții utilitare generale: normalizare de text si data României."""

import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

def normalizeaza_text(text):
    """Aceeași logică de normalizare ca în frontend (fără diacritice, litere mici, fără prefixe)."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    for prefix in ["strada ", "str. ", "bulevardul ", "bd. ", "b-dul ", "alee ", "aleea ", "intrarea ", "cartier ", "cartierul "]:
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.strip()


def azi_bucuresti():
    """Data curentă în fusul orar al României (Europe/Bucharest), ca obiect date.

    Site-ul și notificările raportează la ziua calendaristică din România,
    nu la UTC (GitHub Actions rulează în UTC, unde ora locală e decalată).
    """
    return datetime.now(ZoneInfo("Europe/Bucharest")).date()


def contine_substring(a, b):
    """True dacă a e subșir al lui b, dar niciunul gol ("" in "x" e True în Python,
    ceea ce ar potrivi orice avarie cu orice abonat când un câmp e gol)."""
    return bool(a) and bool(b) and a in b
