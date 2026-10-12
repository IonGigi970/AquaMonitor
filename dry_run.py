"""Dry-run: simuleaza o avarie si arata exact cine ar primi alerta si de ce,
fara sa trimita NIMIC (nici email, nici Telegram, fara scrieri in baza de date).

Folosire:
    python dry_run.py --serviciu apa --localitate "Constanta" --strada "Tomis"
    python dry_run.py --serviciu curent --localitate "Constanta" --judet "Constanta" \
        --cartier "Tomis Nord"
    python dry_run.py --serviciu curent --localitate "Constanta" --text "zona b-dul Tomis 30"

Flag-uri:
    --serviciu apa|curent (implicit: apa)
    --localitate  localitatea avariei (obligatoriu)
    --judet       judetul (doar la curent)
    --strada      strada avariei (optional)
    --cartier     cartierul avariei (optional)
    --text        textul anuntului (pentru deconectari programate de curent)
"""

import argparse
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from aquamonitor.config import CANAL_EMAIL, CANAL_TELEGRAM, SERVICIU_APA, SERVICIU_CURENT
from aquamonitor.notificari.abonati import (
    clasifica_potrivirea,
    se_potriveste_abonamentul,
)
from aquamonitor.utils import normalizeaza_text


def main():
    parser = argparse.ArgumentParser(description="Dry-run: cine ar primi alerta pentru o avarie fictiva?")
    parser.add_argument("--serviciu", choices=[SERVICIU_APA, SERVICIU_CURENT], default=SERVICIU_APA)
    parser.add_argument("--localitate", required=True)
    parser.add_argument("--judet", default="")
    parser.add_argument("--strada", default="")
    parser.add_argument("--cartier", default="")
    parser.add_argument("--text", default="")
    args = parser.parse_args()

    localitate_norm = normalizeaza_text(args.localitate)
    strada_norm = normalizeaza_text(args.strada)
    cartier_norm = normalizeaza_text(args.cartier)
    text_zona = normalizeaza_text(args.text)
    judet_avarie = normalizeaza_text(args.judet) if args.serviciu == SERVICIU_CURENT else ""

    from aquamonitor.notificari.abonati import _incarca_abonamente

    abonamente = [
        a for a in _incarca_abonamente()
        if a.get("serviciu") == args.serviciu
        and normalizeaza_text(a.get("localitate_interes")) == localitate_norm
    ]

    print(f"Dry-run: avarie {args.serviciu} in {args.localitate}"
          + (f", judet {args.judet}" if judet_avarie else "")
          + (f", strada «{args.strada}»" if strada_norm else "")
          + (f", cartier «{args.cartier}»" if cartier_norm else "")
          + (f", text «{args.text[:60]}»" if text_zona else ""))
    print()

    def eticheta_canal(tip):
        return {CANAL_EMAIL: "Email", CANAL_TELEGRAM: "Telegram"}.get(tip, tip)

    def eticheta_zona(a):
        parti = []
        if a.get("strada_interes"):
            parti.append(f"str. {a['strada_interes']}")
        if a.get("cartier_interes"):
            parti.append(f"cart. {a['cartier_interes']}")
        return " + ".join(parti) if parti else "(toata localitatea)"

    potriviti = []
    nepotriviti = []

    for a in abonamente:
        if args.serviciu == SERVICIU_CURENT:
            judet_ab = normalizeaza_text(a.get("judet") or "")
            if judet_ab and (not judet_avarie or judet_avarie != judet_ab):
                nepotriviti.append((a, "judet diferit"))
                continue

        strada_ab = normalizeaza_text(a.get("strada_interes") or "")
        cartier_ab = normalizeaza_text(a.get("cartier_interes") or "")
        strict = bool(a.get("strict_and"))

        if se_potriveste_abonamentul(strada_ab, cartier_ab, strada_norm, cartier_norm, text_zona, strict):
            potriviti.append((a, clasifica_potrivirea(strada_ab, cartier_ab, strada_norm, cartier_norm, text_zona, strict)))
        else:
            nepotriviti.append((a, "zona nu se potriveste"))

    print("=== AR PRIMI ALERTA ===" if potriviti else "=== NIMENI NU AR PRIMI ALERTA ===")
    for a, tip in potriviti:
        print(f"  ✓ {a.get('valoare_contact'):<32} ({eticheta_canal(a.get('tip_contact'))}) "
              f"zona urmarita: {eticheta_zona(a)} | potrivire: {tip}")

    if nepotriviti:
        print()
        print("=== NU AR PRIMI (chiar daca sunt in aceeasi localitate) ===")
        for a, motiv in nepotriviti:
            print(f"  ✗ {a.get('valoare_contact'):<32} ({eticheta_canal(a.get('tip_contact'))}) "
                  f"zona urmarita: {eticheta_zona(a)} | motiv: {motiv}")

    print()
    print(f"Total abonamente act. in {args.localitate} ({args.serviciu}): {len(abonamente)} — "
          f"{len(potriviti)} ar fi notificati.")


if __name__ == "__main__":
    main()
