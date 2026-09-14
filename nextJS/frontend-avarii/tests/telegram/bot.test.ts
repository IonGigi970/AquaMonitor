// Teste pentru botul Telegram: fluxurile de abonare, comenzile, cazurile limită
// și protecția webhook-ului. Rulează complet offline (Supabase și Telegram sunt
// înlocuite în tests/telegram/mediu.ts).
//
// Rulare: npm test

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  goleste,
  mesajeTrimise,
  supabaseFals,
  texteleTrimise,
  trimiteMesajBotului,
  ultimulMesaj,
} from "./mediu";

const CHAT = 900000001;
const USER = "utilizator_test";
const OPTIUNI = { username: USER };

beforeEach(() => {
  goleste();
});

// ── Comenzi de bază ────────────────────────────────────────────────────────
test("/start reactivează utilizatorul și trimite lista de comenzi", async () => {
  const { status } = await trimiteMesajBotului(CHAT, "/start", OPTIUNI);

  assert.equal(status, 200);
  const utilizator = supabaseFals.randuri("telegram_users")[0];
  assert.equal(utilizator.username, USER);
  assert.equal(utilizator.activ, true);
  assert.equal(utilizator.chat_id, CHAT);
  assert.match(ultimulMesaj().text, /Te-ai reactivat/);
  assert.match(ultimulMesaj().text, /\/aboneaza/);
});

test("/stop dezactivează utilizatorul și șterge conversația în curs", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 1);

  await trimiteMesajBotului(CHAT, "/stop", OPTIUNI);

  assert.equal(supabaseFals.randuri("telegram_users")[0].activ, false);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
  assert.match(ultimulMesaj().text, /Notificările sunt oprite/);
});

test("orice mesaj de la un utilizator cu username îl marchează activ", async () => {
  await trimiteMesajBotului(CHAT, "salut", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_users")[0].activ, true);
});

test("mesaj liber fără conversație sugerează comenzile", async () => {
  await trimiteMesajBotului(CHAT, "salut", OPTIUNI);
  assert.equal(ultimulMesaj().text, "Scrie /comenzi ca să vezi ce pot face.");
});

test("comandă necunoscută primește îndrumare, nu tăcere", async () => {
  await trimiteMesajBotului(CHAT, "/habar_nu_am", OPTIUNI);
  assert.match(ultimulMesaj().text, /Nu cunosc comanda asta/);
});

test("utilizatorul fără @username este salvat ca id_<chat_id>", async () => {
  await trimiteMesajBotului(CHAT, "/start", {});
  assert.equal(supabaseFals.randuri("telegram_users")[0].username, `id_${CHAT}`);
});

test("username-ul de pe chat e folosit când mesajul nu are unul", async () => {
  await trimiteMesajBotului(CHAT, "/start", { chatUsername: "DoarPeChat" });
  assert.equal(supabaseFals.randuri("telegram_users")[0].username, "doarpechat");
});

// ── Fluxul de abonare la apă ───────────────────────────────────────────────
test("flux complet de abonare la apă creează abonamentul corect", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "serviciu");
  assert.deepEqual(ultimulMesaj().butoane, [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]);

  await trimiteMesajBotului(CHAT, "1", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "localitate");

  await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "strada");

  await trimiteMesajBotului(CHAT, "Strada Tomis", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "cartier");

  await trimiteMesajBotului(CHAT, "-", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "confirmare");
  assert.match(ultimulMesaj().text, /Confirmă abonamentul/);
  assert.deepEqual(ultimulMesaj().butoane, [["✅ Da, abonează-mă"], ["❌ Anulează"]]);

  await trimiteMesajBotului(CHAT, "✅ Da, abonează-mă", OPTIUNI);

  const abonamente = supabaseFals.randuri("abonamente");
  assert.equal(abonamente.length, 1);
  assert.equal(abonamente[0].serviciu, "apa");
  assert.equal(abonamente[0].tip_contact, "telegram");
  assert.equal(abonamente[0].valoare_contact, `@${USER}`);
  assert.equal(abonamente[0].localitate_interes, "constanta");
  assert.equal(abonamente[0].strada_interes, "tomis");
  assert.equal(abonamente[0].cartier_interes, "");
  assert.equal(abonamente[0].judet, null);
  assert.equal(abonamente[0].activ, true);
  assert.equal(abonamente[0].user_id, null);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
  assert.match(ultimulMesaj().text, /Abonament activ/);
});

test("fluxul de curent cere județul și îl salvează pe abonament", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "⚡ Energie electrică", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "judet");

  await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "localitate");

  await trimiteMesajBotului(CHAT, "Năvodari", OPTIUNI);
  await trimiteMesajBotului(CHAT, "Mamaia", OPTIUNI);
  await trimiteMesajBotului(CHAT, "Centru", OPTIUNI);
  await trimiteMesajBotului(CHAT, "ok", OPTIUNI);

  const abonament = supabaseFals.randuri("abonamente")[0];
  assert.equal(abonament.serviciu, "curent");
  assert.equal(abonament.judet, "Constanța");
  assert.equal(abonament.localitate_interes, "navodari");
  assert.equal(abonament.cartier_interes, "centru");
});

