import { getAlbumsFromRepository } from '../repositories/albums.repository';

const listAlbums = () => ({
  success: true,
  data: getAlbumsFromRepository(),
});

export { listAlbums };