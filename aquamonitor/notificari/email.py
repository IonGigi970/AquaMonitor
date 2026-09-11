"""Emailuri: trimitere prin Gmail SMTP (gratuit) sau Resend, plus logurile admin."""

import smtplib
from email.message import EmailMessage

import requests

from ..config import (
    ADMIN_EMAIL,
    ETICHETE_SERVICIU,
    GMAIL_APP_PASSWORD,
    GMAIL_USER,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    STATUSURI_AFISATE,
)

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
    try:
        raspuns = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [ADMIN_EMAIL],
                "subject": subiect,
                "html": html
            },
            timeout=15
        )
        if raspuns.status_code < 200 or raspuns.status_code >= 300:
            print(f"⚠️ Resend a refuzat log-ul admin: {raspuns.status_code} {raspuns.text[:200]}")
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea log-ului admin: {e}")


def trimite_email_html(destinatar, subiect, html):
    """Trimite un email HTML pe canalul configurat (Gmail SMTP dacă e disponibil —
    varianta gratuită — altfel Resend). Returnează True DOAR dacă furnizorul a
    acceptat mesajul. La eșec, apelantul decide dacă reîncearcă mai târziu."""
    if GMAIL_USER and GMAIL_APP_PASSWORD:
        return trimite_email_gmail(destinatar, subiect, html)

    if not RESEND_API_KEY:
        print("⚠️ Niciun canal de email configurat (GMAIL_USER sau RESEND_API_KEY).")
        return False
    try:
        raspuns = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [destinatar],
                "subject": subiect,
                "html": html
            },
            timeout=15
        )
        if raspuns.status_code >= 200 and raspuns.status_code < 300:
            return True
        print(f"⚠️ Resend a refuzat emailul către {destinatar}: {raspuns.status_code} "
              f"{raspuns.text[:200]} — se va reîncerca la următoarea rulare.")
        return False
    except Exception as e:
        print(f"⚠️ Eroare la trimiterea emailului către {destinatar}: {e} — se va reîncerca.")
        return False


def trimite_email(destinatar, avarie):
    """Trimite emailul. Returnează True DOAR dacă furnizorul a acceptat mesajul
    (Gmail SMTP dacă e configurat — varianta gratuită — altfel Resend).
    La eșec, notificarea NU se marchează ca trimisă, deci scraper-ul o va
    reîncerca la următoarea rulare."""
    data = avarie.get("data") or ""
    serviciu = avarie.get("serviciu") or "apa"
    eticheta = ETICHETE_SERVICIU.get(serviciu, serviciu)
    judet = avarie.get("judet") or ""
    locatie = avarie['localitate']
    if judet and serviciu == "curent":
        locatie = f"{avarie['localitate']} (județul {judet})"
    tip = avarie.get("tip_intrerupere")
    eticheta_tip = "📅 Deconectare programată" if tip == "programata" else "⚡ Întrerupere accidentală"
    status_afisat = STATUSURI_AFISATE.get(avarie.get("status"), avarie.get("status", "?"))
    anulata = avarie.get("status") == "ANULATA"
    data_inceput = avarie.get('data_inceput') or ""
    data_sfarsit = avarie.get('data_sfarsit') or ""
    interval = (f"{data_inceput} - {data_sfarsit}").strip(" -") or ""
    html = (
        f"<p><b>📅 Data: {data}</b></p>"
        f"<p><b>📍 Locație: {locatie}, {avarie['strada']}</b></p>"
        f"<p><b>Status: {status_afisat}</b></p>"
        f"<p><b>⚡ Serviciu: {eticheta}</b></p>"
        + (f"<p><b>Tip: {eticheta_tip}</b></p>" if tip else "")
        + (f"<p>Interval: {interval}</p>" if interval else "")
        + f"<p>{avarie.get('descriere_text', '')}</p>"
        + ("<p style='color:#b91c1c'><b>🔕 Anunțul a fost retras de operator — întreruperea NU mai are loc.</b></p>" if anulata else "")
        + f"<p style='color:#888;font-size:12px'>AquaMonitor CT — te-ai abonat pentru alerte pe zona ta.</p>"
    )
    subiect = f"🚨 Alertă {eticheta}: {avarie['localitate']} - {status_afisat}"

    return trimite_email_html(destinatar, subiect, html)
