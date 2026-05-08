import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

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

export type StoredProfile = {
  ownerId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  updatedAt: string;
};

export type ShareRequestStatus = 'pending' | 'accepted' | 'declined';

export type ShareRequest = {
  id: string;
  fromOwnerId: string;
  toOwnerId: string;
  targetUsername: string;
  collectionId: string;
  status: ShareRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

type StoredCollection = {
  stickers: Record<string, number>;
  history: StickerHistoryEntry[];
};

type StoredData = {
  version: 1;
  collections: Record<string, StoredCollection>;
  ownerCollections: Record<string, string>;
  profiles: Record<string, StoredProfile>;
  shareRequests: Record<string, ShareRequest>;
};

const createEmptyData = (): StoredData => ({
  version: 1,
  collections: {},
  ownerCollections: {},
  profiles: {},
  shareRequests: {},
});

const createEmptyCollection = (): StoredCollection => ({
  stickers: {},
  history: [],
});

export class CollectionRepository {
  constructor(private readonly customFilePath?: string) {}

  registerProfile(profile: {
    ownerId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): StoredProfile {
    const data = this.readData();
    const ownerId = this.normalizeOwnerId(profile.ownerId);
    const username = profile.username?.replace(/^@/, '').toLowerCase();
    const previousProfile = data.profiles[ownerId];
    const displayName = username
      ? `@${username}`
      : [profile.firstName, profile.lastName].filter(Boolean).join(' ') || ownerId;
    const storedProfile: StoredProfile = {
      ownerId,
      username: username ?? previousProfile?.username,
      firstName: profile.firstName ?? previousProfile?.firstName,
      lastName: profile.lastName ?? previousProfile?.lastName,
      displayName,
      updatedAt: new Date().toISOString(),
    };

    data.profiles[ownerId] = storedProfile;
    this.getOrCreateCollection(data, ownerId);
    this.writeData(data);

    return storedProfile;
  }

  getProfile(ownerId: string): StoredProfile | undefined {
    const data = this.readData();

    return data.profiles[this.normalizeOwnerId(ownerId)];
  }

  findProfileByUsername(username: string): StoredProfile | undefined {
    const normalizedUsername = username.replace(/^@/, '').toLowerCase();
    const data = this.readData();

    return Object.values(data.profiles).find((profile) => profile.username === normalizedUsername);
  }

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

  createShareRequest(
    fromOwnerId: string,
    targetUsername: string,
  ): { request?: ShareRequest; error?: string } {
    const data = this.readData();
    const normalizedFromOwnerId = this.normalizeOwnerId(fromOwnerId);
    const normalizedTargetUsername = targetUsername.replace(/^@/, '').toLowerCase();
    const fromProfile = data.profiles[normalizedFromOwnerId];
    const toProfile = Object.values(data.profiles).find(
      (profile) => profile.username === normalizedTargetUsername,
    );

    if (!toProfile) {
      return {
        error: `No conozco a @${normalizedTargetUsername}. Esa persona debe abrir el bot y mandar /start primero.`,
      };
    }

    if (toProfile.ownerId === normalizedFromOwnerId) {
      return {
        error: 'No puedes compartir el album contigo mismo.',
      };
    }

    const collectionId = this.getCollectionId(data, normalizedFromOwnerId);
    const targetCollectionId = this.getCollectionId(data, toProfile.ownerId);

    if (collectionId === targetCollectionId) {
      return {
        error: `Ya compartes album con @${normalizedTargetUsername}.`,
      };
    }

    const existingRequest = Object.values(data.shareRequests).find(
      (request) =>
        request.status === 'pending'
        && request.fromOwnerId === normalizedFromOwnerId
        && request.toOwnerId === toProfile.ownerId,
    );

    if (existingRequest) {
      return { request: existingRequest };
    }

    const request: ShareRequest = {
      id: randomUUID(),
      fromOwnerId: normalizedFromOwnerId,
      toOwnerId: toProfile.ownerId,
      targetUsername: normalizedTargetUsername,
      collectionId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    data.shareRequests[request.id] = request;
    this.getOrCreateCollection(data, normalizedFromOwnerId);
    this.getOrCreateCollection(data, toProfile.ownerId);

    if (!fromProfile) {
      data.profiles[normalizedFromOwnerId] = {
        ownerId: normalizedFromOwnerId,
        displayName: normalizedFromOwnerId,
        updatedAt: new Date().toISOString(),
      };
    }

    this.writeData(data);

    return { request };
  }

  acceptShareRequest(
    requestId: string,
    responderOwnerId: string,
  ): { request?: ShareRequest; fromProfile?: StoredProfile; error?: string } {
    const data = this.readData();
    const request = data.shareRequests[requestId];
    const normalizedResponderOwnerId = this.normalizeOwnerId(responderOwnerId);

    if (!request || request.toOwnerId !== normalizedResponderOwnerId) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    if (request.status !== 'pending') {
      return { error: 'Esta solicitud ya fue respondida.' };
    }

    const targetCollectionId = this.getCollectionId(data, request.toOwnerId);
    const sourceCollection = this.getOrCreateCollectionById(data, request.collectionId);
    const targetCollection = this.getOrCreateCollectionById(data, targetCollectionId);

    for (const [key, quantity] of Object.entries(targetCollection.stickers)) {
      sourceCollection.stickers[key] = Math.max(sourceCollection.stickers[key] ?? 0, quantity);
    }

    data.ownerCollections[request.toOwnerId] = request.collectionId;
    request.status = 'accepted';
    request.respondedAt = new Date().toISOString();
    this.writeData(data);

    return {
      request,
      fromProfile: data.profiles[request.fromOwnerId],
    };
  }

  declineShareRequest(
    requestId: string,
    responderOwnerId: string,
  ): { request?: ShareRequest; fromProfile?: StoredProfile; error?: string } {
    const data = this.readData();
    const request = data.shareRequests[requestId];
    const normalizedResponderOwnerId = this.normalizeOwnerId(responderOwnerId);

    if (!request || request.toOwnerId !== normalizedResponderOwnerId) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    if (request.status !== 'pending') {
      return { error: 'Esta solicitud ya fue respondida.' };
    }

    request.status = 'declined';
    request.respondedAt = new Date().toISOString();
    this.writeData(data);

    return {
      request,
      fromProfile: data.profiles[request.fromOwnerId],
    };
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

    return this.normalizeData(JSON.parse(content) as Partial<StoredData>);
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
    const collectionId = this.getCollectionId(data, ownerId);

    return this.getOrCreateCollectionById(data, collectionId);
  }

  private getOrCreateCollectionById(data: StoredData, collectionId: string): StoredCollection {
    data.collections[collectionId] ??= createEmptyCollection();

    return data.collections[collectionId];
  }

  private getCollectionId(data: StoredData, ownerId: string): string {
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);

    data.ownerCollections[normalizedOwnerId] ??= normalizedOwnerId;

    return data.ownerCollections[normalizedOwnerId];
  }

  private normalizeOwnerId(ownerId: string): string {
    return ownerId.trim() || 'default';
  }

  private normalizeData(data: Partial<StoredData>): StoredData {
    return {
      version: 1,
      collections: data.collections ?? {},
      ownerCollections: data.ownerCollections ?? {},
      profiles: data.profiles ?? {},
      shareRequests: data.shareRequests ?? {},
    };
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
