export type TelegramSendResult = {
  sent: boolean;
  reason?: string;
  telegramResponse?: unknown;
  telegramResponses?: unknown[];
};

const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

const findSplitIndex = (text: string, maxLength: number): number => {
  for (const separator of [', ', ' ']) {
    const index = text.lastIndexOf(separator, maxLength);

    if (index >= Math.floor(maxLength / 2)) {
      return index + separator.length;
    }
  }

  return maxLength;
};

const splitOversizedPart = (text: string, maxLength: number): string[] => {
  const normalized = text.trim();

  if (normalized.length <= maxLength) {
    return normalized.length > 0 ? [normalized] : [];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const splitAt = findSplitIndex(remaining, maxLength);
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};

const splitTelegramMessage = (text: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';

  const flushCurrent = (): void => {
    if (current.length > 0) {
      chunks.push(current);
      current = '';
    }
  };

  const appendSegment = (segment: string): void => {
    if (segment.length <= maxLength) {
      const candidate = current.length === 0
        ? segment
        : `${current}\n${segment}`;

      if (candidate.length <= maxLength) {
        current = candidate;
        return;
      }

      flushCurrent();
      current = segment;
      return;
    }

    flushCurrent();

    for (const piece of splitOversizedPart(segment, maxLength)) {
      chunks.push(piece);
    }
  };

  for (const line of text.split('\n')) {
    appendSegment(line);
  }

  flushCurrent();

  return chunks;
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

    const chunks = splitTelegramMessage(text);
    const payloads: unknown[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunks[index],
          ...(options.replyMarkup && index === chunks.length - 1 ? { reply_markup: options.replyMarkup } : {}),
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

      payloads.push(payload);
    }

    return {
      sent: true,
      telegramResponse: payloads[payloads.length - 1],
      ...(payloads.length > 1 ? { telegramResponses: payloads } : {}),
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
