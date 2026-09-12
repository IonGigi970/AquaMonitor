"use client";

import { useCallback, useEffect, useState } from "react";

interface TelegramUser {
  username: string;
  chat_id: number;
  first_seen: string;
  first_name?: string | null;
  last_name?: string | null;
  activ: boolean;
}

export default function AdminTelegram({ userEmail }: { userEmail: string }) {
  const [users, setUsers] = useState<TelegramUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/telegram/users", {
      headers: { Authorization: `Bearer ${userEmail}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err.message));
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleUser = async (username: string, newState: boolean) => {
    try {
      const r = await fetch("/api/telegram/users/toggle", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userEmail}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, activ: newState }),
      });
      if (!r.ok) throw new Error(await r.text());
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  if (error) return <p className="text-sm text-red-500">Eroare la încărcare: {error}</p>;
  if (users === null) return <p className="text-sm text-slate-500">Se încarcă lista...</p>;
  if (users.length === 0) return <p className="text-sm text-slate-500">Niciun utilizator Telegram cu /start încă.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 text-slate-700 font-semibold">
          <tr>
            <th className="px-4 py-2">Username</th>
            <th className="px-4 py-2">Nume</th>
            <th className="px-4 py-2">chat_id</th>
            <th className="px-4 py-2">/start la</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 text-right">Acțiune</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {users.map((u) => (
            <tr
              key={u.username}
              className={`border-t border-slate-100 ${u.activ ? "" : "bg-slate-50"}`}
            >
              <td className="px-4 py-2 font-mono text-slate-900">
                @{u.username}
              </td>
              <td className="px-4 py-2 text-slate-900">
                {[u.first_name, u.last_name].filter(Boolean).join(" ") || "-"}
              </td>
              <td className="px-4 py-2 font-mono text-slate-900">{u.chat_id}</td>
              <td className="px-4 py-2 text-slate-900">
                {new Date(u.first_seen).toLocaleString("ro-RO")}
              </td>
              <td className="px-4 py-2">
                {u.activ ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Activ
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Inactiv
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => toggleUser(u.username, !u.activ)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    u.activ
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}
                >
                  {u.activ ? "Dezabonează" : "Reactivează"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
