"""Deconectari programate (viitoare), preluate din PDF-ul saptamanal Rețele Electrice."""

import hashlib
import re
from datetime import date, datetime, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

import pdfplumber
import requests

from ..config import supabase
from ..db import citeste_toate
from ..notificari.abonati import notifica_abonatii, sterge_notificari_pentru_avarie
from ..utils import azi_bucuresti, normalizeaza_text
from .comun import LOCALITATI_CONSTANTA, judet_canonizat

# Curent electric: deconectări PROGRAMATE (viitoare) din PDF-ul săptămânal
# publicat de Rețele Electrice (TOATE județele). API-ul ArcGIS conține doar
# întreruperile deja active; anunțurile viitoare există doar în PDF, pe care
# îl descărcăm cu pdfplumber (citește corect textul așezat pe coloane).
PAGINA_PDF_INTRERUPERI = "https://www.reteleelectrice.ro/en/outages/planned/"


UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


ZIUA_SAPTAMANII = r"(Luni|Marți|Miercuri|Joi|Vineri|Sâmbătă|Duminică)"


# Cuvinte care fac parte din localități compuse ("Zorlențu Mare", "Vama Veche",
# "Petru Rareș") și rămân uneori la începutul detaliilor după tăierea localității
# (normalizate, fără diacritice).
ATASABILE_LOCALITATII = {
    "mare", "mic", "veche", "noua", "nou", "vechi", "rares", "pitarului",
    "barzii", "copaceni", "boinei", "de sus", "de jos", "de mijloc",
}


def descarca_pdf_intreruperi_programate():
    """Descarcă PDF-ul săptămânal cel mai recent publicat și întoarce textul extras.

    Se alege PDF-ul cu cea mai mare dată de sfârșit: dacă Rețele Electrice a
    publicat deja săptămâna viitoare (de regulă vinerea), îl luăm pe acela, ca
    anunțurile noi să apară în aplicație cât mai devreme."""
    try:
        pagina = requests.get(PAGINA_PDF_INTRERUPERI,
                              headers={"User-Agent": UA_BROWSER, "Accept": "text/html"},
                              timeout=30)
        if pagina.status_code != 200:
            print(f"⚠️ Pagina de programate a răspuns {pagina.status_code}.")
            return None
    except Exception as e:
        print(f"⚠️ Eroare la descărcarea paginii de programate: {e}")
        return None

    url_pdf = None
    end_max = None
    for m in re.finditer(
            r'href="([^"]*outageapp_pdf/Intreruperi%20programate%20'
            r'(\d{2})\.(\d{2})\.(\d{4})%20-%20(\d{2})\.(\d{2})\.(\d{4})\.pdf[^"]*)"',
            pagina.text):
        url = m.group(1).replace("&amp;", "&")
        try:
            end = date(int(m.group(7)), int(m.group(6)), int(m.group(5)))
        except Exception:
            continue
        if end_max is None or end > end_max:
            end_max = end
            url_pdf = url
    if not url_pdf:
        print("⚠️ Nu am găsit niciun PDF de programate pe pagina oficială.")
        return None

    try:
        pdf = requests.get(url_pdf, headers={"User-Agent": UA_BROWSER}, timeout=60)
        if pdf.status_code != 200:
            print(f"⚠️ PDF-ul a răspuns {pdf.status_code}.")
            return None
        with pdfplumber.open(BytesIO(pdf.content)) as cititor:
            # Pagina 1 (index 0) = titlu + cuprins; rândurile încep de la pagina 2.
            text = "\n".join((p.extract_text() or "") for p in cititor.pages[1:])
        # Diacriticele din fonturile PDF-ului vin uneori cu forme vechi (ã, ş, ţ)
        text = (text.replace("ã", "ă").replace("Ã", "Ă")
                    .replace("ş", "ș").replace("Ş", "Ș")
                    .replace("ţ", "ț").replace("Ţ", "Ț"))
        return text if text.strip() else None
    except Exception as e:
        print(f"⚠️ Eroare la descărcarea/parsarea PDF-ului: {e}")
        return None


