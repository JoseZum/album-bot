import { Request, Response } from 'express';

import { stickerBotService } from '../services/sticker-bot.service';

const postBotMessage = (req: Request, res: Response): void => {
  const text = typeof req.body.text === 'string' ? req.body.text : '';
  const ownerId = req.body.ownerId === undefined ? 'default' : String(req.body.ownerId);

  if (!text.trim()) {
    res.status(400).json({
      success: false,
      message: 'text is required',
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: stickerBotService.handleMessage(text, ownerId),
  });
};

export { postBotMessage };
