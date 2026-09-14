"""Emailuri: trimitere prin Gmail SMTP (gratuit) sau Resend, plus logurile admin."""

import html
import os
import smtplib
from email.message import EmailMessage

import requests

from ..config import (
    ADMIN_EMAIL,
    GMAIL_APP_PASSWORD,
    GMAIL_USER,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
)
from ..utils import acum_bucuresti
from .context import pregateste_context


def trimite_resend(destinatar, subiect, html):
    """Trimite un email HTML prin Resend. Returnează (succes, motiv_esec)."""
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY lipsește"
    try:
        raspuns = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [destinatar],
                "subject": subiect,
                "html": html,
            },
            timeout=15,
        )
    except Exception as e:
        return False, f"eroare de rețea: {e}"
    if 200 <= raspuns.status_code < 300:
        return True, ""
    return False, f"{raspuns.status_code} {raspuns.text[:200]}"


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
        print(f"⚠️ Gmail a refuzat emailul către {destinatar}: {e}")
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
    trimis, motiv = trimite_resend(ADMIN_EMAIL, subiect, html)
    if not trimis:
        print(f"⚠️ Resend a refuzat log-ul admin: {motiv}")


def _link_rulare_github():
    """Link către rularea curentă de pe GitHub Actions, dacă rulăm acolo.

    Variabilele sunt puse de GitHub Actions; local nu există, deci linkul lipsește.
    """
    server = os.getenv("GITHUB_SERVER_URL")
    depozit = os.getenv("GITHUB_REPOSITORY")
    rulare = os.getenv("GITHUB_RUN_ID")
    if server and depozit and rulare:
        return f"{server}/{depozit}/actions/runs/{rulare}"
    return ""


def trimite_alerta_eroare(erori):
    """Anunță adminul că rularea scraperului a avut erori.

    `erori` e o listă de (nume_fază, traceback_complet). Emailul conține textul
    exact al erorii, ca să nu fie nevoie de căutat în logurile GitHub Actions
    (care nu sunt accesibile pe API fără drepturi de admin).
    """
    if not ADMIN_EMAIL:
        return

    if len(erori) == 1:
        subiect = f"❌ Eroare scraper AquaMonitor: {erori[0][0]}"
    else:
        subiect = f"❌ {len(erori)} erori la rularea scraperului AquaMonitor"

    bucati = [
        "<p><b>⚠️ Rularea scraperului a avut erori la "
        f"{acum_bucuresti().strftime('%d.%m.%Y, ora %H:%M')}.</b></p>"
        "<p>Restul fazelor au rulat în continuare — o eroare nu oprește toată rularea.</p>"
    ]
    for nume, detaliu in erori:
        # Traceback-ul poate conține caractere HTML (<class ...>, &, >): escapat,
        # altfel emailul se strica vizual exact când ai cea mai mare nevoie de el.
        if len(detaliu) > 4000:
            detaliu = detaliu[:4000] + "\n… (mesaj trunchiat)"
        bucati.append(
            f"<p><b>❌ {html.escape(nume)}</b></p>"
            "<pre style='background:#f6f6f6;padding:8px;white-space:pre-wrap'>"
            f"{html.escape(detaliu)}</pre>"
        )
    link = _link_rulare_github()
    if link:
        bucati.append(f"<p><a href='{link}'>Vezi rularea pe GitHub</a></p>")

    trimite_log_admin(subiect, "".join(bucati))


def trimite_email_html(destinatar, subiect, html):
    """Trimite un email HTML pe canalul configurat (Gmail SMTP dacă e disponibil —
    varianta gratuită — altfel Resend). Returnează True DOAR dacă un furnizor a
    acceptat mesajul. La eșec, apelantul decide dacă reîncearcă mai târziu.

    Dacă primul canal cade (parolă de aplicație revocată, cotă zilnică depășită,
    API indisponibil), încercăm și al doilea înainte de a declara eșec: altfel o
    singură configurație stricată oprește toate alertele, deși există un al doilea
    canal funcțional."""
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        if trimite_email_gmail(destinatar, subiect, html):
            return True
        if not RESEND_API_KEY:
            return False
        print(f"↪️  Gmail a refuzat emailul către {destinatar} — încerc prin Resend...")

    if not RESEND_API_KEY:
        print("⚠️ Niciun canal de email configurat (GMAIL_USER sau RESEND_API_KEY).")
        return False
    trimis, motiv = trimite_resend(destinatar, subiect, html)
    if not trimis:
        print(f"⚠️ Resend a refuzat emailul către {destinatar}: {motiv} — se va reîncerca.")
    return trimis


def trimite_email(destinatar, avarie):
    """Trimite emailul. Returnează True DOAR dacă furnizorul a acceptat mesajul
    (Gmail SMTP dacă e configurat — varianta gratuită — altfel Resend).
    La eșec, notificarea NU se marchează ca trimisă, deci scraper-ul o va
    reîncerca la următoarea rulare."""
    date = pregateste_context(avarie)
    html = (
        f"<p><b>📅 Data: {date['data']}</b></p>"
        f"<p><b>📍 Locație: {date['locatie']}, {date['zona']}</b></p>"
        f"<p><b>Status: {date['status_afisat']}</b></p>"
        f"<p><b>⚡ Serviciu: {date['eticheta_serviciu']}</b></p>"
        + (f"<p><b>Tip: {date['eticheta_tip']}</b></p>" if date["tip"] else "")
        + (f"<p>Interval: {date['interval']}</p>" if date["interval"] else "")
        + f"<p>{date['descriere']}</p>"
        + (
            "<p style='color:#b91c1c'><b>🔕 Anunțul a fost retras de operator"
            " — întreruperea NU mai are loc.</b></p>" if date["anulata"] else ""
        )
        + "<p style='color:#888;font-size:12px'>AquaMonitor CT — te-ai abonat pentru alerte pe zona ta.</p>"
    )
    subiect = f"🚨 Alertă {date['eticheta_serviciu']}: {date['localitate']} - {date['status_afisat']}"

    return trimite_email_html(destinatar, subiect, html)
