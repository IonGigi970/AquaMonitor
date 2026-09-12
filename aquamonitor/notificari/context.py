"""Contextul comun al notificărilor: câmpurile derivate dintr-o avarie.

Emailul și mesajul Telegram afișează aceleași informații (dată, locație, status,
interval, descriere) — doar formatarea diferă. Derivarea lor stă aici o singură
dată, ca cele două canale să nu poată ajunge să afișeze lucruri diferite.
"""

from ..config import (
    ETICHETE_SERVICIU,
    ETICHETE_TIP_INTRERUPERE,
    SERVICIU_APA,
    SERVICIU_CURENT,
    STATUS_ANULATA,
    STATUSURI_AFISATE,
)
from ..utils import zona_avariei


def escape_markdown(text):
    """Escapează caracterele care au sens în Markdown-ul Telegram.

    Textul avariilor vine din anunțuri RAJA și din PDF-ul operatorului, deci poate
    conține `_`, `*`, `[` sau backtick. Trimise neescape-ate, Telegram respinge
    mesajul cu 400 și notificarea rămâne nemarcată (se reîncearcă la infinit).
    """
    for caracter in ("_", "*", "[", "`"):
        text = text.replace(caracter, "\\" + caracter)
    return text


def pregateste_context(avarie):
    """Derivă câmpurile afișate în notificări dintr-un rând de avarie.

    Returnează un dicționar, nu HTML sau text: fiecare canal își formatează
    singur mesajul, dar pornește de la aceleași valori.
    """
    serviciu = avarie.get("serviciu") or SERVICIU_APA
    judet = avarie.get("judet") or ""
    localitate = avarie.get("localitate") or ""

    # Județul se afișează doar la energie electrică: la apă localitatea e unică
    # în aria de acoperire, iar județul ar încărca inutil mesajul.
    locatie = f"{localitate} (jud. {judet})" if judet and serviciu == SERVICIU_CURENT else localitate

    tip = avarie.get("tip_intrerupere")
    status = avarie.get("status")
    data_inceput = avarie.get("data_inceput") or ""
    data_sfarsit = avarie.get("data_sfarsit") or ""

    return {
        "data": avarie.get("data") or "",
        "serviciu": serviciu,
        "eticheta_serviciu": ETICHETE_SERVICIU.get(serviciu, serviciu),
        "tip": tip,
        "eticheta_tip": ETICHETE_TIP_INTRERUPERE.get(tip, "Întrerupere"),
        "status": status,
        "status_afisat": STATUSURI_AFISATE.get(status, status or "?"),
        "anulata": status == STATUS_ANULATA,
        "zona": zona_avariei(avarie),
        "localitate": localitate,
        "locatie": locatie,
        "interval": f"{data_inceput} - {data_sfarsit}".strip(" -"),
        "descriere": avarie.get("descriere_text") or "",
    }
