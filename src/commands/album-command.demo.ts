import { Album } from './album';
import { AddCommand } from './add-command';
import { RemoveCommand } from './remove-command';

export const runAlbumCommandDemo = (): void => {
  const album = new Album();

  const add = new AddCommand(album, 'ARG 4');
  add.execute();

  const remove = new RemoveCommand(album, 'ARG 4');
  remove.execute();

  album.list();
};