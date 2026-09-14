// Supabase fals, în memorie, pentru testele botului Telegram.
//
// De ce: testele trebuie să ruleze fără baza de date de producție. Acest mock
// acoperă exact lanțul de metode folosit de lib/telegram/stocare.ts
// (from().select().eq().maybeSingle() etc.) și ține datele în obiecte simple,
// ca testele să poată verifica starea după fiecare mesaj.

type Rand = Record<string, unknown>;

export class SupabaseFals {
  tabele: Record<string, Rand[]> = {
    telegram_users: [],
    telegram_conversatii: [],
    abonamente: [],
  };

  /** Erori injectate artificial, pe tabelă (pentru testarea căilor de eroare). */
  erori: Record<string, string> = {};

  from(tabel: string) {
    if (!this.tabele[tabel]) this.tabele[tabel] = [];
    return new Interogare(this, tabel);
  }

  randuri(tabel: string): Rand[] {
    return this.tabele[tabel] || [];
  }
}

class Interogare implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtre: Array<[string, unknown]> = [];
  private ordonare: { coloana: string; crescator: boolean } | null = null;
  private limita: number | null = null;
  private actiune: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private valori: Rand | null = null;
  private conflict: string | null = null;
  private coloane: string | null = null;
  private db: SupabaseFals;
  private tabel: string;

  constructor(db: SupabaseFals, tabel: string) {
    this.db = db;
    this.tabel = tabel;
  }

  select(coloane = "*") {
    this.actiune = "select";
    this.coloane = coloane;
    return this;
  }

  insert(valori: Rand) {
    this.actiune = "insert";
    this.valori = valori;
    return this;
  }

  update(valori: Rand) {
    this.actiune = "update";
    this.valori = valori;
    return this;
  }

  upsert(valori: Rand, optiuni?: { onConflict?: string }) {
    this.actiune = "upsert";
    this.valori = valori;
    this.conflict = optiuni?.onConflict ?? null;
    return this;
  }

  delete() {
    this.actiune = "delete";
    return this;
  }

  eq(coloana: string, valoare: unknown) {
    this.filtre.push([coloana, valoare]);
    return this;
  }

  order(coloana: string, optiuni?: { ascending?: boolean }) {
    this.ordonare = { coloana, crescator: optiuni?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limita = n;
    return this;
  }

  private potriveste(rand: Rand): boolean {
    return this.filtre.every(([coloana, valoare]) => rand[coloana] === valoare);
  }

  private aplicaFiltre(): Rand[] {
    let randuri = this.db.randuri(this.tabel).filter((r) => this.potriveste(r));
    if (this.ordonare) {
      const { coloana, crescator } = this.ordonare;
      randuri = [...randuri].sort((a, b) => {
        const x = String(a[coloana] ?? "");
        const y = String(b[coloana] ?? "");
        return crescator ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    if (this.limita !== null) randuri = randuri.slice(0, this.limita);
    return randuri;
  }

  private proiecteaza(rand: Rand): Rand {
    if (!this.coloane || this.coloane === "*") return { ...rand };
    const cerute = this.coloane.split(",").map((c) => c.trim());
    const rezultat: Rand = {};
    for (const coloana of cerute) rezultat[coloana] = rand[coloana];
    return rezultat;
  }

  private executa(): { data: unknown; error: unknown } {
    const eroareInjectata = this.db.erori[this.tabel];
    if (eroareInjectata) return { data: null, error: { message: eroareInjectata } };

    const tabel = this.db.tabele[this.tabel];

    if (this.actiune === "select") {
      return { data: this.aplicaFiltre().map((r) => this.proiecteaza(r)), error: null };
    }

    if (this.actiune === "insert") {
      const rand = { id: `id-${tabel.length + 1}`, ...(this.valori || {}) };
      tabel.push(rand);
      return { data: [rand], error: null };
    }

    if (this.actiune === "upsert") {
      const cheie = this.conflict || "id";
      const existent = tabel.find((r) => r[cheie] === (this.valori || {})[cheie]);
      if (existent) {
        Object.assign(existent, this.valori);
        return { data: [existent], error: null };
      }
      const rand = { id: `id-${tabel.length + 1}`, ...(this.valori || {}) };
      tabel.push(rand);
      return { data: [rand], error: null };
    }

    if (this.actiune === "update") {
      const afectate = this.aplicaFiltre();
      for (const rand of afectate) Object.assign(rand, this.valori);
      return { data: afectate, error: null };
    }

    // delete
    const deSters = this.aplicaFiltre();
    this.db.tabele[this.tabel] = tabel.filter((r) => !deSters.includes(r));
    return { data: deSters, error: null };
  }

  async maybeSingle() {
    const { data, error } = this.executa();
    if (error) return { data: null, error };
    const lista = (data as Rand[]) || [];
    return { data: lista[0] ?? null, error: null };
  }

  then<TRezultat1 = { data: unknown; error: unknown }, TRezultat2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TRezultat1 | PromiseLike<TRezultat1>) | null,
    onrejected?: ((reason: unknown) => TRezultat2 | PromiseLike<TRezultat2>) | null
  ): PromiseLike<TRezultat1 | TRezultat2> {
    return Promise.resolve(this.executa()).then(onfulfilled, onrejected);
  }
}

/**
 * Instanța unică folosită în teste. Atât botul (prin clientul fals din
 * supabase-client-fals.ts, instalat de _alias-hooks.mjs), cât și testele trebuie
 * să vadă ACELEAȘI date: dacă fiecare are câte o instanță separată, testele
 * verifică o bază de date în care botul nu a scris niciodată și cad pe stări
 * care nu există.
 */
export const supabaseFals = new SupabaseFals();
