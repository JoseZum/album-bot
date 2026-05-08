import { Album } from './album';
import { Command } from './command';

export class RemoveCommand implements Command {
  constructor(
    private readonly album: Album,
    private readonly sticker: string,
  ) {}

  execute(): void {
    this.album.remove(this.sticker);
  }
}