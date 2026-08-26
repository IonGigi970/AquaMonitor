"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Funcție pentru curățarea textului (diacritice, litere mici, eliminare prefixe)
// - reutilizată din app/page.tsx pentru consistență cu datele salvate de scraper.
function normalizeazaText(text: string) {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(strada|str\.|bulevardul|bd\.|b-dul|alee|aleea|intrarea|cartier|cartierul)\s+/i, "")
    .trim();
}

export default function MembershipForm({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    tip_contact: "email",
    valoare_contact: userEmail,
    localitate_interes: "",
    strada_interes: "",
  });
  const [seSalveaza, setSeSalveaza] = useState(false);
  const [mesaj, setMesaj] = useState<{ text: string; tip: "success" | "error" } | null>(null);

  const handleTipContactChange = (tip: string) => {
    setForm((prev) => ({
      ...prev,
      tip_contact: tip,
      valoare_contact: tip === "email" ? userEmail : "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSeSalveaza(true);
    setMesaj(null);

    const dateCuratate = {
      user_id: userId,
      tip_contact: form.tip_contact,
      valoare_contact: form.valoare_contact.trim(),
      localitate_interes: normalizeazaText(form.localitate_interes),
      strada_interes: normalizeazaText(form.strada_interes),
    };

    const { error } = await supabase.from("abonamente").insert([dateCuratate]);

    setSeSalveaza(false);

    if (error) {
      setMesaj({ text: "A apărut o eroare la salvare. Încearcă din nou.", tip: "error" });
      console.error(error);
      return;
    }

    setMesaj({ text: "Abonament adăugat cu succes!", tip: "success" });
    setForm({
      tip_contact: "email",
      valoare_contact: userEmail,
      localitate_interes: "",
      strada_interes: "",
    });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8">
      <h2 className="text-lg font-bold text-slate-800 mb-2">Adaugă un abonament nou</h2>
      <p className="text-sm text-slate-500 mb-6">
        Primești notificări automat când apare o avarie în zona ta de interes.
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
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Canal de notificare
          </label>
          <select
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900"
            value={form.tip_contact}
            onChange={(e) => handleTipContactChange(e.target.value)}
          >
            <option value="email">Email</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Date de contact
          </label>
          <input
            type={form.tip_contact === "email" ? "email" : "text"}
            required
            readOnly={form.tip_contact === "email"}
            placeholder={
              form.tip_contact === "email"
                ? "adresa@email.com"
                : form.tip_contact === "telegram"
                ? "Username Telegram (ex: @user)"
                : "Număr de telefon (ex: 07xxxxxxxx)"
            }
            className={`w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400 ${
              form.tip_contact === "email" ? "bg-slate-100 text-slate-500" : "bg-slate-50"
            }`}
            value={form.valoare_contact}
            onChange={(e) => setForm({ ...form, valoare_contact: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Localitate
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Constanța"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
              value={form.localitate_interes}
              onChange={(e) => setForm({ ...form, localitate_interes: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Stradă / Cartier (opțional)
            </label>
            <input
              type="text"
              placeholder="Ex: Faleză Nord"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
              value={form.strada_interes}
              onChange={(e) => setForm({ ...form, strada_interes: e.target.value })}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={seSalveaza}
          className="w-full mt-2 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400"
        >
          {seSalveaza ? "Se salvează..." : "Activează Alerta"}
        </button>
      </form>
    </div>
  );
}
