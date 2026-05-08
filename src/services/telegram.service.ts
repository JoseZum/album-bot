export type TelegramSendResult = {
  sent: boolean;
  reason?: string;
  telegramResponse?: unknown;
};

export class TelegramService {
  async sendMessage(
    chatId: number | string,
    text: string,
    options: { replyMarkup?: unknown; parseMode?: 'HTML' } = {},
  ): Promise<TelegramSendResult> {
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
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
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

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<TelegramSendResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return {
        sent: false,
        reason: 'TELEGRAM_BOT_TOKEN is not configured',
      };
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(`Telegram answerCallbackQuery failed with status ${response.status}`);
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
