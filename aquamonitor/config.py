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

MODEL_AI = 'gemini-3.6-flash'

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
    "curent": "energie electrică",
}

# Statusuri afișate frumos în notificări (email + Telegram)
STATUSURI_AFISATE = {
    "PROGRAMATA": "Programată",
    "ANULATA": "Anulată",
    "AVARIE": "În curs",
    "PRESIUNE SCĂZUTĂ": "Presiune scăzută",
    "REMEDIAT": "Rezolvată",
}
