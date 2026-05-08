import { NextFunction, Request, Response } from 'express';

import { stickerBotService } from '../services/sticker-bot.service';
import { telegramService } from '../services/telegram.service';

type TelegramMessage = {
  text?: string;
  chat?: {
    id?: number | string;
  };
};

type TelegramWebhookBody = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

const postTelegramWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as TelegramWebhookBody;
    const message = body.message ?? body.edited_message;
    const chatId = message?.chat?.id;

    if (!message?.text || chatId === undefined) {
      res.status(200).json({ ok: true });
      return;
    }

    const result = stickerBotService.handleMessage(message.text, String(chatId));
    const sendResult = await telegramService.sendMessage(chatId, result.reply);

    res.status(200).json({
      ok: true,
      data: {
        reply: result.reply,
        telegram: sendResult,
      },
    });
  } catch (error) {
    next(error);
  }
};

export { postTelegramWebhook };
