"""Potrivirea avariilor cu abonamentele si trimiterea alertelor catre abonati."""

import re

from ..config import (
    CANAL_EMAIL,
    CANAL_TELEGRAM,
    ETICHETE_SERVICIU,
    SERVICIU_APA,
    SERVICIU_CURENT,
    STATUS_REMEDIAT,
    TIP_PROGRAMATA,
    supabase,
)
from ..db import citeste_toate
from ..utils import azi_bucuresti, contine_substring, normalizeaza_text, zona_avariei
from .email import trimite_email, trimite_email_html, trimite_log_admin
from .telegram import trimite_telegram, trimite_telegram_text

# Coloanele de care avem nevoie din abonamente. `select("*")` ar transfera si
# coloanele nefolosite, de mai multe ori pe rulare.
COLOANE_ABONAMENT = (
    "id,activ,serviciu,judet,tip_contact,valoare_contact,"
    "localitate_interes,strada_interes,cartier_interes"
)

# Coloanele de care avem nevoie cand reluam notificarile pentru o avarie.
COLOANE_AVARIE = (
    "id,serviciu,localitate,strada,cartier,status,descriere_text,data_inceput,"
    "data_sfarsit,data,sursa_url,tip_intrerupere,judet,detalii_anunt"
)

# Abonamente care au primit deja notificare pentru un comunicat sursă (în această rulare).
# Un anunț RAJA generează mai multe avarii (una per stradă + una per cartier/zonă);
# fără acest set, abonatul ar primi un email per zonă din același comunicat.
notificari_pe_sursa = set()

# Abonamentele active si notificarile deja trimise, incarcate o singura data per
# proces (= o rulare de scraper) si tinute minte. Fara cache, fiecare avarie
# (pana la ~350 pe rulare) facea propriile interogari catre Supabase: una pentru
# abonamente plus una pentru fiecare abonament potrivit, adica mii de cereri
# HTTP la fiecare rulare.
# ATENTIE: cache-ul presupune un proces de scurta durata. Daca scraperul ajunge
# vreodata un proces de lunga durata (server), datele trebuie reincarcate periodic.
_abonamente_active = None
_notificari_trimise = None


def _incarca_abonamente():
    """Toate abonamentele active, citite o singura data per proces."""
    global _abonamente_active
    if _abonamente_active is None:
        _abonamente_active = citeste_toate(
            lambda: supabase.table("abonamente").select(COLOANE_ABONAMENT).eq("activ", True)
        )
    return _abonamente_active


def _incarca_notificari_trimise():
    """Perechile (abonament, avarie) pentru care alerta a plecat deja."""
    global _notificari_trimise
    if _notificari_trimise is None:
        randuri = citeste_toate(
            lambda: supabase.table("notificari_trimise").select("abonament_id,avarie_id")
        )
        _notificari_trimise = {(r["abonament_id"], r["avarie_id"]) for r in randuri}
    return _notificari_trimise


def _a_fost_trimis(abonament_id, avarie_id):
    return (abonament_id, avarie_id) in _incarca_notificari_trimise()


def _marcheaza_trimis(abonament_id, avarie_id):
    _incarca_notificari_trimise().add((abonament_id, avarie_id))


def sterge_notificari_pentru_avarie(avarie_id):
    """Șterge marcajele de notificare ale unei avarii retrase de operator.

    Se folosește când o deconectare programată devine ANULATA: abonații trebuie să
    poată primi anunțul de retragere, deci vechile marcaje nu mai au sens.
    Cache-ul se actualizează în același timp — altfel deduplicarea ar sări exact
    peste notificarea de retragere.
    """
    supabase.table("notificari_trimise").delete().eq("avarie_id", avarie_id).execute()
    if _notificari_trimise is not None:
        for cheie in [c for c in _notificari_trimise if c[1] == avarie_id]:
            _notificari_trimise.discard(cheie)


