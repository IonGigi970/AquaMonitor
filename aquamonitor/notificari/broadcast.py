"""Anunț programat (broadcast) către toți abonații.

Scraperul rulează la fiecare ~15 minute. Faza de broadcast verifică în
stare_scraper (migrarea 017) dacă există un anunț a cărui oră de trimitere a
ajuns; dacă da, trimite emailurile la toate adresele unice + mesajul Telegram,
apoi îl marchează ca trimis ca să nu se repete la următoarele rulări."""

from datetime import datetime, timezone

from ..config import supabase
from .email import trimite_email_html
from .telegram import trimite_telegram_text

CHEIE = "broadcast"


def programeaza_broadcast(send_la_iso, subiect, html_email, mesaj_telegram,
                          emailuri, telegram):
    """Salvează un anunț de trimis. Se apelează o singură dată (la programare).

    send_la_iso — momentul trimiterii, ISO cu fus orar (ex: 2026-10-16T09:00:00+03:00).
    """
    valoare = {
        "send_la": send_la_iso,
        "subiect": subiect,
        "html_email": html_email,
        "mesaj_telegram": mesaj_telegram,
        "emailuri": emailuri,
        "telegram": telegram,
        "trimis": False,
    }
    try:
        supabase.table("stare_scraper").upsert(
            {"cheie": CHEIE, "valoare": valoare},
            on_conflict="cheie",
        ).execute()
        print(f"📬 Anunț programat pentru {send_la_iso} "
              f"({len(emailuri)} emailuri, telegram: {telegram or '-'}).")
    except Exception as e:
        print(f"❌ Nu am putut programa anunțul: {e}")


def ruleaza_broadcast():
    """Fază de scraper: dacă a venit timpul, trimite anunțul o singură dată."""
    try:
        rezultat = supabase.table("stare_scraper").select("valoare").eq(
            "cheie", CHEIE).limit(1).execute()
    except Exception:
        # Migrarea 017 neaplicată — sărim silențios (restul scraperului merge).
        return

    if not rezultat.data:
        return

    valoare = rezultat.data[0].get("valoare") or {}
    if valoare.get("trimis"):
        return

    send_la = valoare.get("send_la")
    if not send_la:
        return

    try:
        moment = datetime.fromisoformat(send_la.replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
    except ValueError:
        print("⚠️ Broadcast: 'send_la' invalid, anunțul nu se trimite.")
        return

    if datetime.now(timezone.utc) < moment:
        return  # încă nu e timpul — rulează la următoarea rulare

    emailuri = valoare.get("emailuri") or []
    subiect = valoare.get("subiect") or ""
    html = valoare.get("html_email") or ""
    ok_email = 0
    for dest in emailuri:
        try:
            if trimite_email_html(dest, subiect, html):
                ok_email += 1
            else:
                print(f"  ⚠️ Email către {dest} a fost refuzat.")
        except Exception as e:
            print(f"  ⚠️ Eroare la email către {dest}: {e}")

    telegram = valoare.get("telegram")
    ok_telegram = False
    if telegram:
        try:
            ok_telegram = trimite_telegram_text(telegram, valoare.get("mesaj_telegram") or "")
        except Exception as e:
            print(f"  ⚠️ Eroare la Telegram: {e}")

    print(f"📨 Anunț trimis: {ok_email}/{len(emailuri)} emailuri"
          + (f", Telegram {'OK' if ok_telegram else 'REFUZAT'}" if telegram else ""))

    # Marcat ca trimis (chiar și la eșec parțial) ca anunțul să nu fie reîncercat
    # la nesfârșit — e un anunț de noutăți, nu o alertă de urgență.
    valoare["trimis"] = True
    valoare["trimis_la"] = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("stare_scraper").upsert(
            {"cheie": CHEIE, "valoare": valoare},
            on_conflict="cheie",
        ).execute()
    except Exception:
        pass
