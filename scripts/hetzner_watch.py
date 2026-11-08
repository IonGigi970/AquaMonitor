"""Urmărește stocul Hetzner pentru CX23 și migrează automat de pe CPX22.

Hetzner nu permite „rescale" de pe CPX22 (80 GB) pe CX23 (40 GB), pentru că
discul nu poate fi micșorat. Migrarea se face deci prin creare de server nou,
verificare și ștergerea celui vechi — exact ce face acest script.

Moduri:
  python scripts/hetzner_watch.py --dry-run    # doar afișează ce ar face
  python scripts/hetzner_watch.py --watch      # anunță pe Telegram când apare stoc
  python scripts/hetzner_watch.py --migrate    # creează CX23, verifică, șterge CPX22
  python scripts/hetzner_watch.py --bootstrap  # doar cloud-init-ul, pentru orice VPS

Modul --bootstrap nu atinge Hetzner: scrie cloud-init-ul într-un fișier, ca să-l
lipești la orice provider (TinyServers, DedicatServer, Netcup, Contabo).

Variabile de mediu:
  HETZNER_TOKEN        token API Hetzner Cloud (Read & Write)
  HETZNER_OLD_SERVER   id-ul serverului CPX22 care se șterge după migrare
  TELEGRAM_CONTACT     @username pentru anunțuri (implicit @Laurica70)
"""

import argparse
import base64
import os
import sys
import time
from datetime import datetime, timezone

import requests

API = "https://api.hetzner.cloud/v1"
TIP_NOU = "cx23"
TIP_VECHI = "cpx22"
LOCATII = ["fsn1", "nbg1", "hel1"]
IMAGINE = "ubuntu-24.04"
NUME_NOU = "aquamonitor-scraper"
CHEIE_SANATATE = "migrare_health"
INTERVAL_VERIFICARE = 120
TIMEOUT_SANATATE = 900


def _token():
    token = os.getenv("HETZNER_TOKEN")
    if not token:
        sys.exit("❌ HETZNER_TOKEN lipsește din mediu.")
    return token


def api(metoda, cale, date=None, usor=False):
    """Apel API Hetzner. Întoarce (status, body). Nu aruncă la 4xx."""
    raspuns = requests.request(
        metoda,
        f"{API}{cale}",
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": "application/json",
        },
        json=date,
        timeout=30,
    )
    try:
        corp = raspuns.json()
    except ValueError:
        corp = {}
    if not usor and raspuns.status_code >= 400:
        print(f"  ⚠️ {metoda} {cale} -> {raspuns.status_code} "
              f"{corp.get('error', {}).get('code', '')}")
    return raspuns.status_code, corp


def anunta(mesaj):
    print(mesaj)
    contact = os.getenv("TELEGRAM_CONTACT", "@Laurica70")
    try:
        sys.path.insert(0, os.getcwd())
        from aquamonitor.notificari.telegram import trimite_telegram_text

        trimite_telegram_text(contact, mesaj)
    except Exception as e:
        print(f"  ⚠️ Telegram indisponibil: {e}")


def stoc_cx23():
    """Lista (locație, disponibil) pentru CX23, din matricea server_types."""
    status, corp = api("GET", f"/server_types?name={TIP_NOU}", usor=True)
    if status != 200:
        return []
    for tip in corp.get("server_types", []):
        if tip.get("name") != TIP_NOU:
            continue
        return [(loc.get("name"), bool(loc.get("available")))
                for loc in tip.get("locations", [])]
    return []


def user_data(env_base64, repo_url):
    """cloud-init: instalează scraperul, îl rulează o dată și scrie sănătatea."""
    return f"""#cloud-config
package_update: true
packages: [git, python3-venv, python3-pip, cron]
write_files:
  - path: /opt/aquamonitor/.env
    permissions: '0600'
    encoding: b64
    content: {env_base64}
  - path: /opt/aquamonitor/run.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      cd /opt/aquamonitor || exit 1
      flock -n /tmp/scraper.lock /opt/aquamonitor/venv/bin/python scraper.py
runcmd:
  - [git, clone, --depth, 1, {repo_url}, /opt/aquamonitor]
  - [python3, -m, venv, /opt/aquamonitor/venv]
  - [/opt/aquamonitor/venv/bin/pip, install, -q, -r, /opt/aquamonitor/requirements.txt]
  - [/opt/aquamonitor/run.sh]
  - [bash, -c, "echo '*/15 * * * * root /opt/aquamonitor/run.sh >> /var/log/scraper.log 2>&1' > /etc/cron.d/aquamonitor"]
  - [bash, -c, "cd /opt/aquamonitor && venv/bin/python -c \\"import os,sys;sys.path.insert(0,'.');from datetime import datetime,timezone;from aquamonitor.config import supabase;supabase.table('stare_scraper').upsert({{'cheie':'{CHEIE_SANATATE}','valoare':{{'ok':True,'host':os.uname().nodename,'la':datetime.now(timezone.utc).isoformat()}}}},on_conflict='cheie').execute()\\""]
"""


