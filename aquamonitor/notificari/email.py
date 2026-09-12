"""Emailuri: trimitere prin Gmail SMTP (gratuit) sau Resend, plus logurile admin."""

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
    trimis, motiv = trimite_resend(ADMIN_EMAIL, subiect, html)
    if not trimis:
        print(f"⚠️ Resend a refuzat log-ul admin: {motiv}")


def trimite_email_html(destinatar, subiect, html):
    """Trimite un email HTML pe canalul configurat (Gmail SMTP dacă e disponibil —
    varianta gratuită — altfel Resend). Returnează True DOAR dacă furnizorul a
    acceptat mesajul. La eșec, apelantul decide dacă reîncearcă mai târziu."""
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        return trimite_email_gmail(destinatar, subiect, html)

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
