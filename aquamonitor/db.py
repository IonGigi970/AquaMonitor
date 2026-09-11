"""Acces la baza de date: citire paginata, ca sa nu pierdem randuri pe drum.

Supabase intoarce implicit cel mult 1000 de randuri per cerere. Tabela `avarii`
depaseste frecvent acest prag (peste 1000 de randuri de energie electrica), iar
un raspuns trunchiat e periculos tocmai pentru ca nu se vede: randurile lipsa
par noi, asa ca sincronizarile incearca sa le insereze din nou si primesc
eroare de cheie duplicata.
"""

# Limita implicita de randuri per cerere impusa de Supabase/PostgREST.
LIMITA_PAGINA = 1000


def citeste_toate(construieste_interogarea):
    """Ruleaza o interogare Supabase paginata si intoarce TOATE randurile.

    Primeste o funcție care construieste interogarea, nu interogarea in sine:
    `.range()` modifica obiectul builder in loc sa intoarca unul nou, deci
    reapelarea lui pe acelasi obiect ar aduna parametri `offset`/`limit`
    duplicati in cerere.

    Exemplu:
        randuri = citeste_toate(
            lambda: supabase.table("avarii").select("id").eq("serviciu", "curent")
        )
    """
    randuri = []
    start = 0
    while True:
        raspuns = construieste_interogarea().range(start, start + LIMITA_PAGINA - 1).execute()
        bucata = raspuns.data or []
        randuri.extend(bucata)
        if len(bucata) < LIMITA_PAGINA:
            return randuri
        start += LIMITA_PAGINA
