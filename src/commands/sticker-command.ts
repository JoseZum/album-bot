import type { StickerRef } from '../catalog/world-cup.catalog';
import type { StickerHistoryAction } from '../repositories/collection.repository';

export type StickerCommandResult = {
  action: StickerHistoryAction;
  sticker: StickerRef;
  previousQuantity: number;
  currentQuantity: number;
  changed: boolean;
};

export interface ReversibleStickerCommand {
  execute(): Promise<StickerCommandResult>;
  undo(): Promise<StickerCommandResult>;
}
