"""AquaMonitor CT - punctul de intrare al scraper-ului.

O singura rulare face, in ordine:
  1. curata avariile vechi din baza de date;
  2. preia avariile de apa din articolele RAJA (extragere cu AI);
  3. sincronizeaza intreruperile de energie electrica (accidentale + programate);
  4. reincearca notificarile care au esuat la rulari anterioare.

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

from aquamonitor.apa import curata_avarii_vechi, sincronizeaza_apa
from aquamonitor.curent.accidentale import sincronizeaza_intreruperi_curent
from aquamonitor.curent.programate import sincronizeaza_intreruperi_programate
from aquamonitor.notificari.abonati import (
    reincearca_notificari_esuate,
    trimite_notificare_test,
)


def ruleaza_scanare():
    curata_avarii_vechi()

    sincronizeaza_apa()

    # Întreruperile de curent (Rețele Electrice): accidentale din API + programate din PDF
    sincronizeaza_intreruperi_curent()
    sincronizeaza_intreruperi_programate()

    # Faza de reîncercare: notificările eșuate la rulările anterioare
    # (sau chiar în această rulare) sunt reluate acum.
    reincearca_notificari_esuate()


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--test-notificare":
        sys.exit(0 if trimite_notificare_test(sys.argv[2]) else 1)
    ruleaza_scanare()
