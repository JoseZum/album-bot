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

  stickerBotService.registerUser({
    ownerId,
    username: typeof req.body.username === 'string' ? req.body.username : undefined,
    firstName: typeof req.body.firstName === 'string' ? req.body.firstName : undefined,
    lastName: typeof req.body.lastName === 'string' ? req.body.lastName : undefined,
  });

  res.status(200).json({
    success: true,
    data: stickerBotService.handleMessage(text, ownerId),
  });
};

export { postBotMessage };
