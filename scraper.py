"""AquaMonitor CT - punctul de intrare al scraper-ului.

O singura rulare face, in ordine:
  1. curata avariile vechi din baza de date;
  2. preia avariile de apa din articolele RAJA (extragere cu AI);
  3. sincronizeaza intreruperile de energie electrica (accidentale + programate);
  4. reincearca notificarile care au esuat la rulari anterioare;
  5. trimite adminului un rezumat al livrarilor.

Fiecare faza ruleaza izolat: daca una cade, restul continua (ex: cand API-ul de
curent e picat, avariile de apa se preiau in continuare), iar la final adminul
primeste pe email eroarea exacta, cu tot cu traceback.

Codul propriu-zis sta in pachetul `aquamonitor/`, impartit pe domenii:
  - aquamonitor/config.py        - variabile de mediu, clienti, constante
  - aquamonitor/apa.py           - avarii de apa (RAJA)
  - aquamonitor/curent/          - energie electrica (Rețele Electrice)
  - aquamonitor/notificari/      - email, Telegram, potrivirea cu abonamentele
  - aquamonitor/geocodare.py     - adrese -> coordonate GPS
  - aquamonitor/ai_extract.py    - extragerea avariilor din text, cu Gemini

Rulare: python scraper.py
Test:   python scraper.py --test-notificare <id_abonament>
"""

import sys
import traceback

from aquamonitor.apa import curata_avarii_vechi, sincronizeaza_apa
from aquamonitor.curent.accidentale import sincronizeaza_intreruperi_curent
from aquamonitor.curent.programate import sincronizeaza_intreruperi_programate
from aquamonitor.notificari.abonati import (
    reincearca_notificari_esuate,
    trimite_notificare_test,
    trimite_rezumat_rulare,
)
from aquamonitor.notificari.email import trimite_alerta_eroare

# Fazele unei rulari normale, in ordine. Rulate izolat (vezi ruleaza_scanare).
FAZE = (
    ("Curatare avarii vechi", curata_avarii_vechi),
    ("Sincronizare avarii apa (RAJA)", sincronizeaza_apa),
    ("Sincronizare intreruperi curent (accidentale)", sincronizeaza_intreruperi_curent),
    ("Sincronizare intreruperi curent (programate)", sincronizeaza_intreruperi_programate),
    ("Reincercare notificari esuate", reincearca_notificari_esuate),
    ("Rezumat pentru admin", trimite_rezumat_rulare),
)


def ruleaza_scanare():
    """Ruleaza toate fazele, izolat intre ele. Intoarce codul de iesire.

    O faza care cade nu opreste restul: avariile de apa preluate deja trebuie
    notificate chiar daca sursa de curent e indisponibila, iar daca ceva a cazut,
    adminul primeste un email cu eroarea completa (nimeni nu citeste logurile
    GitHub Actions decat cand stie ca are ce cauta).
    """
    erori = []

    for nume, faza in FAZE:
        try:
            faza()
        except Exception:
            detaliu = traceback.format_exc()
            erori.append((nume, detaliu))
            print(f"\u274c Eroare la \u201e{nume}\u201d:\n{detaliu}")

    if erori:
        try:
            trimite_alerta_eroare(erori)
        except Exception as e:
            # Emailul de alerta e ultimul lucru care mai poate salva diagnoza,
            # dar daca si el cade, macar codul de iesire sa fie corect.
            print(f"\u26a0\ufe0f Nu am putut trimite emailul cu erorile: {e}")
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--test-notificare":
        try:
            reusit = trimite_notificare_test(sys.argv[2])
        except Exception:
            detaliu = traceback.format_exc()
            print(detaliu)
            trimite_alerta_eroare([("Notificarea de test", detaliu)])
            sys.exit(1)
        sys.exit(0 if reusit else 1)
    sys.exit(ruleaza_scanare())
