"""Configurare centrala: variabile de mediu, clienti si constante.

O singura sursa de adevar pentru credențiale si pentru etichetele folosite in
notificari. Toate celelalte module importa de aici.
"""

import os

from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai

load_dotenv()

# Asigură-te că în .env, SUPABASE_KEY este cheia 'service_role', nu 'anon'!
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

client_genai = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_AI = "gemini-3.6-flash"

# --- Canale de notificare ---
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "AquaMonitor CT <onboarding@resend.dev>")

# Alternativa gratuita fara domeniu: trimitere prin Gmail SMTP.
# GMAIL_USER = contul (ex: aquamonitorct@gmail.com), GMAIL_APP_PASSWORD = parola de aplicatie
# (Google -> Cont -> Securitate -> Verificare in 2 pasi -> Parole pentru aplicatii).
GMAIL_USER = os.getenv("GMAIL_USER")

GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "aquamonitorct@gmail.com")

# --- Servicii ---
SERVICIU_APA = "apa"
SERVICIU_CURENT = "curent"

# --- Statusuri de avarie (valorile scrise in baza de date) ---
STATUS_AVARIE = "AVARIE"
STATUS_PROGRAMATA = "PROGRAMATA"
STATUS_ANULATA = "ANULATA"
STATUS_REMEDIAT = "REMEDIAT"
STATUS_PRESIUNE_SCAZUTA = "PRESIUNE SCĂZUTĂ"

# --- Tipuri de intrerupere (doar la energie electrica) ---
TIP_ACCIDENTALA = "accidentala"
TIP_PROGRAMATA = "programata"

# --- Canale de contact, asa cum sunt salvate in abonamente.tip_contact ---
CANAL_EMAIL = "email"
CANAL_TELEGRAM = "telegram"

# --- Prefixe din avarii.sursa_url: de unde provine randul ---
PREFIX_SURSA_RETELE = "retele:"      # intreruperi accidentale, API-ul ArcGIS
PREFIX_SURSA_PDF = "pdfprog:"        # deconectari programate, PDF-ul saptamanal

# Etichete afișate în notificări, per serviciu
ETICHETE_SERVICIU = {
    SERVICIU_APA: "apă",
    SERVICIU_CURENT: "energie electrică",
}

# Statusuri afișate frumos în notificări (email + Telegram)
STATUSURI_AFISATE = {
    STATUS_PROGRAMATA: "Programată",
    STATUS_ANULATA: "Anulată",
    STATUS_AVARIE: "În curs",
    STATUS_PRESIUNE_SCAZUTA: "Presiune scăzută",
    STATUS_REMEDIAT: "Rezolvată",
}

# Etichetele tipului de întrerupere, folosite în email și Telegram
ETICHETE_TIP_INTRERUPERE = {
    TIP_PROGRAMATA: "📅 Deconectare programată",
    TIP_ACCIDENTALA: "⚡ Întrerupere accidentală",
}
