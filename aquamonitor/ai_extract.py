"""Extragerea avariilor din textul articolelor RAJA, cu ajutorul Gemini."""

import json

from .config import MODEL_AI, client_genai

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
        raspuns_ai = client_genai.models.generate_content(
            model=MODEL_AI,
            contents=prompt,
        )
        text_json = raspuns_ai.text.replace('```json', '').replace('```', '').strip()
        avarii_extrase = json.loads(text_json)
        if isinstance(avarii_extrase, list):
            return avarii_extrase
    except Exception as e:
        print(f"❌ Eroare la procesare AI: {e}")

    return []
