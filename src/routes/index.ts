import { Router } from 'express';

import albumsRoutes from './albums.routes';
import botRoutes from './bot.routes';
import telegramRoutes from './telegram.routes';

const router = Router();

router.use('/albums', albumsRoutes);
router.use('/bot', botRoutes);
router.use('/telegram', telegramRoutes);

export default router;
