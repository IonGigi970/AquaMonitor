"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { JUDETE, normalizeazaText } from "@/lib/abonamente";

interface Abonament {
  id: string;
  serviciu?: string | null;
  judet?: string | null;
  tip_contact: string;
  valoare_contact: string;
  localitate_interes: string;
  strada_interes?: string | null;
  cartier_interes?: string | null;
}

const ETICHETE_CANAL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

// Modifică un abonament existent (zona, serviciul, județul) fără să fie nevoie
// să-l ștergi și să-l re-adaugi. Canalul și contactul rămân neschimbate.
export default function EditeazaAbonament({
  abonament,
  userId,
  onInchide,
}: {
  abonament: Abonament;
  userId: string;
  onInchide: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    serviciu: abonament.serviciu ?? "apa",
    judet: abonament.judet ?? "",
    localitate_interes: abonament.localitate_interes ?? "",
    strada_interes: abonament.strada_interes ?? "",
    cartier_interes: abonament.cartier_interes ?? "",
  });
  const [seSalveaza, setSeSalveaza] = useState(false);
  const [mesaj, setMesaj] = useState<{ text: string; tip: "success" | "error" } | null>(null);

  const handleServiciuChange = (serviciu: string) => {
    setForm((prev) => ({
      ...prev,
      serviciu,
      judet: serviciu === "curent" ? (prev.judet || "Constanța") : "",
    }));
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSeSalveaza(true);
    setMesaj(null);

    const dateCuratate = {
      serviciu: form.serviciu,
      judet: form.serviciu === "curent" ? form.judet : "",
      localitate_interes: normalizeazaText(form.localitate_interes),
      strada_interes: normalizeazaText(form.strada_interes),
      cartier_interes: normalizeazaText(form.cartier_interes),
    };

    // Verificare duplicat (excluzând abonamentul curent): aceeași zonă + canal + contact.
    const { data: existente } = await supabase
      .from("abonamente")
      .select("id")
      .eq("activ", true)
      .eq("serviciu", dateCuratate.serviciu)
      .eq("tip_contact", abonament.tip_contact)
      .eq("valoare_contact", abonament.valoare_contact)
      .eq("localitate_interes", dateCuratate.localitate_interes)
      .eq("strada_interes", dateCuratate.strada_interes)
      .eq("cartier_interes", dateCuratate.cartier_interes)
      .neq("id", abonament.id)
      .limit(1);

    if (existente && existente.length > 0) {
      setSeSalveaza(false);
      setMesaj({ text: "Ai deja un alt abonament identic activ.", tip: "error" });
      return;
    }

    const { error } = await supabase
      .from("abonamente")
      .update(dateCuratate)
      .eq("id", abonament.id)
      .eq("user_id", userId);

    setSeSalveaza(false);

    if (error) {
      setMesaj({ text: "A apărut o eroare la salvare. Încearcă din nou.", tip: "error" });
      console.error(error);
      return;
    }

    setMesaj({ text: "Abonament modificat cu succes!", tip: "success" });
    setTimeout(() => {
      onInchide();
      router.refresh();
    }, 800);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800">Modifică alerta</h3>
        <button
          type="button"
          onClick={onInchide}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          ✕ Anulează
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Canal: <b>{ETICHETE_CANAL[abonament.tip_contact] ?? abonament.tip_contact}</b> —{" "}
        {abonament.valoare_contact}
      </p>

      {mesaj && (
        <div
          className={`text-sm font-semibold p-3 rounded-xl mb-4 ${
            mesaj.tip === "error" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {mesaj.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="edit-serviciu" className="block text-sm font-semibold text-slate-700 mb-1">
            Serviciu monitorizat
          </label>
          <select
            id="edit-serviciu"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900"
            value={form.serviciu}
            onChange={(e) => handleServiciuChange(e.target.value)}
          >
            <option value="apa">💧 Apă (RAJA)</option>
            <option value="curent">⚡ Energie electrică (Rețele Electrice)</option>
          </select>
        </div>

        {form.serviciu === "curent" && (
          <div>
            <label htmlFor="edit-judet" className="block text-sm font-semibold text-slate-700 mb-1">
              Județ
            </label>
            <select
              id="edit-judet"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900"
              value={form.judet}
              onChange={(e) => setForm({ ...form, judet: e.target.value })}
            >
              {JUDETE.map((judet) => (
                <option key={judet} value={judet}>
                  {judet}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="edit-localitate" className="block text-sm font-semibold text-slate-700 mb-1">
            Localitate
          </label>
          <input
            id="edit-localitate"
            type="text"
            required
            placeholder="Ex: Constanța"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
            value={form.localitate_interes}
            onChange={(e) => setForm({ ...form, localitate_interes: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-strada" className="block text-sm font-semibold text-slate-700 mb-1">
              Stradă (opțional)
            </label>
            <input
              id="edit-strada"
              type="text"
              placeholder="Ex: Dezrobirii"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
              value={form.strada_interes}
              onChange={(e) => setForm({ ...form, strada_interes: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-cartier" className="block text-sm font-semibold text-slate-700 mb-1">
              Cartier / Zonă (opțional)
            </label>
            <input
              id="edit-cartier"
              type="text"
              placeholder="Ex: Tomis 3"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
              value={form.cartier_interes}
              onChange={(e) => setForm({ ...form, cartier_interes: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={seSalveaza}
            className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
          >
            {seSalveaza ? "Se salvează..." : "Salvează modificările"}
          </button>
          <button
            type="button"
            onClick={onInchide}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition-colors"
          >
            Anulează
          </button>
        </div>
      </form>
    </div>
  );
}