def creeaza(locatie, env_base64, repo_url, ssh_key=None):
    date = {
        "name": NUME_NOU,
        "server_type": TIP_NOU,
        "image": IMAGINE,
        "location": locatie,
        "start_after_create": True,
        "user_data": user_data(env_base64, repo_url),
        "public_net": {"enable_ipv4": True, "enable_ipv6": True},
    }
    if ssh_key:
        date["ssh_keys"] = [ssh_key]
    status, corp = api("POST", "/servers", date)
    if status == 201:
        server = corp.get("server", {})
        return server.get("id"), server.get("public_net", {}).get("ipv4", {}).get("ip")
    return None, None


def sanatate_ok():
    """Citește marcajul scris de cloud-init după prima rulare reușită."""
    try:
        sys.path.insert(0, os.getcwd())
        from aquamonitor.config import supabase

        rezultat = supabase.table("stare_scraper").select("valoare").eq(
            "cheie", CHEIE_SANATATE).limit(1).execute()
        if not rezultat.data:
            return False
        valoare = rezultat.data[0].get("valoare") or {}
        return bool(valoare.get("ok"))
    except Exception as e:
        print(f"  ⚠️ Nu pot citi sănătatea: {e}")
        return False


def sterge(server_id):
    status, _ = api("DELETE", f"/servers/{server_id}", usor=True)
    print(f"  🗑️ Ștergere server {server_id} -> {status}")


def mod_watch():
    vazut = None
    while True:
        stoc = stoc_cx23()
        libere = [loc for loc, ok in stoc if ok]
        print(f"[{datetime.now(timezone.utc):%H:%M:%S}] CX23: "
              + (", ".join(libere) if libere else "indisponibil"))
        if libere and vazut != libere:
            anunta("Hetzner CX23 este din nou în stoc în: "
                   + ", ".join(libere) + ". Poți comanda acum.")
            vazut = libere
        time.sleep(INTERVAL_VERIFICARE)


def mod_migrate(env_base64, repo_url, ssh_key):
    while True:
        for locatie in LOCATII:
            print(f"Încerc creare {TIP_NOU} în {locatie}...")
            server_id, ip = creeaza(locatie, env_base64, repo_url, ssh_key)
            if not server_id:
                continue
            print(f"✅ Server nou {server_id} în {locatie}, IP {ip}")
            anunta(f"CX23 creat în {locatie} (IP {ip}). Aștept verificarea.")
            limita = time.time() + TIMEOUT_SANATATE
            while time.time() < limita:
                if sanatate_ok():
                    vechi = os.getenv("HETZNER_OLD_SERVER")
                    if vechi:
                        sterge(vechi)
                    anunta(f"Migrare completă: CX23 {server_id} rulează, "
                           f"serverul vechi {vechi or '-'} a fost șters.")
                    return
                time.sleep(30)
            anunta(f"CX23 {server_id} nu a confirmat sănătatea în "
                   f"{TIMEOUT_SANATATE // 60} min. Șterg serverul nou ca să nu "
                   f"plătești două servere, apoi reiau căutarea.")
            sterge(server_id)
            break
        time.sleep(INTERVAL_VERIFICARE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    grup = parser.add_mutually_exclusive_group()
    grup.add_argument("--watch", action="store_true",
                      help="anunță când apare stoc CX23")
    grup.add_argument("--migrate", action="store_true",
                      help="creează CX23, verifică și șterge serverul vechi")
    grup.add_argument("--dry-run", action="store_true",
                      help="doar afișează ce ar face")
    grup.add_argument("--bootstrap", action="store_true",
                      help="scrie cloud-init-ul într-un fișier, fără Hetzner")
    args = parser.parse_args()

    if args.bootstrap:
        cale_env = os.path.join(os.getcwd(), ".env")
        if not os.path.exists(cale_env):
            sys.exit("❌ .env lipsește — nu am ce include în cloud-init.")
        with open(cale_env, "rb") as fisier:
            env_base64 = base64.b64encode(fisier.read()).decode()
        repo_url = os.getenv("REPO_URL",
                             "https://github.com/IonGigi970/AquaMonitor.git")
        iesire = os.path.join(os.getcwd(), "cloud-init.yaml")
        with open(iesire, "w", encoding="utf-8", newline="\n") as fisier:
            fisier.write(user_data(env_base64, repo_url))
        print(f"✅ Scris {iesire} — lipește-l la crearea VPS-ului.")
        print("   Conține .env în base64: nu îl urca în git.")
        return

    if args.dry_run:
        print(f"Tip nou: {TIP_NOU}, tip vechi: {TIP_VECHI}, locații: {LOCATII}")
        print("1. GET /server_types?name=cx23 -> matricea locations[].available")
        print(f"2. POST /servers (cx23, {IMAGINE}) în prima locație liberă")
        print("3. cloud-init: clone, venv, pip install, o rulare, cron */15")
        print(f"4. poll stare_scraper['{CHEIE_SANATATE}'] până la 15 min")
        print("5. DELETE /servers/{HETZNER_OLD_SERVER} doar după confirmare")
        return

    if args.watch:
        mod_watch()
        return

    if args.migrate:
        cale_env = os.path.join(os.getcwd(), ".env")
        if not os.path.exists(cale_env):
            sys.exit("❌ .env lipsește — nu am ce trimite în cloud-init.")
        with open(cale_env, "rb") as fisier:
            env_base64 = base64.b64encode(fisier.read()).decode()
        repo_url = os.getenv("REPO_URL",
                             "https://github.com/IonGigi970/AquaMonitor.git")
        mod_migrate(env_base64, repo_url, os.getenv("HETZNER_SSH_KEY"))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
