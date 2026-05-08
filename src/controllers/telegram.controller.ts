import { NextFunction, Request, Response } from 'express';

import { stickerBotService } from '../services/sticker-bot.service';
import { telegramService } from '../services/telegram.service';

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

const postTelegramWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
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

      await stickerBotService.registerUser({
        ownerId: String(chatId),
        username: callbackQuery.from?.username,
        firstName: callbackQuery.from?.first_name,
        lastName: callbackQuery.from?.last_name,
      });

      const result = await stickerBotService.handleCallbackData(callbackQuery.data, String(chatId));
      await telegramService.answerCallbackQuery(callbackQuery.id);
      const sendResult = await telegramService.sendMessage(chatId, result.reply, {
        replyMarkup: result.replyMarkup,
      });
      const outboundResults = [];

      for (const outboundMessage of result.outboundMessages ?? []) {
        outboundResults.push(
          await telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
            replyMarkup: outboundMessage.replyMarkup,
          }),
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

    await stickerBotService.registerUser({
      ownerId: String(chatId),
      username: message.from?.username,
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
    });

    const result = await stickerBotService.handleMessage(message.text, String(chatId));
    const sendResult = await telegramService.sendMessage(chatId, result.reply, {
      replyMarkup: result.replyMarkup,
    });
    const outboundResults = [];

    for (const outboundMessage of result.outboundMessages ?? []) {
      outboundResults.push(
        await telegramService.sendMessage(outboundMessage.chatId, outboundMessage.text, {
          replyMarkup: outboundMessage.replyMarkup,
        }),
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
  } catch (error) {
    next(error);
  }
};

export { postTelegramWebhook };
