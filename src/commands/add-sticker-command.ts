import type { StickerRef } from '../catalog/world-cup.catalog';
import type { CollectionRepository } from '../repositories/collection.repository';
import type { ReversibleStickerCommand, StickerCommandResult } from './sticker-command';

export class AddStickerCommand implements ReversibleStickerCommand {
  constructor(
    private readonly collectionRepository: CollectionRepository,
    private readonly ownerId: string,
    private readonly sticker: StickerRef,
  ) {}

  execute(): StickerCommandResult {
    const change = this.collectionRepository.adjustQuantity(this.ownerId, this.sticker, 1);

    return {
      action: 'add',
      ...change,
    };
  }

  undo(): StickerCommandResult {
    const change = this.collectionRepository.adjustQuantity(this.ownerId, this.sticker, -1);

    return {
      action: 'remove',
      ...change,
    };
  }
}
