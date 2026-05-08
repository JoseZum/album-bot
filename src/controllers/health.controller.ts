import { Request, Response } from 'express';

import { healthCheck } from '../services/health.service';

const getHealth = (req: Request, res: Response): void => {
  res.status(200).json(healthCheck());
};

export { getHealth };