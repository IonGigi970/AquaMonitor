"""Extragerea avariilor din textul articolelor RAJA, cu ajutorul Gemini.

Toate articolele noi dintr-o rulare sunt trimise într-UN SINGUR apel AI (în loc de
unul per articol). Așa consumăm mult mai puține cereri din cota zilnică gratuită,
iar un articol se marchează procesat doar dacă a primit un răspuns valid."""

import json
import re
from datetime import datetime, timedelta, timezone

from .config import MODEL_AI, client_genai, supabase

# Câte articole intră într-un singur apel (limitează dimensiunea promptului).
LIMITA_ARTICOLE_PER_APEL = 10

# Pauza între reîncercări după un eșec AI, dacă eroarea nu spune altfel.
DEFAULT_PAUZA_ESEC_AI = 3600        # 1 oră
LIMITA_MAX_PAUZA_AI = 6 * 3600      # maxim 6 ore, ca să nu rămână oprit toată ziua

# Ultima eroare AI din această rulare: {"mesaj": ..., "pauza": secunde}.
ULTIMA_EROARE_AI = None

_marcare_avertizata_stare = False

REGULI = """Analizează textele de mai jos despre avariile RAJA. Pentru FIECARE text extrage TOATE zonele afectate.
Reguli de extracție (se aplică fiecărui text în parte):
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

Format de răspuns OBLIGATORIU: un singur obiect JSON, fără markdown și fără alt text, de forma:
{"articole": [{"id": 1, "avarii": [ {"localitate": "...", "strada": "...", "cartier": "...", "status": "...", "descriere_text": "...", "data_inceput": "...", "data_sfarsit": "...", "data": "YYYY-MM-DD"} ]}, {"id": 2, "avarii": []}]}
Include OBLIGATORIU câte un element pentru fiecare id (1 până la numărul de texte), chiar dacă "avarii" este [] (articolul nu are avarii)."""


def _construieste_prompt(articole):
    blocuri = "\n\n".join(
        f'=== TEXT id={i} ===\n{articol["text"]}'
        for i, articol in enumerate(articole, start=1)
    )
    return REGULI + "\n\nTexte de analizat:\n\n" + blocuri


def _apel_ai(articole):
    """Un singur apel AI pentru o listă de articole. Întoarce {url: [avarii]} sau None la eroare."""
    global ULTIMA_EROARE_AI
    try:
        raspuns_ai = client_genai.models.generate_content(
            model=MODEL_AI,
            contents=_construieste_prompt(articole),
        )
        text_json = raspuns_ai.text.replace('```json', '').replace('```', '').strip()
        date = json.loads(text_json)
        ULTIMA_EROARE_AI = None
    except Exception as e:
        pauza = _pauza_recomandata(e) or DEFAULT_PAUZA_ESEC_AI
        ULTIMA_EROARE_AI = {"mesaj": str(e), "pauza": pauza}
        print(f"❌ Eroare la procesare AI: {e}")
        return None

    lista = date.get("articole") if isinstance(date, dict) else None
    if not isinstance(lista, list):
        print("❌ Răspuns AI neașteptat (lipsește lista 'articole').")
        return None

    rezultat = {}
    for item in lista:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        if not 1 <= idx <= len(articole):
            continue
        avarii = item.get("avarii")
        if isinstance(avarii, list):
            rezultat[articole[idx - 1]["url"]] = avarii
    return rezultat


def extrage_avarii_din_texte(articole):
    """articole: listă de dict cu cheile "url" și "text".

    Întoarce {url: [avarii]} doar pentru articolele care au primit un răspuns valid.
    Un articol lipsă din dict înseamnă „nu s-a obținut răspuns" — apelantul nu îl
    marchează procesat și îl reia la rularea următoare. Oprim la prima eroare AI
    (de ex. cotă epuizată), ca să nu mai consumăm cereri degeaba în aceeași rulare."""
    rezultat = {}
    for start in range(0, len(articole), LIMITA_ARTICOLE_PER_APEL):
        lot = articole[start:start + LIMITA_ARTICOLE_PER_APEL]
        partial = _apel_ai(lot)
        if partial is None:
            break
        rezultat.update(partial)
    return rezultat


def _pauza_recomandata(eroare):
    """Extrage timpul de reîncercare din mesajul Gemini (429/503), în secunde.

    Gemini scrie fie „Please retry in 3h29m0.86s", fie retry_delay în JSON
    („retryDelay': '12540s'"). Dacă nu găsește nimic, întoarce None."""
    text = str(eroare)
    m = re.search(r"retryDelay'\s*:\s*'?\s*(\d+)\s*'?", text) or \
        re.search(r"retry in\s+(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s", text)
    if m and m.lastindex == 1:
        secunde = int(m.group(1))
    elif m:
        ore, minute = int(m.group(1) or 0), int(m.group(2) or 0)
        secunde = int(ore * 3600 + minute * 60 + float(m.group(3)))
    else:
        return None
    return min(max(secunde, 300), LIMITA_MAX_PAUZA_AI)


def _citeste_cooldown():
    """Secunde rămase din pauza AI (0 = se poate apela)."""
    global _marcare_avertizata_stare
    try:
        rezultat = supabase.table("stare_scraper").select("valoare").eq(
            "cheie", "cooldown_ai").limit(1).execute()
    except Exception as e:
        if not _marcare_avertizata_stare:
            _marcare_avertizata_stare = True
            print(f"⚠️ Tabela 'stare_scraper' lipsește ({e}). Ai rulat migrarea 017? "
                  "Fără ea, reîncercările AI nu au pauză între rulări.")
        return 0
    if not rezultat.data:
        return 0
    try:
        pana_la = datetime.fromisoformat(rezultat.data[0]["valoare"]["pana_la"])
        rest = pana_la - datetime.now(timezone.utc)
        return max(0, int(rest.total_seconds()))
    except (KeyError, TypeError, ValueError):
        return 0


def _scrie_cooldown(secunde):
    global _marcare_avertizata_stare
    pana_la = (datetime.now(timezone.utc) + timedelta(seconds=secunde)).isoformat()
    try:
        supabase.table("stare_scraper").upsert(
            {"cheie": "cooldown_ai", "valoare": {"pana_la": pana_la}},
            on_conflict="cheie",
        ).execute()
    except Exception as e:
        if not _marcare_avertizata_stare:
            _marcare_avertizata_stare = True
            print(f"⚠️ Tabela 'stare_scraper' lipsește ({e}). Ai rulat migrarea 017?")


def _sterge_cooldown():
    try:
        supabase.table("stare_scraper").delete().eq("cheie", "cooldown_ai").execute()
    except Exception:
        pass


def pauza_ai_activa():
    """Secunde rămase din pauza AI. Dacă e > 0, apelurile AI sunt oprite."""
    return _citeste_cooldown()


def inregistreaza_eroare_ai():
    """Pornește pauza după un eșec AI (folosește timpul recomandat de eroare)."""
    _scrie_cooldown(ULTIMA_EROARE_AI["pauza"] if ULTIMA_EROARE_AI else DEFAULT_PAUZA_ESEC_AI)


def inregistreaza_succes_ai():
    """Anulează orice pauză rămasă după o rulare reușită."""
    _sterge_cooldown()
