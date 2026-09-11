"""Intreruperi accidentale de energie electrica, preluate din API-ul ArcGIS."""

from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from ..config import supabase
from ..db import citeste_toate
from ..notificari.abonati import notifica_abonatii
from ..utils import normalizeaza_text
from .comun import LOCALITATI_CONSTANTA, judet_canonizat

# Curent electric: întreruperi neplanificate (avarii) din API-ul public ArcGIS
# folosit de harta oficială Rețele Electrice (reteleelectrice.ro/intreruperi).
ARCGIS_INTRERUPERI_URL = (
    "https://services-eu1.arcgis.com/ZugzWQbNk6XT3BMo/arcgis/rest/services/"
    "OutagesMapViewLayer/FeatureServer/0/query"
)


def _localitati_recunoscute_curent():
    """Localități statice + cele folosite deja de abonați/avarii (ca vocabular)."""
    nume = set(LOCALITATI_CONSTANTA)
    try:
        rez = supabase.table("abonamente").select("localitate_interes").execute()
        for r in rez.data or []:
            nume.add(normalizeaza_text(r.get("localitate_interes") or ""))
        rez2 = supabase.table("avarii").select("localitate").eq("serviciu", "apa").execute()
        for r in rez2.data or []:
            nume.add(normalizeaza_text(r.get("localitate") or ""))
    except Exception:
        pass
    nume.discard("")
    return nume


def mapeaza_zona_intrerupere(desc_norm, provincia_norm, localitati):
    """Atribuie (localitate, cartier) dintr-o zonă anunțată de Rețele Electrice.

    Funcționează pentru toate județele:
    - "NAVODARI" → (navodari, "")
    - "MEDGIDIA ZONA PORT" → (medgidia, "zona port")
    - "PALAS" (zonă din Constanța fără numele orașului) → (constanta, "palas")
    - "TIMISOARA" / "TIMISOARA CETATE" → (timisoara, ""/"cetate")
    """
    if not desc_norm:
        return provincia_norm, ""
    if desc_norm == provincia_norm:
        return provincia_norm, ""
    cuvinte = desc_norm.split()
    if desc_norm in localitati:
        return desc_norm, ""
    if cuvinte and cuvinte[0] in localitati:
        return cuvinte[0], " ".join(cuvinte[1:]).strip()
    if provincia_norm == "constanta":
        # Cartiere/zone din municipiul Constanța anunțate fără numele orașului
        return "constanta", desc_norm
    # În alte județe descrizion începe de regulă cu numele localității
    return cuvinte[0], " ".join(cuvinte[1:]).strip()


def descriere_intrerupere(attr, desc_raw, tip, judet):
    """Text descriptiv dintr-un rând ArcGIS (fără date personale).

    tip: "accidentala" (avarie în rețea) sau "programata" (deconectare planificată).
    """
    prefix = f", județul {judet}" if judet else ""
    if tip == "programata":
        text = (f"Deconectare programată de energie electrică (lucrări în rețea), "
                f"anunțată în zona: {desc_raw}{prefix}.")
    else:
        text = (f"Întrerupere neplanificată de energie electrică (avarie în rețea), "
                f"anunțată în zona: {desc_raw}{prefix}.")
    clienti = attr.get("num_cli_di")
    if clienti:
        text += f" Clienți afectați: {clienti}."
    estimare = (attr.get("data_prev_") or "").strip()
    if estimare and "definire" not in estimare.lower():
        if tip == "programata":
            text += f" Sfârșit estimat: {estimare}."
        else:
            text += f" Estimare remediere: {estimare}."
    return text


