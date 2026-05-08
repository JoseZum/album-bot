import { Request, Response } from 'express';

import { listAlbums } from '../services/albums.service';

const getAlbums = (req: Request, res: Response): void => {
  res.status(200).json(listAlbums());
};

export { getAlbums };