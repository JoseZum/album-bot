import fs from 'fs';
import path from 'path';

import { stickerKey, type StickerRef } from '../catalog/world-cup.catalog';

export type StickerHistoryAction = 'add' | 'remove';

export type StickerHistoryEntry = {
  action: StickerHistoryAction;
  sticker: StickerRef;
  previousQuantity: number;
  currentQuantity: number;
  timestamp: string;
};

export type StickerQuantityChange = {
  sticker: StickerRef;
  previousQuantity: number;
  currentQuantity: number;
  changed: boolean;
};

type StoredCollection = {
  stickers: Record<string, number>;
  history: StickerHistoryEntry[];
};

type StoredData = {
  version: 1;
  collections: Record<string, StoredCollection>;
};

const createEmptyData = (): StoredData => ({
  version: 1,
  collections: {},
});

const createEmptyCollection = (): StoredCollection => ({
  stickers: {},
  history: [],
});

export class CollectionRepository {
  constructor(private readonly customFilePath?: string) {}

  getQuantity(ownerId: string, sticker: StickerRef): number {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);

    return collection.stickers[stickerKey(sticker)] ?? 0;
  }

  getStickerQuantities(ownerId: string): Record<string, number> {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);

    return { ...collection.stickers };
  }

  adjustQuantity(ownerId: string, sticker: StickerRef, delta: number): StickerQuantityChange {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);
    const key = stickerKey(sticker);
    const previousQuantity = collection.stickers[key] ?? 0;
    const currentQuantity = Math.max(previousQuantity + delta, 0);

    this.setStoredQuantity(collection, key, currentQuantity);
    this.writeData(data);

    return {
      sticker,
      previousQuantity,
      currentQuantity,
      changed: previousQuantity !== currentQuantity,
    };
  }

  recordHistory(ownerId: string, entry: StickerHistoryEntry): void {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);

    collection.history.push(entry);
    this.writeData(data);
  }

  undoLast(ownerId: string): StickerHistoryEntry | null {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);
    const entry = collection.history.pop();

    if (!entry) {
      return null;
    }

    this.setStoredQuantity(collection, stickerKey(entry.sticker), entry.previousQuantity);
    this.writeData(data);

    return entry;
  }

  private readData(): StoredData {
    const filePath = this.getFilePath();

    if (!fs.existsSync(filePath)) {
      return createEmptyData();
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.trim()) {
      return createEmptyData();
    }

    return JSON.parse(content) as StoredData;
  }

  private writeData(data: StoredData): void {
    const filePath = this.getFilePath();

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  private getFilePath(): string {
    if (this.customFilePath) {
      return path.resolve(this.customFilePath);
    }

    return process.env.COLLECTION_DATA_PATH
      ? path.resolve(process.env.COLLECTION_DATA_PATH)
      : path.resolve(process.cwd(), 'data', 'collection.json');
  }

  private getOrCreateCollection(data: StoredData, ownerId: string): StoredCollection {
    const normalizedOwnerId = ownerId.trim() || 'default';

    data.collections[normalizedOwnerId] ??= createEmptyCollection();

    return data.collections[normalizedOwnerId];
  }

  private setStoredQuantity(collection: StoredCollection, key: string, quantity: number): void {
    if (quantity <= 0) {
      delete collection.stickers[key];
      return;
    }

    collection.stickers[key] = quantity;
  }
}

export const collectionRepository = new CollectionRepository();
