"""Mesaje Telegram, trimise prin botul @JimmyWaterBot."""

import requests

from ..config import TELEGRAM_BOT_TOKEN, supabase
from .context import escape_markdown, pregateste_context

# Username -> chat_id, rezolvat o singura data per proces (= o rulare de scraper).
# Fara cache, fiecare mesaj trimis reia getUpdates (un apel HTTP) si rescrie
# aceeasi mapare in baza de date. Cache-ul traieste cat procesul.
_cache_chat_id = {}


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
    if username in _cache_chat_id:
        return _cache_chat_id[username]

    # 1. Verificăm tabela de mapări salvate
    try:
        rez = (
            supabase.table("telegram_users")
            .select("chat_id")
            .eq("username", username)
            .eq("activ", True)
            .limit(1)
            .execute()
        )
        if rez.data:
            _cache_chat_id[username] = rez.data[0]["chat_id"]
            return _cache_chat_id[username]
    except Exception:
        pass

    # 2. Interogăm getUpdates pentru a găsi chat_id-ul (dacă userul a dat /start recent).
    # Un singur apel acoperă toți utilizatorii din răspuns, deci îi memorăm pe toți.
    try:
        r = requests.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates", timeout=15)
        updates = r.json().get("result", [])
        for u in updates:
            msg = u.get("message") or u.get("edited_message") or {}
            frm = msg.get("from") or {}
            uname = (frm.get("username") or "").lower()
            chat_id = (msg.get("chat") or {}).get("id")
            if uname and chat_id:
                # Salvăm maparea pentru utilizări viitoare (o dată per rulare)
                if uname not in _cache_chat_id:
                    try:
                        supabase.table("telegram_users").upsert(
                            {"username": uname, "chat_id": chat_id, "activ": True},
                            on_conflict="username"
                        ).execute()
                    except Exception:
                        pass
                _cache_chat_id[uname] = chat_id
    except Exception as e:
        print(f"⚠️ Eroare la getUpdates Telegram: {e}")

    return _cache_chat_id.get(username)


def trimite_telegram_text(contact, mesaj):
    """Trimite un text oarecare către un contact Telegram (@username). Returnează
    True DOAR dacă Telegram a confirmat livrarea (ok=true). La eșec, apelantul
    decide dacă reîncearcă mai târziu."""
    if not TELEGRAM_BOT_TOKEN:
        print("⚠️ TELEGRAM_BOT_TOKEN lipseste, mesajul nu a fost trimis.")
        return False
    chat_id = gaseste_chat_id_telegram(contact)
    if not chat_id:
        print(f"⚠️ Nu am găsit chat_id pentru Telegram {contact}. "
              f"Utilizatorul trebuie să pornească botul cu /start.")
        return False
    try:
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


def trimite_telegram(contact, avarie):
    """Trimite mesajul Telegram. Returnează True DOAR dacă Telegram a confirmat
    livrarea (ok=true). La eșec, notificarea nu se marchează ca trimisă, deci se
    reîncearcă la următoarea rulare."""
    date = pregateste_context(avarie)
    mesaj = (
        f"🚨 *Alertă {date['eticheta_serviciu']}*\n"
        f"*📅 Data: {escape_markdown(date['data'] or '?')}*\n"
        f"*📍 Locație: {escape_markdown(date['locatie'])}, {escape_markdown(date['zona'])}*\n"
        f"*Status: {escape_markdown(date['status_afisat'])}*\n"
        + (f"*Tip: {date['eticheta_tip']}*\n" if date["tip"] else "")
        + (f"Interval: {escape_markdown(date['interval'])}\n" if date["interval"] else "")
        + f"{escape_markdown(date['descriere'])}"
        + (
            "\n🔕 *Anunțul a fost retras de operator — întreruperea NU mai are loc.*"
            if date["anulata"] else ""
        )
    )
    return trimite_telegram_text(contact, mesaj)
