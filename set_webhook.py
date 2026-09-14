"""Inregistreaza webhook-ul Telegram CU secret_token (protectie anti-falsificare).

De ce: webhook-ul /api/telegram este public, iar oricine ii poate trimite un POST
falsificat (de exemplu mesaje care par a veni de la un alt utilizator). Cand
webhook-ul e inregistrat cu un secret, Telegram il trimite in antetul
`X-Telegram-Bot-Api-Secret-Token`, iar ruta il verifica.

Cum se foloseste (o singura data, sau dupa fiecare schimbare de secret):
  1. python set_webhook.py            # inregistreaza webhook-ul cu secret
  2. Copiaza aceeasi valoare a TELEGRAM_WEBHOOK_SECRET in Vercel (Environment
     Variables), apoi redeploy. Fara pasul 2, ruta nu verifica nimic (merge, dar
     fara protectie) — vezi app/api/telegram/route.ts.

Scriptul NU afiseaza niciodata secretul; valoarea sta in .env (necomis).
"""

import os
import secrets
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

RADACINA = Path(__file__).resolve().parent
CALE_ENV = RADACINA / ".env"

load_dotenv(CALE_ENV)

token = os.getenv("TELEGRAM_BOT_TOKEN")
if not token:
    print("❌ TELEGRAM_BOT_TOKEN lipsește din .env.")
    sys.exit(1)

secret = os.getenv("TELEGRAM_WEBHOOK_SECRET")
if not secret:
    if len(sys.argv) >= 3 and sys.argv[1] == "--secret":
        secret = sys.argv[2]
    else:
        # 32 de octeti aleatori, in caracterele permise de Telegram (A-Z a-z 0-9 _ -)
        secret = secrets.token_urlsafe(32)
    with open(CALE_ENV, "a", encoding="utf-8") as f:
        f.write(f"\nTELEGRAM_WEBHOOK_SECRET={secret}\n")
    print("🔑 Am generat un TELEGRAM_WEBHOOK_SECRET nou și l-am salvat în .env.")
    print("   Copiază valoarea (același text) în Vercel -> Settings -> Environment Variables,")
    print("   apoi redeploy. Nu o afișez aici, ca să nu ajungă în loguri.")

r = requests.get(f"https://api.telegram.org/bot{token}/getWebhookInfo", timeout=20)
info = r.json()
if not info.get("ok"):
    print(f"❌ getWebhookInfo a răspuns cu eroare: {info.get('description')}")
    sys.exit(1)

url = info["result"].get("url") or ""
if len(sys.argv) >= 2 and sys.argv[1].startswith("http"):
    url = sys.argv[1]
if not url:
    print("❌ Nu există webhook înregistrat și nu ai dat un URL în argument.")
    sys.exit(1)

raspuns = requests.post(
    f"https://api.telegram.org/bot{token}/setWebhook",
    json={
        "url": url,
        "secret_token": secret,
        "allowed_updates": ["message", "edited_message"],
    },
    timeout=20,
)
date = raspuns.json()
if date.get("ok"):
    print(f"✅ Webhook înregistrat cu secret: {url}")
    print("   Următorul pas: setează TELEGRAM_WEBHOOK_SECRET (valoarea din .env) în Vercel și redeploy.")
else:
    print(f"❌ setWebhook a eșuat: {date.get('description')}")
    sys.exit(1)
