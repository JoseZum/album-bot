import { NextFunction, Request, Response } from 'express';

import { t } from '../i18n/bot.i18n';
import { stickerBotService } from '../services/sticker-bot.service';
import { telegramService } from '../services/telegram.service';
import { checkRateLimit } from '../utils/rate-limiter';

type TelegramMessage = {
  text?: string;
  from?: TelegramUser;
  chat?: {
    id?: number | string;
  };
};

type TelegramUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: {
    chat?: {
      id?: number | string;
    };
  };
};

type TelegramWebhookBody = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const safeSend = async <T>(fn: () => Promise<T>, label: string): Promise<T | null> => {
  try {
    return await fn();
  } catch (error: unknown) {
    const err = error as { message?: string; details?: unknown };
    console.error(`[webhook] outbound send failed (${label}):`, err.message, err.details ?? '');
    return null;
  }
};

const postTelegramWebhook = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  const body = req.body as TelegramWebhookBody;

  if (body.callback_query) {
    const callbackQuery = body.callback_query;
    const chatId = callbackQuery.message?.chat?.id ?? callbackQuery.from?.id;

    if (!callbackQuery.data || chatId === undefined) {
      res.status(200).json({ ok: true });
      return;
    }

    const callbackData = callbackQuery.data;
    const callbackChatId = chatId;

    res.status(200).json({ ok: true });

    (async () => {
      try {
        if (!checkRateLimit(String(callbackChatId))) {
          await safeSend(
            () => telegramService.sendMessage(callbackChatId, t('es', 'rateLimited')),
            'rateLimited',
          );
          return;
        }

        await stickerBotService.registerUser({
          ownerId: String(callbackChatId),
          username: callbackQuery.from?.username,
          firstName: callbackQuery.from?.first_name,
          lastName: callbackQuery.from?.last_name,
        });

        const result = await stickerBotService.handleCallbackData(callbackData, String(callbackChatId));
        await safeSend(
          () => telegramService.answerCallbackQuery(callbackQuery.id),
          'answerCallbackQuery',
        );
        await safeSend(
          () => telegramService.sendMessage(callbackChatId, result.reply, {
            replyMarkup: result.replyMarkup,
            parseMode: result.parseMode,
          }),
          'sendMessage/callback',
        );

        for (const outboundMessage of result.outboundMessages ?? []) {
          await safeSend(
            () => telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
              replyMarkup: outboundMessage.replyMarkup,
              parseMode: outboundMessage.parseMode,
            }),
            `outbound/${outboundMessage.chatId}`,
          );
        }
      } catch (error: unknown) {
        const err = error as { message?: string; stack?: string };
        console.error('[webhook async]', err.message, err.stack ?? '');
      }
    })();

    return;
  }

  const message = body.message ?? body.edited_message;
  const chatId = message?.chat?.id;

  if (!message?.text || chatId === undefined) {
    res.status(200).json({ ok: true });
    return;
  }

  const messageText = message.text;
  const messageChatId = chatId;

  res.status(200).json({ ok: true });

  (async () => {
    try {
      if (!checkRateLimit(String(messageChatId))) {
        await safeSend(
          () => telegramService.sendMessage(messageChatId, t('es', 'rateLimited')),
          'rateLimited',
        );
        return;
      }

      await stickerBotService.registerUser({
        ownerId: String(messageChatId),
        username: message.from?.username,
        firstName: message.from?.first_name,
        lastName: message.from?.last_name,
      });

      const result = await stickerBotService.handleMessage(messageText, String(messageChatId));
      await safeSend(
        () => telegramService.sendMessage(messageChatId, result.reply, {
          replyMarkup: result.replyMarkup,
          parseMode: result.parseMode,
        }),
        'sendMessage/message',
      );

      for (const outboundMessage of result.outboundMessages ?? []) {
        await safeSend(
          () => telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
            replyMarkup: outboundMessage.replyMarkup,
            parseMode: outboundMessage.parseMode,
          }),
          `outbound/${outboundMessage.chatId}`,
        );
      }
    } catch (error: unknown) {
      const err = error as { message?: string; stack?: string };
      console.error('[webhook async]', err.message, err.stack ?? '');
    }
  })();
};

export { postTelegramWebhook };