def sincronizeaza_intreruperi_curent():
    """Sincronizează întreruperile ACCIDENTALE de energie electrică din toate județele.

    API-ul listează întreruperile încă active (toate provinciile Rețele Electrice).
    Deconectările programate se iau separat, din PDF-ul săptămânal, ca să nu existe
    dubluri. Cele care dispar din feed se marchează REZOLVATE."""
    print("⚡ Verific întreruperile accidentale de energie electrică (toate județele)...")
    try:
        raspuns = requests.get(ARCGIS_INTRERUPERI_URL, params={
            "where": "causa_disa='Accidental'",
            "outFields": "*", "f": "json", "resultRecordCount": "2000",
        }, headers={"User-Agent": "Mozilla/5.0"}, timeout=25)
        if raspuns.status_code != 200:
            print(f"⚠️ API-ul Rețele Electrice a răspuns {raspuns.status_code}.")
            return
        features = raspuns.json().get("features", [])
    except Exception as e:
        print(f"⚠️ Eroare la interogarea API-ului de energie electrică: {e}")
        return

    localitati = _localitati_recunoscute_curent()
    coduri_active = set()
    intrari = []
    for feat in features:
        attr = feat.get("attributes", {}) or {}
        cod = (attr.get("outage_unique_code") or "").strip()
        if not cod:
            continue
        coduri_active.add(cod)
        provincia = (attr.get("provincia") or "").strip()
        judet = judet_canonizat(provincia)
        desc_raw = (attr.get("descrizion") or "").strip()
        localitate, cartier = mapeaza_zona_intrerupere(
            normalizeaza_text(desc_raw), normalizeaza_text(provincia), localitati)
        data_inceput = (attr.get("data_inter") or "").strip()
        data_sfarsit = (attr.get("data_prev_") or "").strip()
        data_zi = None
        try:
            data_zi = datetime.strptime(data_inceput, "%d/%m/%Y %H:%M").date().isoformat()
        except Exception:
            pass
        intrari.append({
            "cod": cod,
            "judet": judet,
            "localitate": localitate,
            "cartier": cartier,
            "descriere": descriere_intrerupere(attr, desc_raw, "accidentala", judet),
            "data": data_zi,
            "data_inceput": data_inceput,
            "data_sfarsit": data_sfarsit,
            "lat": attr.get("latitudine"),
            "lon": attr.get("longitudin"),
        })

    existente = {}
    try:
        # Citire paginata: tabela are peste 1000 de randuri de curent, iar un
        # raspuns trunchiat ar face randurile lipsa sa para noi (si inserarea lor
        # ar da eroare de cheie duplicata).
        randuri_curent = citeste_toate(
            lambda: supabase.table("avarii")
            .select("id,sursa_url,status,tip_intrerupere").eq("serviciu", "curent")
        )
        for r in randuri_curent:
            if (r.get("sursa_url") or "").startswith("retele:"):
                existente[r["sursa_url"][7:]] = r
    except Exception as e:
        print(f"⚠️ Eroare la citirea întreruperilor existente: {e}")
        return

    for e in intrari:
        rand = existente.get(e["cod"])
        try:
            if rand and rand.get("status") != "REMEDIAT":
                # Deja activă în baza noastră: actualizăm datele curente
                supabase.table("avarii").update({
                    "judet": e["judet"],
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "data_inceput": e["data_inceput"], "data_sfarsit": e["data_sfarsit"],
                    "descriere_text": e["descriere"], "tip_intrerupere": "accidentala",
                }).eq("id", rand["id"]).execute()
            elif rand:
                # A reapărut după rezolvare: o reactivăm
                supabase.table("avarii").update({
                    "status": "AVARIE", "data_sfarsit": e["data_sfarsit"],
                    "judet": e["judet"],
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "data_inceput": e["data_inceput"], "descriere_text": e["descriere"],
                    "tip_intrerupere": "accidentala",
                }).eq("id", rand["id"]).execute()
                print(f"⚡ Reapariție întrerupere {e['cod']} ({e['localitate']} {e['cartier']}).")
            else:
                inserat = supabase.table("avarii").insert({
                    "serviciu": "curent", "status": "AVARIE",
                    "judet": e["judet"],
                    "localitate": e["localitate"], "strada": "", "cartier": e["cartier"],
                    "data": e["data"], "data_inceput": e["data_inceput"],
                    "data_sfarsit": e["data_sfarsit"],
                    "descriere_text": e["descriere"], "tip_intrerupere": "accidentala",
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "sursa_url": f"retele:{e['cod']}",
                }).execute()
                print(f"⚡ Întrerupere NOUĂ de energie electrică (accidentală): "
                      f"{e['localitate']} {e['cartier']} ({e['judet']}, {e['cod']}).")
                if inserat.data:
                    # Înregistrăm rândul nou: dacă feed-ul repetă același cod mai
                    # jos în aceeași rulare, a doua trecere trebuie să actualizeze,
                    # nu să insereze din nou (ar da eroare de cheie duplicată).
                    existente[e["cod"]] = inserat.data[0]
                    notifica_abonatii(inserat.data[0])
        except Exception as ex:
            print(f"❌ Eroare la salvarea întreruperii {e['cod']}: {ex}")

    # Marchează rezolvate întreruperile care nu mai apar în feed
    acum = datetime.now(ZoneInfo("Europe/Bucharest")).strftime("%d/%m/%Y %H:%M")
    nr_rezolvate = 0
    for cod, rand in existente.items():
        if cod not in coduri_active and rand.get("status") != "REMEDIAT":
            try:
                supabase.table("avarii").update(
                    {"status": "REMEDIAT", "data_sfarsit": acum}
                ).eq("id", rand["id"]).execute()
                nr_rezolvate += 1
            except Exception as ex:
                print(f"❌ Eroare la marcarea rezolvare {cod}: {ex}")
    if nr_rezolvate:
        print(f"✅ {nr_rezolvate} întreruperi de energie electrică rezolvate.")