def parseaza_intreruperi_programate(text_pdf):
    """Extrage din PDF deconectările programate, grupate pe județe.

    Returnează o listă de dicturi cu: data_zi, judet, localitate, detalii,
    ora_inceput, ora_sfarsit."""
    localitati_ct = {normalizeaza_text(x) for x in LOCALITATI_CONSTANTA}
    antet_jud = re.compile(r"^(?:Județul|Judeţul)\s+(.+)$")
    antet_buc = re.compile(r"^București\s*$")
    cap_rand = re.compile(r"^" + ZIUA_SAPTAMANII + r",")
    data_re = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
    orar_re = re.compile(r"(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})")
    inceput_tabel = re.compile(r"^(Ziua|Orar|Localitatea|Strada|Biroul|www\.|Pagina)")

    judet_curent = ""
    intrari = []
    linii = text_pdf.splitlines()
    i = 0
    while i < len(linii):
        linie = linii[i].strip()
        if not linie:
            i += 1
            continue
        m_ant = antet_jud.match(linie)
        if m_ant:
            judet_curent = judet_canonizat(m_ant.group(1).strip())
            i += 1
            continue
        if antet_buc.match(linie):
            judet_curent = "București"
            i += 1
            continue
        if inceput_tabel.match(linie):
            i += 1
            continue
        if not cap_rand.match(linie):
            i += 1
            continue

        # Rând nou (începe cu ziua săptămânii): adunăm liniile următoare
        # până la următorul rând/antet, apoi curățăm fragmentele intercalate.
        bucati = [linie]
        j = i + 1
        while j < len(linii):
            urm = linii[j].strip()
            if not urm:
                j += 1
                continue
            if (cap_rand.match(urm) or antet_jud.match(urm)
                    or antet_buc.match(urm) or inceput_tabel.match(urm)):
                break
            bucati.append(urm)
            j += 1
        corp = " ".join(bucati)
        m_data = data_re.search(corp)
        if not m_data:
            i = j
            continue
        try:
            zi = date(int(m_data.group(3)), int(m_data.group(2)), int(m_data.group(1)))
        except Exception:
            i = j
            continue
        m_orar = orar_re.search(corp)
        ora_inc = m_orar.group(1) if m_orar else ""
        ora_sf = m_orar.group(2) if m_orar else ""
        if not ora_inc or not ora_sf:
            i = j
            continue

        ramas = re.sub(r"^" + ZIUA_SAPTAMANII + r",", "", corp)
        cuvinte = []
        for c in re.split(r"\s+", ramas):
            cc = c.strip(" ,;.|")
            if not cc:
                continue
            if data_re.fullmatch(cc):
                continue
            if re.fullmatch(r"\d{1,2}:\d{2}", cc) or cc in ("-", "–", "—"):
                continue
            cuvinte.append(cc)
        if not cuvinte:
            i = j
            continue

        # Localitatea: compus cunoscut (Constanța) sau primul cuvânt
        k = 1
        if len(cuvinte) >= 2 and normalizeaza_text(cuvinte[0] + " " + cuvinte[1]) in localitati_ct:
            k = 2
        localitate = normalizeaza_text(" ".join(cuvinte[:k]))
        detalii_cuv = cuvinte[k:]
        if detalii_cuv:
            primul = normalizeaza_text(detalii_cuv[0])
            if primul in ATASABILE_LOCALITATII and primul not in ("de sus", "de jos", "de mijloc"):
                localitate += " " + primul
                detalii_cuv = detalii_cuv[1:]
            elif len(detalii_cuv) >= 2 and primul == "de":
                al2 = normalizeaza_text(detalii_cuv[1])
                if al2 in ("sus", "jos", "mijloc"):
                    localitate += " de " + al2
                    detalii_cuv = detalii_cuv[2:]
        detalii = " ".join(detalii_cuv).strip(" ,;|")
        if not localitate or not judet_curent:
            i = j
            continue
        intrari.append({
            "data_zi": zi,
            "judet": judet_curent,
            "localitate": localitate,
            "detalii": detalii[:400],
            "ora_inceput": ora_inc,
            "ora_sfarsit": ora_sf,
        })
        i = j
    return intrari


def bucata_de_zi(ora):
    """Transformă o oră "HH:MM" în minutul zilei, pentru comparații corecte.

    Compararea orelor ca text e greșită: regexul orarului acceptă și ore scrise cu
    o singură cifră ("8:00"), iar "16:00" <= "8:00" e adevărat ca string — un
    interval 8:00-16:00 ar fi fost tratat ca trecând peste miezul nopții.
    """
    hh, mm = ora.split(":")
    return int(hh) * 60 + int(mm)