test("județul nerecunoscut nu lasă conversația să avanseze", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "curent", OPTIUNI);
  await trimiteMesajBotului(CHAT, "xyz", OPTIUNI);

  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "judet");
  assert.match(ultimulMesaj().text, /Nu recunosc județul/);
});

test("serviciul nerecunoscut repetă întrebarea cu butoanele", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "ceva", OPTIUNI);

  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "serviciu");
  assert.deepEqual(ultimulMesaj().butoane, [["💧 Apă (RAJA)"], ["⚡ Energie electrică"]]);
});

test("răspuns negativ la confirmare anulează, fără să creeze abonament", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "apa", OPTIUNI);
  await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);
  await trimiteMesajBotului(CHAT, "-", OPTIUNI);
  await trimiteMesajBotului(CHAT, "-", OPTIUNI);
  await trimiteMesajBotului(CHAT, "nu", OPTIUNI);

  assert.equal(supabaseFals.randuri("abonamente").length, 0);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
  assert.match(ultimulMesaj().text, /Am anulat/);
});

test("abonamentul duplicat nu este creat a doua oară", async () => {
  for (let i = 0; i < 2; i++) {
    await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
    await trimiteMesajBotului(CHAT, "apa", OPTIUNI);
    await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);
    await trimiteMesajBotului(CHAT, "Tomis", OPTIUNI);
    await trimiteMesajBotului(CHAT, "-", OPTIUNI);
    await trimiteMesajBotului(CHAT, "da", OPTIUNI);
  }

  assert.equal(supabaseFals.randuri("abonamente").length, 1);
  assert.match(ultimulMesaj().text, /Ai deja un abonament identic activ/);
});

test("pas de conversație necunoscut resetează conversația", async () => {
  supabaseFals.tabele.telegram_conversatii.push({
    chat_id: CHAT,
    pas: "pas_inexistent",
    date: {},
  });

  await trimiteMesajBotului(CHAT, "orice", OPTIUNI);

  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
  assert.match(ultimulMesaj().text, /Am anulat/);
});

// ── Listare și dezabonare ──────────────────────────────────────────────────
test("/abonamente fără abonamente anunță lista goală", async () => {
  await trimiteMesajBotului(CHAT, "/abonamente", OPTIUNI);
  assert.match(ultimulMesaj().text, /Nu ai niciun abonament activ/);
});

test("/abonamente listează abonamentele active, cu județ și zonă", async () => {
  supabaseFals.tabele.abonamente.push(
    {
      id: "a1",
      serviciu: "apa",
      judet: null,
      localitate_interes: "constanta",
      strada_interes: "tomis",
      cartier_interes: "",
      tip_contact: "telegram",
      valoare_contact: `@${USER}`,
      activ: true,
      created_at: "2026-01-01",
    },
    {
      id: "a2",
      serviciu: "curent",
      judet: "Constanța",
      localitate_interes: "navodari",
      strada_interes: "",
      cartier_interes: "",
      tip_contact: "telegram",
      valoare_contact: `@${USER}`,
      activ: true,
      created_at: "2026-01-02",
    },
    {
      id: "a3",
      serviciu: "apa",
      judet: null,
      localitate_interes: "lumina",
      strada_interes: "",
      cartier_interes: "",
      tip_contact: "telegram",
      valoare_contact: `@${USER}`,
      activ: false,
      created_at: "2026-01-03",
    }
  );

  await trimiteMesajBotului(CHAT, "/abonamente", OPTIUNI);

  const text = ultimulMesaj().text;
  assert.match(text, /1\. 💧 Apă \(RAJA\) — Constanta, strada Tomis/);
  assert.match(text, /2\. ⚡ Energie electrică \(Constanța\) — Navodari, toată localitatea/);
  assert.doesNotMatch(text, /Lumina/);
});

test("/dezaboneaza dezactivează abonamentul ales prin număr", async () => {
  supabaseFals.tabele.abonamente.push({
    id: "a1",
    serviciu: "apa",
    judet: null,
    localitate_interes: "constanta",
    strada_interes: "",
    cartier_interes: "",
    tip_contact: "telegram",
    valoare_contact: `@${USER}`,
    activ: true,
    created_at: "2026-01-01",
  });

  await trimiteMesajBotului(CHAT, "/dezaboneaza", OPTIUNI);
  assert.equal(supabaseFals.randuri("telegram_conversatii")[0].pas, "dezaboneaza");

  await trimiteMesajBotului(CHAT, "1", OPTIUNI);

  assert.equal(supabaseFals.randuri("abonamente")[0].activ, false);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
  assert.match(ultimulMesaj().text, /Abonament dezactivat/);
});

