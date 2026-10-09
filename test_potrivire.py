"""Teste pentru se_potriveste_abonamentul: AND pe strada+cartier DOAR cand avaria
specifica ambele campuri; altfel se potriveste pe campul precizat.

Ruleaza cu: python test_potrivire.py
Iesire: [OK]/[FAIL] per caz, exit 0 daca toate trec, 1 altfel.
"""

import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "placeholder")
os.environ.setdefault("GEMINI_API_KEY", "placeholder")

from aquamonitor.notificari.abonati import se_potriveste_abonamentul
from aquamonitor.utils import normalizeaza_text

# (nume, strada_ab, cartier_ab, strada_av, cartier_av, text_zona, asteptat)
CAZURI = [
    # --- Date reale din baza de date ---
    # Costin: strada revolutiei + cartier piata ovidiu, avarie pe strada Tomis (fara cartier)
    ("real: revolutiei+piata ovidiu vs Tomis",
     "revolutiei din 22 decembrie 1989", "piata ovidiu", "tomis", "", "", False),
    # Costin: doar cartier tomis 3, avarie pe strada Tomis
    ("real: cartier tomis 3 vs Tomis", "", "tomis 3", "tomis", "", "", True),
    # Alin: strada tomis + cartier palazu mare, avarie pe strada Tomis (fara cartier).
    # Avaria specifica doar strada, iar strada abonatului se potriveste → PRIMESTE alerta.
    ("real: tomis+palazu mare vs Tomis", "tomis", "palazu mare", "tomis", "", "", True),
    # Abonament pe toata localitatea (fara strada/cartier)
    ("real: toata localitatea", "", "", "tomis", "", "", True),

    # --- Logica AND: DOAR cand avaria specifica ambele campuri ---
    ("AND: ambele in structuri", "tomis", "palazu mare", "tomis", "palazu mare", "", True),
    ("AND: avaria doar cu strada, strada abonatului se potriveste",
     "tomis", "palazu mare", "tomis", "", "", True),
    ("AND: avaria doar cu cartier, cartierul abonatului se potriveste",
     "tomis", "palazu mare", "", "palazu mare", "", True),
    ("AND: niciunul", "tomis", "palazu mare", "bucuresti", "far", "", False),
    ("AND: avaria cu ambele, doar strada se potriveste",
     "tomis", "palazu mare", "tomis", "far", "", False),
    ("AND: avaria cu ambele, doar cartierul se potriveste",
     "tomis", "palazu mare", "bucuresti", "palazu mare", "", False),
    ("AND: cartier in strada avariei (incrucisat)",
     "tomis", "palazu mare", "palazu mare", "", "", True),
    ("AND: strada in cartierul avariei (incrucisat)",
     "tomis", "palazu mare", "", "tomis", "", True),

    # --- Logica OR: un singur camp completat ---
    ("OR: doar cartier, potrivit", "", "palazu mare", "tomis", "palazu mare", "", True),
    ("OR: doar cartier, nepotrivit", "", "palazu mare", "tomis", "", "", False),
    ("OR: doar strada, potrivit", "tomis", "", "tomis", "palazu mare", "", True),
    ("OR: doar strada, nepotrivit", "tomis", "", "bucuresti", "", "", False),

    # --- Potrivire bidirectionala pe substring ---
    ("substring: abonat lung, anunt scurt", "revolutiei din 22 decembrie 1989", "", "revolutiei", "", "", True),
    ("substring: abonat scurt, anunt lung", "revolutiei", "", "revolutiei din 22 decembrie 1989", "", "", True),

    # --- text_zona (deconectari programate): orice termen gasit in text se potriveste ---
    ("text_zona: ambele in text", "tomis", "palazu mare", "", "", "zona tomis si palazu mare", True),
    ("text_zona: doar strada in text", "tomis", "palazu mare", "", "", "zona tomis", True),
    ("text_zona: doar cartier in text", "tomis", "palazu mare", "", "", "zona palazu mare", True),
    ("text_zona: niciunul in text", "tomis", "palazu mare", "", "", "zona bucuresti", False),
    ("text_zona OR: un singur camp, potrivit", "tomis", "", "", "", "zona tomis nr 281", True),
    ("text_zona OR: un singur camp, nepotrivit", "tomis", "", "", "", "zona bucuresti", False),
    ("text_zona: granita de cuvant", "tomis", "", "", "", "b-dul tomis nr 281", True),
    ("text_zona: fara granita de cuvant (tomisul nu prinde)", "tomis", "", "", "", "zona tomisul", False),
    ("text_zona: structuri nepotrivite, text potrivit",
     "tomis", "palazu mare", "", "", "zona palazu mare si tomis", True),

    # --- Graniță de cuvânt pe câmpuri structurate (nu doar text_zona) ---
    ("structuri: 'mai' nu prinde 'mamaia'", "", "mai", "", "mamaia", "", False),
    ("structuri: 'tomis' nu prinde 'tomisul'", "tomis", "", "tomisul", "", "", False),
    ("structuri: 'far' nu prinde 'farului'", "far", "", "farului", "", "", False),
    ("structuri: 'palazu' nu prinde fragmentul din 'palazu mare' fara granita gresita",
     "", "palazu", "", "palazu mare", "", True),

    # --- Zone distincte (cartier diferit, desi incepe cu acelasi cuvant) ---
    ("zone distincte: Alin (tomis+palazu mare) nu se potriveste cu cartierul Tomis Nord",
     "tomis", "palazu mare", "", "ct tomis nord", "", False),
    ("zone distincte: nu afecteaza cazul Costin (cartier tomis 3 vs strada tomis)",
     "", "tomis 3", "tomis", "", "", True),
    ("zone distincte: abonat chiar pe Tomis Nord tot se potriveste",
     "", "tomis nord", "", "ct tomis nord", "", True),
]


def main():
    esecuri = 0
    for nume, strada_ab, cartier_ab, strada_av, cartier_av, text_zona, asteptat in CAZURI:
        rezultat = se_potriveste_abonamentul(
            normalizeaza_text(strada_ab),
            normalizeaza_text(cartier_ab),
            normalizeaza_text(strada_av),
            normalizeaza_text(cartier_av),
            normalizeaza_text(text_zona),
        )
        if rezultat == asteptat:
            print(f"[OK]   {nume}")
        else:
            esecuri += 1
            print(f"[FAIL] {nume}: asteptat={asteptat}, obtinut={rezultat}")
    print(f"\n{len(CAZURI) - esecuri}/{len(CAZURI)} cazuri trecute.")
    sys.exit(1 if esecuri else 0)


if __name__ == "__main__":
    main()
