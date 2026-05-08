export type TelegramSendResult = {
  sent: boolean;
  reason?: string;
  telegramResponse?: unknown;
};

export class TelegramService {
  async sendMessage(chatId: number | string, text: string): Promise<TelegramSendResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return {
        sent: false,
        reason: 'TELEGRAM_BOT_TOKEN is not configured',
      };
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(`Telegram sendMessage failed with status ${response.status}`);
      (error as { statusCode?: number; details?: unknown }).statusCode = 502;
      (error as { details?: unknown }).details = payload;
      throw error;
    }

    return {
      sent: true,
      telegramResponse: payload,
    };
  }
}

export const telegramService = new TelegramService();
