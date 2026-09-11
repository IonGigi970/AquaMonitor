"""Avarii de apa: preluarea articolelor RAJA, extragerea si salvarea avariilor."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from .ai_extract import extrage_avarii_din_text
from .config import supabase
from .geocodare import obtine_coordonate
from .notificari.abonati import notifica_abonatii
from .utils import azi_bucuresti

def desparte_strazile(avarie):
    """Dacă strada conține mai multe străzi (separate prin virgulă), le despărțim în avarii separate."""
    strada = (avarie.get("strada") or "").strip()
    if not strada or "toată" in strada.lower():
        return [avarie]

    parti = [p.strip() for p in strada.split(",") if p.strip()]
    if len(parti) <= 1:
        return [avarie]

    rezultat = []
    for p in parti:
        copie = dict(avarie)
        copie["strada"] = p
        rezultat.append(copie)
    return rezultat


def salveaza_avarii(avarii_extrase, sursa_url, data_articol=None):
    for avarie in avarii_extrase:
        if not avarie.get("localitate"):
            continue
        # Trebuie să existe cel puțin o stradă SAU un cartier/zonă
        if not (avarie.get("strada") or avarie.get("cartier")):
            continue

        # Normalizăm: valorile lipsă devin "" (NU null) ca upsert-ul să deduplice corect
        # (în PostgreSQL, null-urile nu intră niciodată în conflict la unice)
        if not avarie.get("strada"):
            avarie["strada"] = ""
        if not avarie.get("cartier"):
            avarie["cartier"] = ""

        for avarie_simpla in desparte_strazile(avarie):
            zona = avarie_simpla.get("strada") or avarie_simpla.get("cartier") or "Toată localitatea"

            # Protecție: avariile cu dată explicită în trecut nu se salvează și nu se
            # notifică (ex: articol de ieri procesat târziu). Site-ul afișează doar
            # avariile zilei curente; datele din trecut doar ar umple baza de date.
            data_avarie = (avarie_simpla.get("data") or "").strip()
            if data_avarie and data_avarie < azi_bucuresti().isoformat():
                print(f"⏭️  Avarie cu dată trecută ({data_avarie}), se omite: "
                      f"{avarie_simpla['localitate']} - {zona}")
                continue

            print(f"\n📍 Caut coordonate pentru: {avarie_simpla['localitate']}, {zona}...")
            lat, lon = obtine_coordonate(
                avarie_simpla['localitate'],
                avarie_simpla.get("strada", ""),
                avarie_simpla.get("cartier", "")
            )
            avarie_simpla['latitudine'] = lat
            avarie_simpla['longitudine'] = lon
            avarie_simpla['sursa_url'] = sursa_url

            # Dacă AI-ul nu a extras o dată, folosim data publicării articolului
            if not avarie_simpla.get("data") and data_articol:
                avarie_simpla['data'] = data_articol.strftime("%Y-%m-%d")

            try:
                rezultat = supabase.table("avarii").upsert(
                    avarie_simpla,
                    on_conflict="sursa_url,localitate,strada,cartier,status"
                ).execute()

                if rezultat.data:
                    print(f"✅ Salvat: {avarie_simpla['localitate']} - {zona} ({avarie_simpla['status']})")
                    notifica_abonatii(rezultat.data[0])
            except Exception as e:
                print(f"❌ Eroare la salvarea în Supabase: {e}")


def curata_avarii_vechi():
    """Șterge din baza de date avariile mai vechi de 2 zile.

    Reguli per serviciu:
    - apă: rândurile cu data mai veche de 2 zile se șterg (site-ul arată doar azi).
    - curent: se șterg DOAR cele REZOLVATE (REMEDIAT) mai vechi de 2 zile;
      întreruperile încă active se păstrează oricât de vechi (pot dura zile).
    """
    azi = azi_bucuresti()
    prag = (azi - timedelta(days=2)).isoformat()
    try:
        # 1. Avarii apă cu dată explicită mai veche de 2 zile
        rezultat = supabase.table("avarii").delete().eq("serviciu", "apa").lt("data", prag).execute()
        nr = len(rezultat.data or [])
        if nr:
            print(f"🗑️  Am șters {nr} avarii de apă mai vechi de 2 zile (data < {prag}).")

        # 2. Întreruperi de curent rezolvate, mai vechi de 2 zile (cele active rămân)
        rezultat_c = supabase.table("avarii").delete().eq("serviciu", "curent").eq("status", "REMEDIAT").lt("data", prag).execute()
        nr_c = len(rezultat_c.data or [])
        if nr_c:
            print(f"🗑️  Am șters {nr_c} întreruperi de curent rezolvate și vechi.")

        # 3. Avarii apă fără dată, adăugate în urmă cu mai mult de 2 zile
        rezultat2 = supabase.table("avarii").delete().eq("serviciu", "apa").is_("data", "null").lt("data_adaugarii", prag).execute()
        nr2 = len(rezultat2.data or [])
        if nr2:
            print(f"🗑️  Am șters {nr2} avarii vechi fără dată (adăugate înainte de {prag}).")
    except Exception as e:
        print(f"⚠️ Eroare la curățarea avariilor vechi: {e}")


def preia_articole_avarii():
    """Parsează pagina de listare RAJA articol cu articol, cu data reală a fiecăruia."""
    print("🌐 Mă conectez la site-ul RAJA pentru a prelua avariile...")
    url = "https://rajac.ro/avarii/"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

    raspuns = requests.get(url, headers=headers, timeout=30)
    if raspuns.status_code != 200:
        print(f"❌ Eroare HTTP: {raspuns.status_code}")
        return []

    soup = BeautifulSoup(raspuns.text, 'html.parser')
    articole = soup.find_all('article')

    # Preluăm DOAR articolele publicate azi (fusul orar al României).
    # Altfel, după o pauză a scraper-ului, am notifica abonații cu avarii vechi
    # (de ieri sau mai vechi), care nu mai sunt relevante pentru "azi".
    start_azi = datetime.combine(azi_bucuresti(), datetime.min.time(), tzinfo=ZoneInfo("Europe/Bucharest"))
    articole_valabile = []

    for articol in articole:
        link_tag = articol.select_one('.entry-title a')
        time_tag = articol.select_one('time.entry-date')
        if not link_tag or not time_tag or not time_tag.get('datetime'):
            continue

        post_url = link_tag.get('href')
        data_postare = datetime.fromisoformat(time_tag['datetime'])
        if data_postare.tzinfo is None:
            # Dacă site-ul nu specifică fusul orar, presupunem ora României
            data_postare = data_postare.replace(tzinfo=ZoneInfo("Europe/Bucharest"))

        if data_postare < start_azi:
            continue  # articol de ieri sau mai vechi, îl ignorăm

        paragrafe = articol.find_all('p')
        text_brut = " \n".join(p.get_text(strip=True) for p in paragrafe if len(p.get_text(strip=True)) > 40)

        if text_brut:
            articole_valabile.append({"url": post_url, "text": text_brut[:3000], "data": data_postare})

    print(f"🔎 {len(articole_valabile)} articole publicate azi găsite pe pagină.")
    return articole_valabile


def articol_deja_procesat(post_url):
    rezultat = supabase.table("avarii").select("id").eq("sursa_url", post_url).limit(1).execute()
    return bool(rezultat.data)

def sincronizeaza_apa():
    """Preia articolele RAJA publicate azi, extrage avariile cu AI si le salveaza.

    Articolele deja procesate (dupa URL) sunt sărite, ca sa nu duplicam avariile
    si sa nu trimitem notificari repetate.
    """
    articole = preia_articole_avarii()

    for articol in articole:
        if articol_deja_procesat(articol["url"]):
            print(f"⏭️  Deja procesat: {articol['url']}")
            continue

        print(f"🧠 Procesez articol nou: {articol['url']}")
        avarii_extrase = extrage_avarii_din_text(articol["text"])

        if avarii_extrase:
            salveaza_avarii(avarii_extrase, articol["url"], articol.get("data"))
        else:
            print("ℹ️ Nu s-au extras avarii din acest articol.")
