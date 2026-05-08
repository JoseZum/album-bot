import { Album } from './album';
import { Command } from './command';

export class AddCommand implements Command {
  constructor(
    private readonly album: Album,
    private readonly sticker: string,
  ) {}

  execute(): void {
    this.album.add(this.sticker);
  }
}