test("număr invalid la dezabonare anulează, fără să atingă abonamentul", async () => {
  supabaseFals.tabele.abonamente.push({
    id: "a1",
    serviciu: "apa",
    judet: null,
    localitate_interes: "constanta",
    strada_interes: "",
    cartier_interes: "",
    tip_contact: "telegram",
    valoare_contact: `@${USER}`,
    activ: true,
    created_at: "2026-01-01",
  });

  await trimiteMesajBotului(CHAT, "/dezaboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "7", OPTIUNI);

  assert.equal(supabaseFals.randuri("abonamente")[0].activ, true);
  assert.match(ultimulMesaj().text, /Am anulat dezabonarea/);
});

// ── Utilizatori fără username ──────────────────────────────────────────────
test("fără @username, /aboneaza explică ce trebuie făcut", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", {});
  assert.match(ultimulMesaj().text, /Nu am găsit un @username/);
  assert.equal(supabaseFals.randuri("telegram_conversatii").length, 0);
});

test("fără @username, /abonamente și /dezaboneaza cer setarea profilului", async () => {
  await trimiteMesajBotului(CHAT, "/abonamente", {});
  assert.match(ultimulMesaj().text, /Setează un @username/);

  await trimiteMesajBotului(CHAT, "/dezaboneaza", {});
  assert.match(ultimulMesaj().text, /Setează un @username/);
});

// ── Protecția webhook-ului ─────────────────────────────────────────────────
test("cererea fără secretul corect este respinsă cu 401", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret-de-test";
  try {
    const { POST } = await import("../../app/api/telegram/route");
    const faraSecret = await POST(
      new Request("https://test.local/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update_id: 1, message: { chat: { id: CHAT }, text: "/start" } }),
      })
    );
    assert.equal(faraSecret.status, 401);

    const cuSecret = await POST(
      new Request("https://test.local/api/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "secret-de-test",
        },
        body: JSON.stringify({ update_id: 2, message: { chat: { id: CHAT }, text: "/start" } }),
      })
    );
    assert.equal(cuSecret.status, 200);
  } finally {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  }
});

test("update fără mesaj (ex. reacție) este ignorat, fără mesaje trimise", async () => {
  const { POST } = await import("../../app/api/telegram/route");
  const raspuns = await POST(
    new Request("https://test.local/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 3, message_reaction: { chat: { id: CHAT } } }),
    })
  );

  assert.equal(raspuns.status, 200);
  assert.equal(mesajeTrimise.length, 0);
});

// ── Căi de eroare ──────────────────────────────────────────────────────────
test("eroarea la salvarea abonamentului este anunțată, nu ascunsă", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "apa", OPTIUNI);
  await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);
  await trimiteMesajBotului(CHAT, "-", OPTIUNI);
  await trimiteMesajBotului(CHAT, "-", OPTIUNI);

  supabaseFals.erori.abonamente = "eroare simulată de bază de date";
  await trimiteMesajBotului(CHAT, "da", OPTIUNI);

  assert.equal(supabaseFals.randuri("abonamente").length, 0);
  assert.match(ultimulMesaj().text, /Nu am reușit să salvez abonamentul/);
});

test("eroarea la dezabonare este anunțată, iar abonamentul rămâne activ", async () => {
  supabaseFals.tabele.abonamente.push({
    id: "a1",
    serviciu: "apa",
    judet: null,
    localitate_interes: "constanta",
    strada_interes: "",
    cartier_interes: "",
    tip_contact: "telegram",
    valoare_contact: `@${USER}`,
    activ: true,
    created_at: "2026-01-01",
  });

  await trimiteMesajBotului(CHAT, "/dezaboneaza", OPTIUNI);
  supabaseFals.erori.abonamente = "eroare simulată de bază de date";
  await trimiteMesajBotului(CHAT, "1", OPTIUNI);

  assert.equal(supabaseFals.randuri("abonamente")[0].activ, true);
  assert.match(ultimulMesaj().text, /Nu am reușit să dezactivez abonamentul/);
});

// ── Mesaje: tastatura și textele exacte ────────────────────────────────────
test("mesajele fără butoane ascund tastatura anterioară", async () => {
  await trimiteMesajBotului(CHAT, "/start", OPTIUNI);
  assert.equal(ultimulMesaj().ascundeTastatura, true);
  assert.equal(ultimulMesaj().butoane, null);
});

test("fiecare mesaj al botului este trimis o singură dată", async () => {
  await trimiteMesajBotului(CHAT, "/aboneaza", OPTIUNI);
  await trimiteMesajBotului(CHAT, "apa", OPTIUNI);
  await trimiteMesajBotului(CHAT, "Constanța", OPTIUNI);

  assert.equal(mesajeTrimise.length, 3);
  assert.equal(new Set(texteleTrimise()).size, 3);
});
