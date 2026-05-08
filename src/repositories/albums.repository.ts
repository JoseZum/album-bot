type Album = {
  id: number;
  title: string;
};

const albums: Album[] = [
  { id: 1, title: 'First album' },
  { id: 2, title: 'Second album' },
];

const getAlbumsFromRepository = (): Album[] => albums;

export { getAlbumsFromRepository, type Album };