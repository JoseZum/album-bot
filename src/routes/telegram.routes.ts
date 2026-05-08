import { Router } from 'express';

import { postTelegramWebhook } from '../controllers/telegram.controller';

const router = Router();

router.post('/webhook', postTelegramWebhook);

export default router;
