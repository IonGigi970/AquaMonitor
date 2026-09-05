import os
import json
import time
import smtplib
import unicodedata
from datetime import datetime, timedelta
from email.message import EmailMessage
from zoneinfo import ZoneInfo

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

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "AquaMonitor CT <onboarding@resend.dev>")
# Alternativa gratuita fara domeniu: trimitere prin Gmail SMTP.
# GMAIL_USER = contul (ex: aquamonitorct@gmail.com), GMAIL_APP_PASSWORD = parola de aplicatie
# (Google -> Cont -> Securitate -> Verificare in 2 pasi -> Parole pentru aplicatii).
GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "aquamonitorct@gmail.com")

# Etichete afișate în notificări, per serviciu
ETICHETE_SERVICIU = {
    "apa": "apă",
    "curent": "curent electric",
}



def trimite_email_gmail(destinatar, subiect, html):
    """Trimite un email prin Gmail SMTP (varianta gratuita, fara domeniu propriu).
    Returnează True doar dacă serverul Gmail a acceptat mesajul."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        return False
    try:
        mesaj = EmailMessage()
        mesaj["Subject"] = subiect
        mesaj["From"] = GMAIL_USER
        mesaj["To"] = destinatar
        mesaj.set_content("Vizualizeaza acest email intr-un client care suporta HTML.")
        mesaj.add_alternative(html, subtype="html")

        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(mesaj)
        server.quit()
        return True
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea prin Gmail către {destinatar}: {e} — se va reîncerca.")
        return False


def trimite_log_admin(subiect, html):
    """Trimite un email de log către admin (conturi noi, notificări trimise)."""
    if not ADMIN_EMAIL:
        return
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        trimite_email_gmail(ADMIN_EMAIL, subiect, html)
        return
    if not RESEND_API_KEY:
        return
    try:
        raspuns = requests.post(
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
        if raspuns.status_code < 200 or raspuns.status_code >= 300:
            print(f"⚠️ Resend a refuzat log-ul admin: {raspuns.status_code} {raspuns.text[:200]}")
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


def azi_bucuresti():
    """Data curentă în fusul orar al României (Europe/Bucharest), ca obiect date.

    Site-ul și notificările raportează la ziua calendaristică din România,
    nu la UTC (GitHub Actions rulează în UTC, unde ora locală e decalată).
    """
    return datetime.now(ZoneInfo("Europe/Bucharest")).date()


# Coordonate corecte pentru strazi pe care geocodarea (Nominatim/OpenStreetMap)
# le plaseaza gresit in mod constant (ex: o statie de autobuz in locul strazii,
# o strada omonima din alt oras, sau o portiune de footway din parc).
# Cheia = numele strazii normalizat (litere mici, fara diacritice, fara prefix "strada").
# Valoarea = (latitudine, longitudine) verificate manual pe harta.
COORDONATE_CUNOSCUTE = {
    "i.c. bratianu": (44.1705329, 28.6006419),   # bulevardul din Constanta (nu strada omonima din Mangalia)
    "soveja": (44.2014674, 28.6281196),          # segmentul din Tomis 3
    "rotterdam": (44.1996941, 28.6565113),       # portiunea rezidentiala, nu footway-ul din parc
    "pescarilor": (44.2013851, 28.6522633),      # strada reala, nu statia de autobuz
}


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


# Tipuri de obiecte din reverse-geocoding care NU sunt o stradă reală (drum carosabil).
# O stație de autobuz sau o porțiune de footway din parc se numesc adesea la fel ca
# strada, dar nu sunt strada — le respingem explicit.
TIPURI_NON_DRUM = {"bus_stop", "footway", "path", "steps", "pedestrian", "cycleway", "track", "service", "bridleway"}


def verifica_strada(lat, lon, strada_curata):
    """Reverse-geocoding: confirmă că punctul (lat, lon) e chiar pe strada căutată.
    Geocodarea poate returna o stație de autobuz, o stradă omonimă din alt oraș sau
    o porțiune de footway din parc. Verificăm numele străzii la punctul găsit și
    respingem tipurile care nu sunt drum (bus_stop, footway etc.). Dacă nu se
    potrivește, respingem rezultatul (mai bine fără pin decât pin greșit)."""
    try:
        time.sleep(1)  # Pauză obligatorie pentru Nominatim
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=18"
        headers = {'User-Agent': 'AquaMonitorCT-Scraper/2.0'}
        raspuns = requests.get(url, headers=headers, timeout=15)
        if raspuns.status_code == 200:
            date = raspuns.json()
            tip = date.get("type", "")
            if tip in TIPURI_NON_DRUM:
                return False  # stație de autobuz / footway / etc., nu strada
            nume = date.get("display_name", "")
            nume_norm = normalizeaza_text(nume)
            strada_norm = normalizeaza_text(strada_curata)
            # Verificăm dacă numele străzii apare în adresa punctului găsit.
            # Folosim cuvinte întregi ca să nu confundăm "Verde" cu "Movila Verde".
            cuvinte = [c for c in strada_norm.split() if len(c) > 2]
            if cuvinte and all(c in nume_norm for c in cuvinte):
                return True
            return False
    except Exception as e:
        print(f"⚠️ Eroare la verificarea străzii {strada_curata}: {e}")
    return False


def alege_cel_mai_bun_rezultat(date, prefera_clasa):
    """Alege rezultatul cel mai potrivit din lista Nominatim.
    Nominatim ordoneaza dupa relevanta, dar uneori pune pe primul loc un rezultat
    inselator: o statie de autobuz in locul strazii, sau centrul poligonului
    administrativ in locul localitatii. Preferam clasa corecta:
    - 'highway' pentru strazi (exclude statii de autobuz, care sunt tot 'highway'
      dar au type 'bus_stop' -> le evitam explicit)
    - 'place' pentru localitati/cartiere (exclude 'boundary' = centrul poligonului)"""
    if not date:
        return None
    for r in date:
        if r.get("class") == prefera_clasa:
            if prefera_clasa == "highway" and r.get("type") == "bus_stop":
                continue  # statie de autobuz, nu strada
            return r
    return date[0]


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
                prefera_clasa = "place"
            else:
                query = f"{localitate}, Romania"
                prefera_clasa = "place"
        else:
            if "," in strada_curata:
                strada_curata = strada_curata.split(",")[0]
            strada_curata = strada_curata.replace("strada ", "").strip()
            # Daca strada e in lista celor cu coordonate cunoscute (verificate manual),
            # o folosim direct, fara sa mai apelam geocodarea nesigura.
            cheie = normalizeaza_text(strada_curata)
            if cheie in COORDONATE_CUNOSCUTE:
                return COORDONATE_CUNOSCUTE[cheie]
            # Adaugam "strada" ca indiciu pentru Nominatim, altfel nume scurte si comune
            # (ex: "Verde") sunt confundate cu localitati/zone omonime (ex: satul "Movila
            # Verde") in loc de strada respectiva din Constanta.
            query = f"strada {strada_curata}, {localitate}, Romania"
            prefera_clasa = "highway"

        time.sleep(1)  # Pauză obligatorie pentru Nominatim
        url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5"
        headers = {'User-Agent': 'AquaMonitorCT-Scraper/2.0'}

        raspuns = requests.get(url, headers=headers, timeout=15)

        if raspuns.status_code == 200:
            date = raspuns.json()
            ales = alege_cel_mai_bun_rezultat(date, prefera_clasa)
            if ales:
                lat, lon = float(ales['lat']), float(ales['lon'])
                # Pentru străzi, confirmăm că punctul e chiar pe strada căutată.
                # Dacă nu, încercăm următorii candidați; dacă niciunul nu se
                # potrivește, nu punem pin (mai bine fără pin decât pin greșit).
                if prefera_clasa == "highway":
                    for candidat in date:
                        if candidat.get("class") != "highway" or candidat.get("type") == "bus_stop":
                            continue
                        clat, clon = float(candidat['lat']), float(candidat['lon'])
                        if verifica_strada(clat, clon, strada_curata):
                            return clat, clon
                    return None, None
                return lat, lon
            else:
                if query != f"{localitate}, Romania":
                    fallback_url = f"https://nominatim.openstreetmap.org/search?q={localitate}, Romania&format=json&limit=5"
                    rasp_fallback = requests.get(fallback_url, headers=headers, timeout=15)
                    if rasp_fallback.status_code == 200:
                        ales_fallback = alege_cel_mai_bun_rezultat(rasp_fallback.json(), "place")
                        if ales_fallback:
                            return float(ales_fallback['lat']), float(ales_fallback['lon'])

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
    """Trimite emailul. Returnează True DOAR dacă furnizorul a acceptat mesajul
    (Gmail SMTP dacă e configurat — varianta gratuită — altfel Resend).
    La eșec, notificarea NU se marchează ca trimisă, deci scraper-ul o va
    reîncerca la următoarea rulare."""
    data = avarie.get("data") or ""
    serviciu = avarie.get("serviciu") or "apa"
    eticheta = ETICHETE_SERVICIU.get(serviciu, serviciu)
    data_inceput = avarie.get('data_inceput') or ""
    data_sfarsit = avarie.get('data_sfarsit') or ""
    interval = (f"{data_inceput} - {data_sfarsit}").strip(" -") or ""
    html = (
        f"<p><b>📅 Data: {data}</b></p>"
        f"<p><b>📍 Locație: {avarie['localitate']}, {avarie['strada']}</b></p>"
        f"<p><b>Status: {avarie['status']}</b></p>"
        f"<p><b>⚡ Serviciu: {eticheta}</b></p>"
        + (f"<p>Interval: {interval}</p>" if interval else "")
        + f"<p>{avarie.get('descriere_text', '')}</p>"
        f"<p style='color:#888;font-size:12px'>AquaMonitor CT — te-ai abonat pentru alerte pe zona ta.</p>"
    )
    subiect = f"🚨 Alertă {eticheta}: {avarie['localitate']} - {avarie['status']}"

    if GMAIL_USER and GMAIL_APP_PASSWORD:
        return trimite_email_gmail(destinatar, subiect, html)

    if not RESEND_API_KEY:
        print("⚠️ Niciun canal de email configurat (GMAIL_USER sau RESEND_API_KEY).")
        return False
    try:
        raspuns = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [destinatar],
                "subject": subiect,
                "html": html
            },
            timeout=15
        )
        if raspuns.status_code >= 200 and raspuns.status_code < 300:
            return True
        print(f"⚠️ Resend a refuzat emailul către {destinatar}: {raspuns.status_code} "
              f"{raspuns.text[:200]} — se va reîncerca la următoarea rulare.")
        return False
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea emailului către {destinatar}: {e} — se va reîncerca.")
        return False


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
        rez = supabase.table("telegram_users").select("chat_id").eq("username", 
username).eq("activ", True).limit(1).execute()
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
                        {"username": uname, "chat_id": chat_id, "activ": True},
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
    """Trimite mesajul Telegram. Returnează True DOAR dacă Telegram a confirmat
    livrarea (ok=true). La eșec, notificarea nu se marchează ca trimisă, deci se
    reîncearcă la următoarea rulare."""
    if not TELEGRAM_BOT_TOKEN:
        print("⚠️ TELEGRAM_BOT_TOKEN lipseste, mesajul nu a fost trimis.")
        return False
    chat_id = gaseste_chat_id_telegram(contact)
    if not chat_id:
        print(f"⚠️ Nu am găsit chat_id pentru Telegram {contact}. "
              f"Utilizatorul trebuie să pornească botul cu /start.")
        return False
    try:
        data = avarie.get("data") or "?"
        serviciu = avarie.get("serviciu") or "apa"
        eticheta = ETICHETE_SERVICIU.get(serviciu, serviciu)
        zona = avarie['strada'] or avarie.get('cartier') or "Toată localitatea"
        data_inceput = avarie.get('data_inceput') or ""
        data_sfarsit = avarie.get('data_sfarsit') or ""
        interval = (f"{data_inceput} - {data_sfarsit}").strip(" -")
        mesaj = (
            f"🚨 *Alertă {eticheta}*\n"
            f"*📅 Data: {data}*\n"
            f"*📍 Locație: {avarie['localitate']}, {zona}*\n"
            f"*Status: {avarie['status']}*\n"
            f"Interval: {interval}\n"
            f"{avarie.get('descriere_text', '')}"
        )
        raspuns = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": mesaj, "parse_mode": "Markdown"},
            timeout=15
        )
        if raspuns.status_code == 200:
            date = raspuns.json()
            if date.get("ok"):
                return True
            print(f"⚠️ Telegram a refuzat mesajul către {contact}: {date.get('description', '')} "
                  f"— se va reîncerca.")
            return False
        print(f"⚠️ Telegram a răspuns cu {raspuns.status_code} pentru {contact} "
              f"— se va reîncerca.")
        return False
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea mesajului Telegram către {chat_id}: {e} — se va reîncerca.")
        return False


# Abonamente care au primit deja notificare pentru un comunicat sursă (în această rulare).
# Un anunț RAJA generează mai multe avarii (una per stradă + una per cartier/zonă);
# fără acest set, abonatul ar primi un email per zonă din același comunicat.
notificari_pe_sursa = set()


def contine_substring(a, b):
    """True dacă a e subșir al lui b, dar niciunul gol ("" in "x" e True în Python,
    ceea ce ar potrivi orice avarie cu orice abonat când un câmp e gol)."""
    return bool(a) and bool(b) and a in b


def se_potriveste_abonamentul(strada_abonament, cartier_abonament, strada_norm, cartier_norm):
    """Returnează True dacă un abonament (stradă/cartier de interes) se potrivește
    cu o avarie (stradă/cartier normalizate).

    Reguli:
    - Dacă abonatul nu are nici stradă, nici cartier → se potrivește cu orice avarie
      din localitatea lui (abonament pe toată localitatea).
    - Potrivire bidirecțională pe subșir: acoperă nume scrise parțial de RAJA
      (ex: abonat pe "Revoluției din 22 Decembrie 1989", anunț cu "Revoluției").
    - Câmpurile se verifică încrucișat (cartierul abonatului în strada avariei și
      invers), ca să acopere abonamente vechi salvate în câmpul greșit."""
    if cartier_abonament or strada_abonament:
        potrivire = False
        if cartier_abonament:
            potrivire = (
                contine_substring(cartier_abonament, cartier_norm)
                or contine_substring(cartier_norm, cartier_abonament)
                or contine_substring(cartier_abonament, strada_norm)
                or contine_substring(strada_norm, cartier_abonament)
            )
        if strada_abonament and not potrivire:
            potrivire = (
                contine_substring(strada_abonament, strada_norm)
                or contine_substring(strada_norm, strada_abonament)
                or contine_substring(strada_abonament, cartier_norm)
                or contine_substring(cartier_norm, strada_abonament)
            )
        return potrivire
    return True


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

    serviciu = avarie_salvata.get("serviciu") or "apa"
    rezultat = supabase.table("abonamente").select("*") \
        .eq("activ", True) \
        .eq("serviciu", serviciu) \
        .eq("localitate_interes", localitate_norm).execute()
    abonamente = rezultat.data or []

    for abonament in abonamente:
        strada_abonament = normalizeaza_text(abonament.get("strada_interes") or "")
        cartier_abonament = normalizeaza_text(abonament.get("cartier_interes") or "")

        if not se_potriveste_abonamentul(strada_abonament, cartier_abonament, strada_norm, cartier_norm):
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

        trimis_cu_succes = False
        if tip == "email":
            trimis_cu_succes = trimite_email(contact, avarie_salvata)
        elif tip == "telegram":
            trimis_cu_succes = trimite_telegram(contact, avarie_salvata)
        # whatsapp / sms: neimplementate încă (necesită cont Twilio sau similar)

        # Marcăm notificarea ca trimisă DOAR dacă livrarea a fost confirmată.
        # Dacă a eșuat (ex: Resend refuză expeditorul, bot blocat), rămâne
        # nemarcată și scraper-ul o reîncearcă la următoarea rulare (5 minute).
        if not trimis_cu_succes:
            continue

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


def reincearca_notificari_esuate():
    """Reîncearcă notificările care nu au ajuns la toți abonații.

    Când o trimitere eșuează (email refuzat, bot indisponibil), notificarea nu se
    marchează ca trimisă. La rulările următoare articolul e deja procesat și nu mai
    trece prin notifica_abonatii — fără această fază, notificarea eșuată s-ar pierde
    definitiv. Reluăm notificarea pentru avariile de apă de azi + întreruperile de
    curent încă active; deduplicarea din notificari_trimise (abonament+avarie) și
    din notificari_pe_sursa garantează că nimeni nu primește de două ori aceeași
    alertă."""
    azi_str = azi_bucuresti().isoformat()
    selecteaza = "id,serviciu,localitate,strada,cartier,status,descriere_text,data_inceput,data_sfarsit,data,sursa_url"
    avarii_de_reluat = []
    try:
        # Avarii apă publicate azi
        rezultat = supabase.table("avarii").select(selecteaza).eq("serviciu", "apa").eq("data", azi_str).execute()
        avarii_de_reluat.extend(rezultat.data or [])
        # Întreruperi de curent încă active (indiferent de ziua începerii)
        rezultat_c = supabase.table("avarii").select(selecteaza).eq("serviciu", "curent").neq("status", "REMEDIAT").execute()
        avarii_de_reluat.extend(rezultat_c.data or [])
    except Exception as e:
        print(f"⚠️ Eroare la preluarea avariilor pentru reîncercare: {e}")
        return

    if not avarii_de_reluat:
        return
    print(f"🔁 Verific notificări pentru {len(avarii_de_reluat)} avarii active (reîncercare cele eșuate)...")
    for avarie in avarii_de_reluat:
        notifica_abonatii(avarie)


# ---------------------------------------------------------------------------
# Curent electric: întreruperi neplanificate (avarii) din API-ul public ArcGIS
# folosit de harta oficială Rețele Electrice (reteleelectrice.ro/intreruperi).
# ---------------------------------------------------------------------------
ARCGIS_INTRERUPERI_URL = (
    "https://services-eu1.arcgis.com/ZugzWQbNk6XT3BMo/arcgis/rest/services/"
    "OutagesMapViewLayer/FeatureServer/0/query"
)

# Localități din județul Constanța (normalizate). API-ul anunță uneori doar zona
# (ex: "NAVODARI"), alteori o zonă dintr-un oraș mare fără numele orașului
# (ex: "PALAS" = zonă din Constanța) — lista ne ajută să recunoaștem numele.
LOCALITATI_CONSTANTA = {
    "constanta", "navodari", "medgidia", "mangalia", "harsova", "ovidiu",
    "eforie nord", "eforie sud", "techirghiol", "murfatlar", "cernavoda",
    "valu lui traian", "lumina", "corbu", "mihail kogalniceanu", "agigea",
    "basarabi", "cumpana", "topraisar", "comana", "23 august", "costinesti",
    "limanu", "negru voda", "cogealac", "dobromir", "garliciu", "ghindaresti",
    "gradina", "independenta", "ion corvin", "istria", "lipnita", "mereni",
    "mihai viteazu", "mircea voda", "nicolae balcescu", "olari", "ostrov",
    "pantelimon", "pecineaga", "pestera", "poarta alba", "rasova", "sacele",
    "saraiu", "seimeni", "silistea", "targusor", "tuzla", "vulturu",
    "2 mai", "doua mai", "baneasa", "saligny",
}


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


def mapeaza_zona_intrerupere(desc_norm, localitati):
    """Atribuie (localitate, cartier) dintr-o zonă anunțată de Rețele Electrice.

    - "NAVODARI" → (navodari, "")
    - "MEDGIDIA ZONA PORT" → (medgidia, "zona port")
    - "PALAS" (zonă dintr-un oraș mare, fără numele lui) → (constanta, "palas")
    """
    if not desc_norm:
        return "constanta", ""
    if desc_norm in localitati:
        return desc_norm, ""
    cuvinte = desc_norm.split()
    if cuvinte and cuvinte[0] in localitati:
        return cuvinte[0], " ".join(cuvinte[1:]).strip()
    return "constanta", desc_norm


def descriere_intrerupere(attr, desc_raw):
    """Text descriptiv dintr-un rând ArcGIS (fără date personale)."""
    text = (f"Întrerupere neplanificată de curent (avarie în rețea), "
            f"anunțată în zona: {desc_raw}.")
    clienti = attr.get("num_cli_di")
    if clienti:
        text += f" Clienți afectați: {clienti}."
    estimare = (attr.get("data_prev_") or "").strip()
    if estimare and "definire" not in estimare.lower():
        text += f" Estimare remediere: {estimare}."
    return text


def sincronizeaza_intreruperi_curent():
    """Sincronizează întreruperile neplanificate de curent din județul Constanța.

    API-ul listează doar întreruperile încă active. Cele noi se inserează și
    declanșează notificări; cele care dispar din feed se marchează REZOLVATE
    (rămân vizibile în istoricul scurt, apoi sunt șterse după 2 zile)."""
    print("⚡ Verific întreruperile neplanificate de curent (Rețele Electrice)...")
    try:
        raspuns = requests.get(ARCGIS_INTRERUPERI_URL, params={
            "where": "provincia='CONSTANTA' AND causa_disa='Accidental'",
            "outFields": "*", "f": "json", "resultRecordCount": "2000",
        }, headers={"User-Agent": "Mozilla/5.0"}, timeout=25)
        if raspuns.status_code != 200:
            print(f"⚠️ API-ul Rețele Electrice a răspuns {raspuns.status_code}.")
            return
        features = raspuns.json().get("features", [])
    except Exception as e:
        print(f"⚠️ Eroare la interogarea API-ului de curent: {e}")
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
        desc_raw = (attr.get("descrizion") or "").strip()
        localitate, cartier = mapeaza_zona_intrerupere(normalizeaza_text(desc_raw), localitati)
        data_inceput = (attr.get("data_inter") or "").strip()
        data_zi = None
        try:
            data_zi = datetime.strptime(data_inceput, "%d/%m/%Y %H:%M").date().isoformat()
        except Exception:
            pass
        intrari.append({
            "cod": cod,
            "localitate": localitate,
            "cartier": cartier,
            "descriere": descriere_intrerupere(attr, desc_raw),
            "data": data_zi,
            "data_inceput": data_inceput,
            "lat": attr.get("latitudine"),
            "lon": attr.get("longitudin"),
        })

    existente = {}
    try:
        rez = supabase.table("avarii").select("id,sursa_url,status").eq("serviciu", "curent").execute()
        for r in rez.data or []:
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
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "data_inceput": e["data_inceput"], "descriere_text": e["descriere"],
                }).eq("id", rand["id"]).execute()
            elif rand:
                # A reapărut după rezolvare: o reactivăm
                supabase.table("avarii").update({
                    "status": "AVARIE", "data_sfarsit": "",
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "data_inceput": e["data_inceput"], "descriere_text": e["descriere"],
                }).eq("id", rand["id"]).execute()
                print(f"⚡ Reapariție întrerupere {e['cod']} ({e['localitate']} {e['cartier']}).")
            else:
                inserat = supabase.table("avarii").insert({
                    "serviciu": "curent", "status": "AVARIE",
                    "localitate": e["localitate"], "strada": "", "cartier": e["cartier"],
                    "data": e["data"], "data_inceput": e["data_inceput"], "data_sfarsit": "",
                    "descriere_text": e["descriere"],
                    "latitudine": e["lat"], "longitudine": e["lon"],
                    "sursa_url": f"retele:{e['cod']}",
                }).execute()
                print(f"⚡ Întrerupere NOUĂ de curent: {e['localitate']} {e['cartier']} ({e['cod']}).")
                if inserat.data:
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
        print(f"✅ {nr_rezolvate} întreruperi de curent rezolvate.")


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

    # Întreruperile neplanificate de curent (API Rețele Electrice)
    sincronizeaza_intreruperi_curent()

    # Faza de reîncercare: notificările eșuate la rulările anterioare
    # (sau chiar în această rulare) sunt reluate acum.
    reincearca_notificari_esuate()


if __name__ == "__main__":
    ruleaza_scanare()
