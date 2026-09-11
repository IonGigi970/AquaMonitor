"""Mesaje Telegram, trimise prin botul @JimmyWaterBot."""

import requests

from ..config import ETICHETE_SERVICIU, STATUSURI_AFISATE, TELEGRAM_BOT_TOKEN, supabase

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
    data = avarie.get("data") or "?"
    serviciu = avarie.get("serviciu") or "apa"
    eticheta = ETICHETE_SERVICIU.get(serviciu, serviciu)
    tip = avarie.get("tip_intrerupere")
    eticheta_tip = "📅 Deconectare programată" if tip == "programata" else "⚡ Întrerupere accidentală"
    status_afisat = STATUSURI_AFISATE.get(avarie.get("status"), avarie.get("status", "?"))
    anulata = avarie.get("status") == "ANULATA"
    zona = avarie['strada'] or avarie.get('cartier') or "Toată localitatea"
    judet = avarie.get("judet") or ""
    locatie = avarie['localitate']
    if judet and serviciu == "curent":
        locatie = f"{avarie['localitate']} (jud. {judet})"
    data_inceput = avarie.get('data_inceput') or ""
    data_sfarsit = avarie.get('data_sfarsit') or ""
    interval = (f"{data_inceput} - {data_sfarsit}").strip(" -")
    mesaj = (
        f"🚨 *Alertă {eticheta}*\n"
        f"*📅 Data: {data}*\n"
        f"*📍 Locație: {locatie}, {zona}*\n"
        f"*Status: {status_afisat}*\n"
        + (f"*Tip: {eticheta_tip}*\n" if tip else "")
        + f"Interval: {interval}\n"
        f"{avarie.get('descriere_text', '')}"
        + ("\n🔕 *Anunțul a fost retras de operator — întreruperea NU mai are loc.*" if anulata else "")
    )
    return trimite_telegram_text(contact, mesaj)