def se_potriveste_abonamentul(strada_abonament, cartier_abonament, strada_norm, cartier_norm, text_zona=""):
    """Returnează True dacă un abonament (stradă/cartier de interes) se potrivește
    cu o avarie (stradă/cartier normalizate).

    Reguli:
    - Dacă abonatul nu are nici stradă, nici cartier → se potrivește cu orice avarie
      din localitatea lui (abonament pe toată localitatea).
    - Potrivire bidirecțională pe subșir: acoperă nume scrise parțial de RAJA
      (ex: abonat pe "Revoluției din 22 Decembrie 1989", anunț cu "Revoluției").
    - Câmpurile se verifică încrucișat (cartierul abonatului în strada avariei și
      invers), ca să acopere abonamente vechi salvate în câmpul greșit.
    - Pentru deconectările programate zona reală stă în textul anunțului (detalii),
      nu în câmpuri structurate: dacă text_zona e dat, termenul abonatului se caută
      și acolo, la graniță de cuvânt (ex: cartier "viile noi" prinde "zona Viile Noi")."""
    if cartier_abonament or strada_abonament:
        potrivire = False
        if cartier_abonament:
            potrivire = (
                contine_substring(cartier_abonament, cartier_norm)
                or contine_substring(cartier_norm, cartier_abonament)
                or contine_substring(cartier_abonament, strada_norm)
                or contine_substring(strada_norm, cartier_abonament)
            )
        if strada_abonament and not potrivire:
            potrivire = (
                contine_substring(strada_abonament, strada_norm)
                or contine_substring(strada_norm, strada_abonament)
                or contine_substring(strada_abonament, cartier_norm)
                or contine_substring(cartier_norm, strada_abonament)
            )
        if not potrivire and text_zona:
            for termen in (cartier_abonament, strada_abonament):
                if termen and re.search(r"(?<![a-z0-9])" + re.escape(termen) + r"(?![a-z0-9])", text_zona):
                    return True
        return potrivire
    return True


