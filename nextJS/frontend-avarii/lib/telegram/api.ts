// Comunicarea cu API-ul Telegram: trimiterea de mesaje (cu sau fără tastatură).

import { cleanEnv } from "@/lib/env";

const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);

export async function trimiteMesaj(
  chatId: number,
  text: string,
  keyboard?: string[][]
): Promise<void> {
  if (!botToken) return;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (keyboard) {
    body.reply_markup = {
      keyboard: keyboard.map((rand) => rand.map((buton) => ({ text: buton }))),
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } else {
    body.reply_markup = { remove_keyboard: true };
  }
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("Eroare trimitere mesaj Telegram:", err);
  }
}
