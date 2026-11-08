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

from aquamonitor.apa import completeaza_cartiere_lipsa, extrage_cartiere_din_text
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
    ("text_zona: doar strada in text -> ambele completate acum cer AND, deci NU", "tomis", "palazu mare", "", "", "zona tomis", False),
    ("text_zona: doar cartier in text -> ambele completate cer AND, deci NU", "tomis", "palazu mare", "", "", "zona palazu mare", False),
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

    # --- strict_and: doar potriviri exacte pe ambele campuri ---
    # Formatul aici are 8 campuri: (nume, strad_ab, cartier_ab, strad_av, cartier_av, text, asteptat, strict)
    ("strict: ambele campuri in avarie completa (potrivire) trece",
     "tomis", "palazu mare", "tomis", "palazu mare", "", True, True),
    ("strict: avarie doar cu strada NU se mai trimite (cartierul nu poate fi verificat)",
     "tomis", "palazu mare", "tomis", "", "", False, True),
    ("strict: avarie doar cu cartier NU se mai trimite (strada nu poate fi verificata)",
     "tomis", "palazu mare", "", "palazu mare", "", False, True),
    ("strict: avarie cu ambele dar doar unul se potriveste -> nu se trimite",
     "tomis", "palazu mare", "tomis", "gara", "", False, True),
    ("strict: avarie cu ambele, ambele potrivite -> se trimite",
     "tomis", "palazu mare", "tomis", "palazu mare", "zona tomis palazu mare", True, True),
    ("strict: avarie cu ambele, niciunul potrivit -> nu se trimite",
     "tomis", "palazu mare", "1 mai", "gara", "", False, True),
    ("strict: avarie cu ambele potrivite incrucisat -> se trimite",
     "tomis", "palazu mare", "palazu mare", "tomis", "", True, True),
    ("strict: un singur camp completat nu e afectat (strada se potriveste)",
     "tomis", "", "tomis", "", "", True, True),
    ("strict: un singur camp completat nu e afectat (nu se potriveste)",
     "tomis", "", "1 mai", "", "", False, True),
    ("strict: programata curent, zona doar in text, ambele in text -> se trimite",
     "tomis", "palazu mare", "", "", "zona bulevardul tomis si cartierul palazu mare", True, True),
    ("strict: programata curent, zona doar in text, doar unul in text -> nu se trimite",
     "tomis", "palazu mare", "", "", "zona bulevardul tomis", False, True),

    # --- Potrivirea pe numere (de casa/bloc) ---
    ("numere: abonat tomis 281, avarie tomis 285 -> NU (scara diferita)",
     "tomis 281", "", "tomis 285", "", "", False),
    ("numere: abonat tomis 281, avarie tomis (fara numar) -> da",
     "tomis 281", "", "tomis", "", "", True),
    ("numere: abonat tomis 281, avarie bd tomis nr 281 -> da",
     "tomis 281", "", "bd tomis nr 281", "", "", True),
    ("numere: cartier tomis 3 vs strada tomis (denumire fara nr) -> da",
     "", "tomis 3", "tomis", "", "", True),
    ("numere: abonat unirii 4a, avarie strada unirii -> da",
     "unirii 4a", "", "unirii", "", "", True),
    ("numere: abonat unirii 4a, avarie strada unirii 12 -> NU",
     "unirii 4a", "", "unirii 12", "", "", False),
    ("numere: abonat 1 mai 1a, avarie strada 1 mai -> da (acelasi numar 1)",
     "1 mai 1a", "", "1 mai", "", "", True),
]


ANUNT_MULTI_ZONA = (
    "furnizarea apei potabile este sistată către consumatorii din: perimetrul delimitat de "
    "bd. I.C. Brătianu – Oborului – I.L. Caragiale – Dezrobirii; cartierele Casa de Cultură, "
    "Coiciu, Gară, Abator, CET și Km 4. Având în vedere diametrul magistralei."
)


def verifica_plasa_cartiere():
    """Plasa de siguranță pentru anunțurile multi-zonă (bug 7 nov 2026: AI-ul a
    reținut doar „Topolog", locul conductei, și a pierdut cele 6 cartiere)."""
    esecuri = 0

    cartiere = extrage_cartiere_din_text(ANUNT_MULTI_ZONA)
    asteptate = ["Casa de Cultură", "Coiciu", "Gară", "Abator", "CET", "Km 4"]
    if cartiere == asteptate:
        print("[OK]   plasa: cartierele se citesc din textul anunțului")
    else:
        esecuri += 1
        print(f"[FAIL] plasa: cartiere extrase={cartiere}")

    avarii = [{"localitate": "Constanța", "strada": "Topolog", "cartier": "",
               "status": "AVARIE", "data": "2026-11-07"}]
    rezultat = completeaza_cartiere_lipsa(avarii, ANUNT_MULTI_ZONA)
    if len(rezultat) == 7 and [a["cartier"] for a in rezultat[1:]] == asteptate:
        print("[OK]   plasa: 6 avarii de cartier adăugate, strada goală pe ele")
    else:
        esecuri += 1
        print(f"[FAIL] plasa: {len(rezultat)} avarii, cartiere={[a['cartier'] for a in rezultat]}")

    deja = [{"localitate": "Constanța", "strada": "", "cartier": "Coiciu", "status": "AVARIE"}]
    if completeaza_cartiere_lipsa(deja, ANUNT_MULTI_ZONA) == deja:
        print("[OK]   plasa: nu intervine când AI-ul a completat deja un cartier")
    else:
        esecuri += 1
        print("[FAIL] plasa: a modificat o extragere corectă")

    if completeaza_cartiere_lipsa(avarii, "Sistare apa pe strada Tomis.") == avarii:
        print("[OK]   plasa: anunț fără enumerare de cartiere rămâne neschimbat")
    else:
        esecuri += 1
        print("[FAIL] plasa: a modificat un anunț fără cartiere")

    return esecuri


def main():
    esecuri = 0
    for caz in CAZURI:
        nume, strada_ab, cartier_ab, strada_av, cartier_av, text_zona, asteptat = caz[:7]
        strict = caz[7] if len(caz) > 7 else False
        rezultat = se_potriveste_abonamentul(
            normalizeaza_text(strada_ab),
            normalizeaza_text(cartier_ab),
            normalizeaza_text(strada_av),
            normalizeaza_text(cartier_av),
            normalizeaza_text(text_zona),
            strict,
        )
        if rezultat == asteptat:
            print(f"[OK]   {nume}")
        else:
            esecuri += 1
            print(f"[FAIL] {nume}: asteptat={asteptat}, obtinut={rezultat}")
    esecuri_plasa = verifica_plasa_cartiere()
    print(f"\n{len(CAZURI) - esecuri}/{len(CAZURI)} cazuri de potrivire trecute.")
    print(f"{4 - esecuri_plasa}/4 verificări ale plasei de cartiere trecute.")
    sys.exit(1 if (esecuri or esecuri_plasa) else 0)


if __name__ == "__main__":
    main()