def sincronizeaza_intreruperi_programate():
    """Sincronizează deconectările PROGRAMATE din PDF-ul săptămânal (toate județele).

    La fiecare rulare:
    1. rândurile a căror zi a trecut se marchează REZOLVATE (rămân afișate până
       la sfârșitul zilei incluse, apoi dispar din lista activă);
    2. se descarcă și parsează cel mai recent PDF publicat și se face
       reconciliere: anunțuri noi → inserare + notificare, anunțuri reapărute
       (REMEDIAT/ANULATA) → reactivare + notificare;
    3. anunțurile active care nu mai apar în PDF-ul curent (ziua în fereastra
       PDF-ului) au fost retrase de operator → marcate ANULATA + abonații
       zonei sunt anunțați că întreruperea nu mai are loc."""
    azi = azi_bucuresti()
    acum = datetime.now(ZoneInfo("Europe/Bucharest"))

    try:
        # Citire paginata: tabela are peste 1000 de randuri de curent, iar un
        # raspuns trunchiat ar face randurile lipsa sa para noi (inserarea lor ar
        # da eroare de cheie duplicata, iar retragerile ar fi ratate).
        randuri_curent = citeste_toate(
            lambda: supabase.table("avarii").select(
                "id,sursa_url,status,data_inceput,data_sfarsit,descriere_text,"
                "localitate,judet,detalii_anunt,strada,cartier,data,tip_intrerupere,serviciu"
            ).eq("serviciu", "curent")
        )
    except Exception as e:
        print(f"⚠️ Eroare la citirea deconectărilor programate: {e}")
        return

    pdf_randuri = {}
    for r in randuri_curent:
        u = r.get("sursa_url") or ""
        if u.startswith("pdfprog:"):
            pdf_randuri[u[len("pdfprog:"):]] = r

    # 1. Deconectările a căror zi a trecut se închid.
    for cod, r in pdf_randuri.items():
        di = (r.get("data_inceput") or "").split()
        try:
            zi = datetime.strptime(di[0], "%d/%m/%Y").date()
        except Exception:
            continue
        if zi < azi and r.get("status") != "REMEDIAT":
            try:
                supabase.table("avarii").update(
                    {"status": "REMEDIAT", "data_sfarsit": acum.strftime("%d/%m/%Y %H:%M")}
                ).eq("id", r["id"]).execute()
                print(f"✅ Deconectare programată încheiată: {cod}")
            except Exception as ex:
                print(f"❌ Eroare la închiderea {cod}: {ex}")

    # 2. Descarcă și parsează cel mai recent PDF publicat.
    print("📄 Verific deconectările programate (PDF săptămânal Rețele Electrice)...")
    text_pdf = descarca_pdf_intreruperi_programate()
    if not text_pdf:
        return
    intrari = parseaza_intreruperi_programate(text_pdf)
    if not intrari:
        print("ℹ️ PDF-ul nu conține deconectări programate (sau nu a putut fi citit).")
        return
    print(f"📄 Am găsit {len(intrari)} deconectări programate în PDF.")

    # Fereastra de zile acoperită de PDF-ul curent — folosită la retrageri:
    # un anunț e considerat retras DOAR dacă ziua lui e în această fereastră.
    # La trecerea la PDF-ul săptămânii următoare, rândurile din weekend rămase
    # în PDF-ul vechi nu sunt retrageri, ci pur și simplu nu mai sunt acoperite.
    prima_zi_pdf = min(e["data_zi"] for e in intrari)
    ultima_zi_pdf = max(e["data_zi"] for e in intrari)

    coduri_in_pdf = set()
    for e in intrari:
        if e["data_zi"] < azi or not e["judet"]:
            continue
        ora_inc, ora_sf = e["ora_inceput"], e["ora_sfarsit"]
        data_inceput = f"{e['data_zi']:%d/%m/%Y} {ora_inc}"
        data_sfarsit_zi = e["data_zi"]
        if bucata_de_zi(ora_sf) <= bucata_de_zi(ora_inc):
            data_sfarsit_zi += timedelta(days=1)
        data_sfarsit = f"{data_sfarsit_zi:%d/%m/%Y} {ora_sf}"
        detalii = re.sub(r"\s+", " ", e["detalii"]).strip(" ,;|")
        descriere = (f"Deconectare programată de energie electrică (lucrări în rețea), "
                     f"anunțată pentru {e['localitate']}, județul {e['judet']}: {detalii}.")
        cheie_raw = f"{e['data_zi']:%d/%m/%Y}|{e['localitate']}|{ora_inc}|{ora_sf}"
        cod = hashlib.md5(cheie_raw.encode("utf-8")).hexdigest()[:12]
        if cod in coduri_in_pdf:
            # PDF-ul listează aceeași localitate cu același interval de mai multe ori
            # (ex: mai multe străzi din același oraș) — toate dau același cod. Am
            # procesat-o deja în această rulare: o a doua inserare ar da eroare de
            # cheie duplicată, iar o actualizare ar suprascrie detaliile cu ultima.
            continue
        coduri_in_pdf.add(cod)
        rand = pdf_randuri.get(cod)
        try:
            if rand and rand.get("status") == "PROGRAMATA":
                # Deja în baza noastră: actualizăm doar dacă s-a schimbat ceva
                schimbat = (rand.get("descriere_text") != descriere
                            or rand.get("data_inceput") != data_inceput
                            or rand.get("data_sfarsit") != data_sfarsit)
                if schimbat:
                    supabase.table("avarii").update({
                        "descriere_text": descriere,
                        "data_inceput": data_inceput,
                        "data_sfarsit": data_sfarsit,
                        "data": e["data_zi"].isoformat(),
                    }).eq("id", rand["id"]).execute()
            elif rand:
                # A reapărut în PDF după ce fusese închisă (REMEDIAT) sau retrasă
                # (ANULATA): reactivăm și anunțăm abonații (la ANULATA marcajele
                # de notificare au fost șterse la retragere, deci mesajul ajunge).
                reactivata = dict(rand)
                reactivata.update({
                    "status": "PROGRAMATA",
                    "descriere_text": descriere,
                    "data_inceput": data_inceput,
                    "data_sfarsit": data_sfarsit,
                    "data": e["data_zi"].isoformat(),
                })
                supabase.table("avarii").update({
                    "status": "PROGRAMATA",
                    "descriere_text": descriere,
                    "data_inceput": data_inceput,
                    "data_sfarsit": data_sfarsit,
                    "data": e["data_zi"].isoformat(),
                }).eq("id", rand["id"]).execute()
                print(f"📅 Reapariție deconectare programată: {e['localitate']} ({cod}).")
                notifica_abonatii(reactivata)
            else:
                inserat = supabase.table("avarii").insert({
                    "serviciu": "curent", "status": "PROGRAMATA",
                    "tip_intrerupere": "programata",
                    "judet": e["judet"],
                    "localitate": e["localitate"], "strada": "", "cartier": "",
                    "data": e["data_zi"].isoformat(),
                    "data_inceput": data_inceput, "data_sfarsit": data_sfarsit,
                    "descriere_text": descriere,
                    "detalii_anunt": detalii,
                    "sursa_url": f"pdfprog:{cod}",
                }).execute()
                print(f"📅 Deconectare programată NOUĂ: {e['localitate']} "
                      f"({e['judet']}, {e['data_zi']:%d.%m.%Y}, {ora_inc}-{ora_sf}).")
                if inserat.data:
                    notifica_abonatii(inserat.data[0])
        except Exception as ex:
            print(f"❌ Eroare la salvarea deconectării {cod}: {ex}")

    # 3. Anunțurile PROGRAMATE care NU mai apar în PDF-ul curent au fost retrase
    #    de operator. Le marcăm ANULATA (rămân vizibile până la trecerea zilei,
    #    apoi se închid ca REMEDIAT) și anunțăm abonații zonei.
    nr_retrase = 0
    for cod, r in pdf_randuri.items():
        if cod in coduri_in_pdf:
            continue
        di = (r.get("data_inceput") or "").split()
        try:
            zi = datetime.strptime(di[0], "%d/%m/%Y").date()
        except Exception:
            continue
        if r.get("status") != "PROGRAMATA":
            continue
        if not (prima_zi_pdf <= zi <= ultima_zi_pdf) or zi < azi:
            continue
        try:
            supabase.table("avarii").update({"status": "ANULATA"}).eq("id", r["id"]).execute()
            # Ștergem marcajele de notificare ca abonații care au primit anunțul
            # inițial să primească și anunțul de retragere (notifica_abonatii
            # ar sări peste ei altfel, din cauza deduplicării).
            sterge_notificari_pentru_avarie(r["id"])
            r["status"] = "ANULATA"
            notifica_abonatii(r)
            nr_retrase += 1
        except Exception as ex:
            print(f"❌ Eroare la retragerea {cod}: {ex}")
    if nr_retrase:
        print(f"✅ {nr_retrase} anunțuri programate retrase de operator "
              f"(marcate ANULATA, abonații au fost anunțați).")
