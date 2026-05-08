import { Router } from 'express';

import botRoutes from './bot.routes';
import telegramRoutes from './telegram.routes';

const router = Router();

router.use('/bot', botRoutes);
router.use('/telegram', telegramRoutes);

export default router;
