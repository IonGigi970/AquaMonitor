import { redirect } from "next/navigation";
import SiteHeader from "@/components/siteHeader";
import { createClient } from "@/lib/supabase/server";
import MembershipForm from "./membershipForm";
import ListaAbonamente from "./listaAbonamente";
import AdminTelegram from "./adminTelegram";
import AdminStats from "./adminStats";

export default async function MembershipPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect("/login");
  }

  const { data: abonamente } = await supabase
    .from("abonamente")
    .select("*")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false });

  const adminEmails = (process.env.ADMIN_EMAILS || "aquamonitorct@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const isAdmin = !!data.user.email && adminEmails.includes(data.user.email.toLowerCase());

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      <SiteHeader varianta="simplu" inapoi={{ href: "/", eticheta: "← Înapoi la hartă" }} />

      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Alertele mele</h1>
        <p className="text-sm text-slate-500 mb-6">
          Conectat ca <span className="font-semibold">{data.user.email}</span>
        </p>

        <MembershipForm userId={data.user.id} userEmail={data.user.email ?? ""} />

        <div className="mt-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            Abonamente active ({abonamente?.length ?? 0})
          </h2>

          {!abonamente || abonamente.length === 0 ? (
            <p className="text-slate-500 bg-white p-5 rounded-2xl border border-slate-200">
              Nu ai niciun abonament activ momentan. Adaugă unul mai sus.
            </p>
          ) : (
            <ListaAbonamente abonamente={abonamente} userId={data.user.id} />
          )}
        </div>

        {isAdmin && (
          <>
            <div className="mt-8">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Statistici (admin)
              </h2>
              <AdminStats userEmail={data.user.email ?? ""} />
            </div>

            <div className="mt-8">
              <h2 className="text-lg font-bold text-slate-800 mb-4">
                Utilizatori Telegram cu /start
              </h2>
              <AdminTelegram userEmail={data.user.email ?? ""} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
