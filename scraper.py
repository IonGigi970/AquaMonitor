import os
import json
import time
import unicodedata
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client, Client
import google.generativeai as genai
from bs4 import BeautifulSoup

load_dotenv()

# Asigură-te că în .env, SUPABASE_KEY este cheia 'service_role', nu 'anon'!
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel('gemini-3.6-flash')

# Câte zile în urmă se face scanarea (implicit 2 zile)
ZILE_SCANARE = int(os.getenv("ZILE_SCANARE", "2"))

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "AquaMonitor CT <onboarding@resend.dev>")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "aquamonitorct@gmail.com")


def trimite_log_admin(subiect, html):
    """Trimite un email de log către admin (conturi noi, notificări trimise)."""
    if not RESEND_API_KEY or not ADMIN_EMAIL:
        return
    try:
        requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [ADMIN_EMAIL],
                "subject": subiect,
                "html": html
            },
            timeout=15
        )
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea log-ului admin: {e}")


def normalizeaza_text(text):
    """Aceeași logică de normalizare ca în frontend (fără diacritice, litere mici, fără prefixe)."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    for prefix in ["strada ", "str. ", "bulevardul ", "bd. ", "b-dul ", "alee ", "aleea ", "intrarea ", "cartier ", "cartierul "]:
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.strip()


def este_punct_termic(cartier_curat):
    """Reperele de tip 'PT 3' / 'punct termic X' nu au o locație reală în OpenStreetMap.
    Cautarea lor esueaza mereu, iar fallback-ul pe centrul localitatii ar plasa un pin
    exact in mijlocul orasului, ceea ce e inselator (pare o locatie precisa, dar nu e).
    Le tratam separat: nu incercam sa le geocodam deloc."""
    if not cartier_curat:
        return False
    text = cartier_curat.strip()
    if text == "pt" or text.startswith("pt ") or text.startswith("pt."):
        return True
    return "punct termic" in text


def obtine_coordonate(localitate, strada, cartier=None):
    """Transformă o adresă în coordonate GPS cu reguli de curățare a textului."""
    try:
        strada_curata = strada.lower() if strada else ""
        cartier_curat = cartier.lower() if cartier else ""

        if "toată" in strada_curata or "nespecificata" in strada_curata or not strada_curata:
            # Dacă nu avem stradă, încercăm cartierul, altfel doar localitatea
            if cartier_curat and este_punct_termic(cartier_curat):
                # Nu geocodam punctele termice: nu au adresa reala, iar un pin
                # "aproximativ" in centrul orasului ar induce in eroare utilizatorii.
                # Avaria tot apare in lista textuala, doar nu primeste pin pe harta.
                return None, None
            if cartier_curat:
                query = f"{cartier_curat}, {localitate}, Romania"
            else:
                query = f"{localitate}, Romania"
        else:
            if "," in strada_curata:
                strada_curata = strada_curata.split(",")[0]
            strada_curata = strada_curata.replace("strada ", "").strip()
            # Adaugam "strada" ca indiciu pentru Nominatim, altfel nume scurte si comune
            # (ex: "Verde") sunt confundate cu localitati/zone omonime (ex: satul "Movila
            # Verde") in loc de strada respectiva din Constanta.
            query = f"strada {strada_curata}, {localitate}, Romania"

        time.sleep(1)  # Pauză obligatorie pentru Nominatim
        url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
        headers = {'User-Agent': 'AquaMonitorCT-Scraper/2.0'}

        raspuns = requests.get(url, headers=headers, timeout=15)

        if raspuns.status_code == 200:
            date = raspuns.json()
            if len(date) > 0:
                return float(date[0]['lat']), float(date[0]['lon'])
            else:
                if query != f"{localitate}, Romania":
                    fallback_url = f"https://nominatim.openstreetmap.org/search?q={localitate}, Romania&format=json&limit=1"
                    rasp_fallback = requests.get(fallback_url, headers=headers, timeout=15)
                    if rasp_fallback.status_code == 200 and len(rasp_fallback.json()) > 0:
                        return float(rasp_fallback.json()[0]['lat']), float(rasp_fallback.json()[0]['lon'])

    except Exception as e:
        print(f"⚠️ Eroare la geocoding pentru {localitate}: {e}")

    return None, None


def extrage_avarii_din_text(text_postare):
    """Trimite textul UNUI SINGUR articol către Gemini și returnează lista de avarii extrase."""
    prompt = f"""
    Analizează acest text despre avariile RAJA. Extrage TOATE zonele afectate și returnează-le într-un format JSON de tip ARRAY (listă de obiecte), fără markdown sau alte texte.
    Reguli de extracție:
    1. "localitate": Numele localității (ex: "Constanța", "Hârșova"). Fiecare obiect își păstrează localitatea lui.
    2. UN ANUNȚ poate afecta MAI MULTE zone de tipuri diferite (ex: străzi ȘI cartiere/zone deodată). Identifică TOATE zonele afectate menționate explicit și creează câte UN OBIECT SEPARAT pentru fiecare. Nu elimina nicio zonă numită în text.
    3. Pentru fiecare obiect, stabilește tipul zonei:
       - STRADĂ (stradă, bulevard, alee, șosea, drum cu nume oficial) → completezi "strada" cu numele oficial, fără prefix (strada, bulevardul etc.), fără numere de bloc, fără text în paranteze, fără tronsoane (detalii gen "tronsonul între X și Y" trec în "descriere_text"). Dacă aceeași enumerare conține mai multe străzi, separă-le prin virgulă în același obiect. Dacă e toată localitatea, scrie "Toată localitatea". În acest caz "cartier" = null. Exemplu corect: "I.C. Brătianu". Exemplu greșit: "bulevardul I.C. Brătianu (tronsonul dintre Sabroso și 1 Decembrie 1918)".
       - CARTIER/ZONĂ/REPER (cartier, zonă, piață, parc, gară, autogară, hotel, punct termic, km rutier etc. — ex: "Abator", "Far", "KM 4", "Gara CFR", "Autogara Constanța", "Hotel Maria", "Casa de Cultură", "Tomis 3") → completezi "cartier" și "strada" = null.
    4. Nu inventa zone care nu apar explicit în text. Ignoră sintagmele vagi care nu denumesc o zonă concretă (ex: "punctele termice aferente", "consumatorii din zona adiacentă", "zonele limitrofe").
    5. "status": Alege între "AVARIE", "PRESIUNE SCĂZUTĂ" sau "REMEDIAT".
    6. "descriere_text": Textul scurt, relevant pentru acea avarie (motivul opririi).
    7. "data_inceput": Ora estimată de începere (ex: "11:30") sau null.
    8. "data_sfarsit": Ora estimată de finalizare (ex: "17:00") sau null.
    9. "data": Data pentru care este valabilă avaria, în format "YYYY-MM-DD" (ex: "2026-08-27"). Dacă textul menționează o dată explicită (ex: "mâine", "pe 28 august", "în data de 30 august"), folosește acea dată. Dacă nu se menționează nicio dată, pune null.

    Exemplu: dacă textul spune "sunt afectați consumatorii de pe bulevardul I.C. Brătianu, cei din zonele Gara CFR și Casa de Cultură și cartierele Abator, Far și KM 4", rezultatul conține 6 obiecte: unul cu strada "I.C. Brătianu", apoi câte unul cu cartier "Gara CFR", "Casa de Cultură", "Abator", "Far", "KM 4".

    Format obligatoriu (ARRAY cu un obiect per zonă afectată):
    [
      {{
        "localitate": "...",
        "strada": "...",
        "cartier": "...",
        "status": "...",
        "descriere_text": "...",
        "data_inceput": "...",
        "data_sfarsit": "...",
        "data": "YYYY-MM-DD"
      }}
    ]

    Text de analizat: {text_postare}
    """

    try:
        raspuns_ai = model.generate_content(prompt)
        text_json = raspuns_ai.text.replace('```json', '').replace('```', '').strip()
        avarii_extrase = json.loads(text_json)
        if isinstance(avarii_extrase, list):
            return avarii_extrase
    except Exception as e:
        print(f"❌ Eroare la procesare AI: {e}")

    return []


def trimite_email(destinatar, avarie):
    if not RESEND_API_KEY:
        return
    try:
        data = avarie.get("data") or ""
        interval = f"{avarie.get('data_inceput', '?')} - {avarie.get('data_sfarsit', '?')}"
        html = (
            f"<p><b>📅 Data: {data}</b></p>"
            f"<p><b>📍 Locație: {avarie['localitate']}, {avarie['strada']}</b></p>"
            f"<p><b>Status: {avarie['status']}</b></p>"
            f"<p>Interval: {interval}</p>"
            f"<p>{avarie.get('descriere_text', '')}</p>"
            f"<p style='color:#888;font-size:12px'>AquaMonitor CT — te-ai abonat pentru alerte pe zona ta.</p>"
        )
        requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [destinatar],
                "subject": f"🚨 Alertă apă: {avarie['localitate']} - {avarie['status']}",
                "html": html
            },
            timeout=15
        )
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea emailului către {destinatar}: {e}")


def gaseste_chat_id_telegram(username):
    """Rezolvă username-ul Telegram (ex: @Victoras45) în chat_id numeric.

    Botul Telegram NU poate trimite către un username — are nevoie de chat_id numeric.
    Chat_id-ul se obține doar după ce utilizatorul a pornit o conversație cu botul
    (a apăsat /start). Căutăm întâi în tabela telegram_users, apoi interogăm getUpdates.
    """
    if not TELEGRAM_BOT_TOKEN:
        return None
    username = (username or "").lstrip("@").lower()
    if not username:
        return None

    # 1. Verificăm tabela de mapări salvate
    try:
        rez = supabase.table("telegram_users").select("chat_id").eq("username", username).limit(1).execute()
        if rez.data:
            return rez.data[0]["chat_id"]
    except Exception:
        pass

    # 2. Interogăm getUpdates pentru a găsi chat_id-ul (dacă userul a dat /start recent)
    try:
        r = requests.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates", timeout=15)
        updates = r.json().get("result", [])
        for u in updates:
            msg = u.get("message") or u.get("edited_message") or {}
            frm = msg.get("from") or {}
            uname = (frm.get("username") or "").lower()
            chat_id = (msg.get("chat") or {}).get("id")
            if uname and chat_id:
                # Salvăm maparea pentru utilizări viitoare
                try:
                    supabase.table("telegram_users").upsert(
                        {"username": uname, "chat_id": chat_id},
                        on_conflict="username"
                    ).execute()
                except Exception:
                    pass
                if uname == username:
                    return chat_id
    except Exception as e:
        print(f"⚠️ Eroare la getUpdates Telegram: {e}")

    return None


def trimite_telegram(contact, avarie):
    if not TELEGRAM_BOT_TOKEN:
        return
    chat_id = gaseste_chat_id_telegram(contact)
    if not chat_id:
        print(f"⚠️ Nu am găsit chat_id pentru Telegram {contact}. "
              f"Utilizatorul trebuie să pornească botul cu /start.")
        return
    try:
        data = avarie.get("data") or "?"
        mesaj = (
            f"🚨 *Alertă apă*\n"
            f"*📅 Data: {data}*\n"
            f"*📍 Locație: {avarie['localitate']}, {avarie['strada']}*\n"
            f"*Status: {avarie['status']}*\n"
            f"Interval: {avarie.get('data_inceput', '?')} - {avarie.get('data_sfarsit', '?')}\n"
            f"{avarie.get('descriere_text', '')}"
        )
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": mesaj, "parse_mode": "Markdown"},
            timeout=15
        )
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea mesajului Telegram către {chat_id}: {e}")


# Abonamente care au primit deja notificare pentru un comunicat sursă (în această rulare).
# Un anunț RAJA generează mai multe avarii (una per stradă + una per cartier/zonă);
# fără acest set, abonatul ar primi un email per zonă din același comunicat.
notificari_pe_sursa = set()


def notifica_abonatii(avarie_salvata):
    """Găsește abonații interesați de această zonă și le trimite alertă (o singură dată/abonament).

    Un anunț RAJA generează mai multe avarii (una per stradă + una per cartier/zonă).
    Fără deduplicare, un abonat pe toată localitatea ar primi câte un email per zonă.
    De aceea trimitem MAXIM o notificare per abonament pentru același comunicat (sursa_url).
    """
    localitate_norm = normalizeaza_text(avarie_salvata["localitate"])
    strada_norm = normalizeaza_text(avarie_salvata.get("strada", ""))
    cartier_norm = normalizeaza_text(avarie_salvata.get("cartier", ""))
    sursa_url = avarie_salvata.get("sursa_url")

    rezultat = supabase.table("abonamente").select("*").eq("activ", True).eq("localitate_interes", localitate_norm).execute()
    abonamente = rezultat.data or []

    for abonament in abonamente:
        strada_abonament = normalizeaza_text(abonament.get("strada_interes") or "")
        cartier_abonament = normalizeaza_text(abonament.get("cartier_interes") or "")

        # Potrivire stradă SAU cartier: dacă abonatul a specificat oricare dintre ele,
        # avaria se potrivește dacă numele apare în câmpul corespunzător SAU în celălalt
        # (acoperă rânduri vechi unde numele cartierului a rămas în câmpul "strada",
        # ex: "tomis 3, cuza voda", și abonamente vechi pe cartier salvate ca stradă)
        if cartier_abonament or strada_abonament:
            potrivire = False
            if cartier_abonament:
                potrivire = (
                    cartier_abonament in cartier_norm or cartier_norm in cartier_abonament
                    or cartier_abonament in strada_norm or strada_norm in cartier_abonament
                )
            if strada_abonament and not potrivire:
                potrivire = (
                    strada_abonament in strada_norm or strada_norm in strada_abonament
                    or strada_abonament in cartier_norm or cartier_norm in strada_abonament
                )
            if not potrivire:
                continue

        # O singură notificare per abonament pentru același comunicat sursă
        if sursa_url and (abonament["id"], sursa_url) in notificari_pe_sursa:
            continue

        # Verificăm dacă am trimis deja notificare pentru acest abonament + această avarie
        deja_trimis = supabase.table("notificari_trimise") \
            .select("id") \
            .eq("abonament_id", abonament["id"]) \
            .eq("avarie_id", avarie_salvata["id"]) \
            .execute()
        if deja_trimis.data:
            continue

        tip = abonament.get("tip_contact")
        contact = abonament.get("valoare_contact")

        if tip == "email":
            trimite_email(contact, avarie_salvata)
        elif tip == "telegram":
            trimite_telegram(contact, avarie_salvata)
        # whatsapp / sms: neimplementate încă (necesită cont Twilio sau similar)

        supabase.table("notificari_trimise").insert({
            "abonament_id": abonament["id"],
            "avarie_id": avarie_salvata["id"]
        }).execute()

        if sursa_url:
            notificari_pe_sursa.add((abonament["id"], sursa_url))

        # Log admin: cine a fost notificat, pentru ce zonă și pe ce canal
        canal = "Email" if tip == "email" else "Telegram" if tip == "telegram" else str(tip)
        zona_avarie = avarie_salvata['strada'] or avarie_salvata.get('cartier') or "Toată localitatea"
        trimite_log_admin(
            f"📨 Notificare trimisă: {avarie_salvata['localitate']} - {zona_avarie}",
            f"<p><b>Notificare trimisă</b></p>"
            f"<p><b>📍 Zonă:</b> {avarie_salvata['localitate']}, {zona_avarie}</p>"
            f"<p><b>Status:</b> {avarie_salvata['status']}</p>"
            f"<p><b>📅 Data:</b> {avarie_salvata.get('data') or 'azi'}</p>"
            f"<p><b>👤 Către:</b> {contact}</p>"
            f"<p><b>📡 Canal:</b> {canal}</p>"
            f"<p><b>🗺️ Zona abonată:</b> {abonament.get('localitate_interes')}"
            f"{' - ' + abonament.get('strada_interes') if abonament.get('strada_interes') else ''}</p>"
        )


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
    """Șterge avariile a căror dată a trecut de mai mult de o zi (data < ieri).

    RAJA anunță avarii care încep într-o zi și continuă în următoarea. Păstrăm
    avariile de ieri, azi și din viitor, ca să nu dispară înainte de finalizare.
    """
    azi = datetime.now(timezone.utc).date()
    ieri = (azi - timedelta(days=1)).isoformat()
    azi_str = azi.isoformat()
    try:
        # 1. Avarii cu dată explicită mai veche de ieri
        rezultat = supabase.table("avarii").delete().lt("data", ieri).execute()
        nr = len(rezultat.data or [])
        if nr:
            print(f"🗑️  Am șters {nr} avarii vechi (data < {ieri}).")

        # 2. Avarii fără dată, adăugate înainte de ieri (rânduri vechi rămase)
        rezultat2 = supabase.table("avarii").delete().is_("data", "null").lt("data_adaugarii", ieri).execute()
        nr2 = len(rezultat2.data or [])
        if nr2:
            print(f"🗑️  Am șters {nr2} avarii vechi fără dată (adăugate înainte de ieri).")

        # 3. Avarii marcate REMEDIAT, adăugate înainte de azi (nu mai sunt active)
        rezultat3 = supabase.table("avarii").delete().eq("status", "REMEDIAT").lt("data_adaugarii", azi_str).execute()
        nr3 = len(rezultat3.data or [])
        if nr3:
            print(f"🗑️  Am șters {nr3} avarii remediate (nu mai sunt active).")
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

    limita_veche = datetime.now(timezone.utc) - timedelta(days=ZILE_SCANARE)
    articole_valabile = []

    for articol in articole:
        link_tag = articol.select_one('.entry-title a')
        time_tag = articol.select_one('time.entry-date')
        if not link_tag or not time_tag or not time_tag.get('datetime'):
            continue

        post_url = link_tag.get('href')
        data_postare = datetime.fromisoformat(time_tag['datetime'])

        if data_postare < limita_veche:
            continue  # articol prea vechi, îl ignorăm

        paragrafe = articol.find_all('p')
        text_brut = " \n".join(p.get_text(strip=True) for p in paragrafe if len(p.get_text(strip=True)) > 40)

        if text_brut:
            articole_valabile.append({"url": post_url, "text": text_brut[:3000], "data": data_postare})

    print(f"🔎 {len(articole_valabile)} articole din ultimele {ZILE_SCANARE} zile găsite pe pagină.")
    return articole_valabile


def articol_deja_procesat(post_url):
    rezultat = supabase.table("avarii").select("id").eq("sursa_url", post_url).limit(1).execute()
    return bool(rezultat.data)


def ruleaza_scanare():
    curata_avarii_vechi()
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


if __name__ == "__main__":
    ruleaza_scanare()
