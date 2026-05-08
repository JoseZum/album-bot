import { WORLD_CUP_CATALOG } from '../catalog/world-cup.catalog';

type AlbumCountry = {
  code: string;
  name: string;
  totalStickers: number;
};

const getAlbumsFromRepository = (): AlbumCountry[] =>
  WORLD_CUP_CATALOG.map((country) => ({
    code: country.code,
    name: country.name,
    totalStickers: country.totalStickers,
  }));

export { getAlbumsFromRepository, type AlbumCountry };
