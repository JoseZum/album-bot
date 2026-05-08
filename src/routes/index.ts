import { Router } from 'express';

import albumsRoutes from './albums.routes';

const router = Router();

router.use('/albums', albumsRoutes);

export default router;