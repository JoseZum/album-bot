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
  try {
    const body = req.body as TelegramWebhookBody;

    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const chatId = callbackQuery.message?.chat?.id ?? callbackQuery.from?.id;

      if (!callbackQuery.data || chatId === undefined) {
        res.status(200).json({ ok: true });
        return;
      }

      if (!checkRateLimit(String(chatId))) {
        await safeSend(
          () => telegramService.sendMessage(chatId, t('es', 'rateLimited')),
          'rateLimited',
        );
        res.status(200).json({ ok: true });
        return;
      }

      await stickerBotService.registerUser({
        ownerId: String(chatId),
        username: callbackQuery.from?.username,
        firstName: callbackQuery.from?.first_name,
        lastName: callbackQuery.from?.last_name,
      });

      const result = await stickerBotService.handleCallbackData(callbackQuery.data, String(chatId));
      await safeSend(
        () => telegramService.answerCallbackQuery(callbackQuery.id),
        'answerCallbackQuery',
      );
      const sendResult = await safeSend(
        () => telegramService.sendMessage(chatId, result.reply, {
          replyMarkup: result.replyMarkup,
          parseMode: result.parseMode,
        }),
        'sendMessage/callback',
      );
      const outboundResults = [];

      for (const outboundMessage of result.outboundMessages ?? []) {
        outboundResults.push(
          await safeSend(
            () => telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
              replyMarkup: outboundMessage.replyMarkup,
              parseMode: outboundMessage.parseMode,
            }),
            `outbound/${outboundMessage.chatId}`,
          ),
        );
      }

      res.status(200).json({
        ok: true,
        data: {
          reply: result.reply,
          telegram: sendResult,
          outbound: outboundResults,
        },
      });
      return;
    }

    const message = body.message ?? body.edited_message;
    const chatId = message?.chat?.id;

    if (!message?.text || chatId === undefined) {
      res.status(200).json({ ok: true });
      return;
    }

    if (!checkRateLimit(String(chatId))) {
      await safeSend(
        () => telegramService.sendMessage(chatId, t('es', 'rateLimited')),
        'rateLimited',
      );
      res.status(200).json({ ok: true });
      return;
    }

    await stickerBotService.registerUser({
      ownerId: String(chatId),
      username: message.from?.username,
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
    });

    const result = await stickerBotService.handleMessage(message.text, String(chatId));
    const sendResult = await safeSend(
      () => telegramService.sendMessage(chatId, result.reply, {
        replyMarkup: result.replyMarkup,
        parseMode: result.parseMode,
      }),
      'sendMessage/message',
    );
    const outboundResults = [];

    for (const outboundMessage of result.outboundMessages ?? []) {
      outboundResults.push(
        await safeSend(
          () => telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
            replyMarkup: outboundMessage.replyMarkup,
            parseMode: outboundMessage.parseMode,
          }),
          `outbound/${outboundMessage.chatId}`,
        ),
      );
    }

    res.status(200).json({
      ok: true,
      data: {
        reply: result.reply,
        telegram: sendResult,
        outbound: outboundResults,
      },
    });
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string };
    console.error('[webhook] unexpected processing error:', err.message, err.stack ?? '');
    res.status(200).json({ ok: true });
  }
};

export { postTelegramWebhook };
