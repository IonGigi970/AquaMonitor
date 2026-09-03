"use client";

import { useEffect, useState } from "react";

interface TelegramUser {
  username: string;
  chat_id: number;
  first_seen: string;
  first_name?: string | null;
  last_name?: string | null;
}

export default function AdminTelegram({ userEmail }: { userEmail: string }) {
  const [users, setUsers] = useState<TelegramUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          </tr>
        </thead>
        <tbody className="bg-white">
          {users.map((u) => (
            <tr key={u.username} className="border-t border-slate-100">
              <td className="px-4 py-2 font-mono">@{u.username}</td>
              <td className="px-4 py-2">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "-"}</td>
              <td className="px-4 py-2 font-mono">{u.chat_id}</td>
              <td className="px-4 py-2">{new Date(u.first_seen).toLocaleString("ro-RO")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