def notifica_abonatii(avarie_salvata):
    """Găsește abonații interesați de această zonă și le trimite alertă (o singură dată/abonament).

    Un anunț RAJA generează mai multe avarii (una per stradă + una per cartier/zonă).
    Fără deduplicare, un abonat pe toată localitatea ar primi câte un email per zonă.
    De aceea trimitem MAXIM o notificare per abonament pentru același comunicat (sursa_url).
    """
    localitate_norm = normalizeaza_text(avarie_salvata.get("localitate"))
    strada_norm = normalizeaza_text(avarie_salvata.get("strada", ""))
    cartier_norm = normalizeaza_text(avarie_salvata.get("cartier", ""))
    sursa_url = avarie_salvata.get("sursa_url")
    avarie_id = avarie_salvata.get("id")

    serviciu = avarie_salvata.get("serviciu") or SERVICIU_APA
    # La deconectările programate zona reală (cartiere/străzi) e doar în textul
    # anunțului, deci îl punem la dispoziția potrivirii pentru abonați pe stradă/cartier.
    text_zona = ""
    if serviciu == SERVICIU_CURENT and avarie_salvata.get("tip_intrerupere") == TIP_PROGRAMATA:
        text_zona = normalizeaza_text(
            f"{avarie_salvata.get('detalii_anunt') or ''} {avarie_salvata.get('descriere_text') or ''}"
        )

    # Filtrăm local, din abonamentele deja încărcate: o interogare per avarie ar
    # însemna câteva sute de cereri HTTP pe rulare. Comparăm localitățile
    # normalizate, ca și abonamentele mai vechi (scrise cu diacritice) să se potrivească.
    abonamente = [
        a for a in _incarca_abonamente()
        if a.get("serviciu") == serviciu
        and normalizeaza_text(a.get("localitate_interes")) == localitate_norm
    ]

    for abonament in abonamente:
        abonament_id = abonament.get("id")
        # Filtru pe județ (doar la energie electrică — aceeași localitate poate
        # exista în mai multe județe, ex: Mihail Kogălniceanu). Abonamentele fără
        # județ salvat (cele vechi, dinainte de migrarea 010) primesc din toate.
        if serviciu == SERVICIU_CURENT:
            judet_avarie = normalizeaza_text(avarie_salvata.get("judet") or "")
            judet_abonament = normalizeaza_text(abonament.get("judet") or "")
            if judet_abonament and (not judet_avarie or judet_avarie != judet_abonament):
                continue

        strada_abonament = normalizeaza_text(abonament.get("strada_interes") or "")
        cartier_abonament = normalizeaza_text(abonament.get("cartier_interes") or "")

        if not se_potriveste_abonamentul(strada_abonament, cartier_abonament, strada_norm, cartier_norm, text_zona):
            continue

        # O singură notificare per abonament pentru același comunicat sursă
        if sursa_url and (abonament_id, sursa_url) in notificari_pe_sursa:
            continue

        # Verificăm dacă am trimis deja notificare pentru acest abonament + această
        # avarie, din marcajele deja încărcate (nu cu o interogare per abonament).
        if _a_fost_trimis(abonament_id, avarie_id):
            continue

        tip = abonament.get("tip_contact")
        contact = abonament.get("valoare_contact")

        trimis_cu_succes = False
        if tip == CANAL_EMAIL:
            trimis_cu_succes = trimite_email(contact, avarie_salvata)
        elif tip == CANAL_TELEGRAM:
            trimis_cu_succes = trimite_telegram(contact, avarie_salvata)
        # whatsapp / sms: neimplementate încă (necesită cont Twilio sau similar)

        # Marcăm notificarea ca trimisă DOAR dacă livrarea a fost confirmată.
        # Dacă a eșuat (ex: Resend refuză expeditorul, bot blocat), rămâne
        # nemarcată și scraper-ul o reîncearcă la următoarea rulare.
        if not trimis_cu_succes:
            continue

        supabase.table("notificari_trimise").insert({
            "abonament_id": abonament_id,
            "avarie_id": avarie_id,
        }).execute()
        _marcheaza_trimis(abonament_id, avarie_id)

        if sursa_url:
            notificari_pe_sursa.add((abonament_id, sursa_url))

        # Log admin: cine a fost notificat, pentru ce zonă și pe ce canal
        canal = {CANAL_EMAIL: "Email", CANAL_TELEGRAM: "Telegram"}.get(tip, str(tip))
        zona = zona_avariei(avarie_salvata)
        strada_abonament = abonament.get("strada_interes") or ""
        trimite_log_admin(
            f"📨 Notificare trimisă: {avarie_salvata.get('localitate')} - {zona}",
            f"<p><b>Notificare trimisă</b></p>"
            f"<p><b>📍 Zonă:</b> {avarie_salvata.get('localitate')}, {zona}</p>"
            f"<p><b>Status:</b> {avarie_salvata.get('status')}</p>"
            f"<p><b>📅 Data:</b> {avarie_salvata.get('data') or 'azi'}</p>"
            f"<p><b>👤 Către:</b> {contact}</p>"
            f"<p><b>📡 Canal:</b> {canal}</p>"
            f"<p><b>🗺️ Zona abonată:</b> {abonament.get('localitate_interes')}"
            f"{' - ' + strada_abonament if strada_abonament else ''}</p>"
        )


