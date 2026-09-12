"""Funcții utilitare generale: normalizare de text, zona unei avarii, data României."""

import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

# Fusul orar folosit peste tot. Site-ul și notificările raportează la ziua
# calendaristică din România, nu la UTC (GitHub Actions rulează în UTC, unde ora
# locală e decalată).
FUS_ORAR = ZoneInfo("Europe/Bucharest")

# Textul afișat când avaria acoperă toată localitatea (fără stradă/cartier anume).
TOATA_LOCALITATEA = "Toată localitatea"

# Prefixe de adresă eliminate la normalizare („strada Verde” și „Verde” = același loc).
PREFIXE_STRADA = (
    "strada ", "str. ", "bulevardul ", "bd. ", "b-dul ", "alee ", "aleea ",
    "intrarea ", "cartier ", "cartierul ",
)


def normalizeaza_text(text):
    """Aceeași logică de normalizare ca în frontend (fără diacritice, litere mici, fără prefixe)."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    for prefix in PREFIXE_STRADA:
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.strip()


def zona_avariei(avarie):
    """Zona afectată, așa cum o citim în notificări: strada, altfel cartierul,
    altfel toată localitatea (o avarie fără zonă concretă acoperă localitatea)."""
    return avarie.get("strada") or avarie.get("cartier") or TOATA_LOCALITATEA


def acum_bucuresti():
    """Data și ora curentă în fusul orar al României."""
    return datetime.now(FUS_ORAR)


def azi_bucuresti():
    """Data curentă în fusul orar al României (Europe/Bucharest), ca obiect date.

    Site-ul și notificările raportează la ziua calendaristică din România,
    nu la UTC (GitHub Actions rulează în UTC, unde ora locală e decalată).
    """
    return acum_bucuresti().date()


def contine_substring(a, b):
    """True dacă a e subșir al lui b, dar niciunul gol ("" in "x" e True în Python,
    ceea ce ar potrivi orice avarie cu orice abonat când un câmp e gol)."""
    return bool(a) and bool(b) and a in b
