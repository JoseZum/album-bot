import { Router } from 'express';

import { postBotMessage } from '../controllers/bot.controller';

const router = Router();

router.post('/message', postBotMessage);

export default router;