def reincearca_notificari_esuate():
    """Reîncearcă notificările care nu au ajuns la toți abonații.

    Când o trimitere eșuează (email refuzat, bot indisponibil), notificarea nu se
    marchează ca trimisă. La rulările următoare articolul e deja procesat și nu mai
    trece prin notifica_abonatii — fără această fază, notificarea eșuată s-ar pierde
    definitiv. Reluăm notificarea pentru avariile de apă de azi + întreruperile de
    curent încă active; deduplicarea din notificari_trimise (abonament+avarie) și
    din notificari_pe_sursa garantează că nimeni nu primește de două ori aceeași
    alertă."""
    azi_str = azi_bucuresti().isoformat()
    avarii_de_reluat = []
    try:
        # Avarii apă publicate azi (mărginite la o singură zi, deci puține)
        rezultat = (
            supabase.table("avarii")
            .select(COLOANE_AVARIE)
            .eq("serviciu", SERVICIU_APA)
            .eq("data", azi_str)
            .execute()
        )
        avarii_de_reluat.extend(rezultat.data or [])
        # Întreruperi de curent încă active (indiferent de ziua începerii).
        # Citire paginată: pot depăși 1000 de rânduri, iar un răspuns trunchiat ar
        # sări exact avariile pentru care mai avem notificări de trimis.
        avarii_de_reluat.extend(citeste_toate(
            lambda: supabase.table("avarii")
            .select(COLOANE_AVARIE)
            .eq("serviciu", SERVICIU_CURENT)
            .neq("status", STATUS_REMEDIAT)
        ))
    except Exception as e:
        print(f"⚠️ Eroare la preluarea avariilor pentru reîncercare: {e}")
        return

    if not avarii_de_reluat:
        return
    print(f"🔁 Verific notificări pentru {len(avarii_de_reluat)} avarii active (reîncercare cele eșuate)...")

    erori = 0
    for avarie in avarii_de_reluat:
        # Izolăm fiecare avarie: una problematică nu trebuie să oprească
        # notificările pentru toate celelalte.
        try:
            notifica_abonatii(avarie)
        except Exception as e:
            erori += 1
            print(f"⚠️ Eroare la notificarea avariei {avarie.get('id')} "
                  f"({avarie.get('localitate')}): {e}")
    if erori:
        print(f"⚠️ {erori} avarii au fost sărite din cauza unor erori (se reia la rularea următoare).")


def trimite_notificare_test(abonament_id):
    """Trimite o notificare de test către un abonament (folosită din UI prin
    workflow-ul GitHub cu argumentul --test-notificare). NU înregistrează nimic
    în notificari_trimise — e doar o verificare a canalului de livrare."""
    try:
        rezultat = (
            supabase.table("abonamente")
            .select(COLOANE_ABONAMENT)
            .eq("id", abonament_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"❌ Eroare la citirea abonamentului {abonament_id}: {e}")
        return False
    if not rezultat.data:
        print(f"❌ Abonamentul {abonament_id} nu există.")
        return False
    abonament = rezultat.data[0]
    if not abonament.get("activ"):
        print(f"❌ Abonamentul {abonament_id} e inactiv — nu se trimite test.")
        return False

    serviciu = abonament.get("serviciu") or SERVICIU_APA
    eticheta = ETICHETE_SERVICIU.get(serviciu, serviciu)
    localitate = abonament.get("localitate_interes") or "zona ta"
    judet = abonament.get("judet") or ""
    zona = (abonament.get("strada_interes") or abonament.get("cartier_interes")) or "toată localitatea"
    locatie = localitate + (f", jud. {judet}" if judet else "")
    tip = abonament.get("tip_contact")
    contact = abonament.get("valoare_contact")

    print(f"🔔 Trimit notificare de test: {locatie} ({zona}) pe canalul {tip} ({contact})...")
    if tip == CANAL_EMAIL:
        html = (
            "<p>Salut,</p>"
            "<p>Aceasta este o <b>notificare de test</b> de la AquaMonitor CT.</p>"
            f"<p><b>Abonamentul tău:</b> {eticheta} — {locatie}, {zona}.</p>"
            "<p>Dacă primești acest email, alertele funcționează corect pentru zona ta. "
            "Nu trebuie să faci nimic.</p>"
            "<p style='color:#888;font-size:12px'>AquaMonitor CT — notificări pe zone de interes</p>"
        )
        return trimite_email_html(contact, f"🔔 Notificare de test {eticheta} — {localitate}", html)

    if tip == CANAL_TELEGRAM:
        mesaj = (
            "🔔 *Notificare de test* — AquaMonitor CT\n\n"
            f"Abonamentul tău: {eticheta} — {locatie}, {zona}.\n\n"
            "Dacă primești acest mesaj, alertele funcționează corect pentru zona ta. "
            "Nu trebuie să faci nimic."
        )
        return trimite_telegram_text(contact, mesaj)

    print(f"❌ Canalul de notificare '{tip}' nu e implementat (doar email și telegram).")
    return False
