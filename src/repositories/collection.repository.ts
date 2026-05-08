import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { getAlbumTemplate } from '../catalog/album-templates.catalog';
import { stickerKey, type StickerRef } from '../catalog/world-cup.catalog';
import type { BotLanguage } from '../i18n/bot.i18n';

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
  language?: BotLanguage;
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

export type CollectionSummary = {
  id: string;
  albumSlug: string;
  name: string;
  ownerId: string;
  memberCount: number;
  isActive: boolean;
};

type StoredCollection = {
  albumSlug: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: string;
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

const DEFAULT_ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const createEmptyCollection = (options: {
  albumSlug: string;
  name: string;
  ownerId: string;
  members?: string[];
}): StoredCollection => ({
  albumSlug: options.albumSlug,
  name: options.name,
  ownerId: options.ownerId,
  members: options.members ?? [options.ownerId],
  createdAt: new Date().toISOString(),
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
    language?: BotLanguage;
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
      language: profile.language ?? previousProfile?.language,
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

  setLanguage(ownerId: string, language: BotLanguage): StoredProfile {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const previousProfile = data.profiles[normalizedOwnerId];
    const profile: StoredProfile = {
      ownerId: normalizedOwnerId,
      username: previousProfile?.username,
      firstName: previousProfile?.firstName,
      lastName: previousProfile?.lastName,
      displayName: previousProfile?.displayName ?? normalizedOwnerId,
      language,
      updatedAt: new Date().toISOString(),
    };

    data.profiles[normalizedOwnerId] = profile;
    this.getOrCreateCollection(data, normalizedOwnerId);
    this.writeData(data);

    return profile;
  }

  getQuantity(ownerId: string, sticker: StickerRef): number {
    const data = this.readData();
    const collection = this.getOrCreateCollection(data, ownerId);

    return collection.stickers[stickerKey(sticker)] ?? 0;
  }

  hasActiveAlbum(ownerId: string): boolean {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = data.ownerCollections[normalizedOwnerId];

    return Boolean(collectionId && data.collections[collectionId]);
  }

  listAlbums(ownerId: string): CollectionSummary[] {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const activeCollectionId = data.ownerCollections[normalizedOwnerId];

    return Object.entries(data.collections)
      .filter(([, collection]) => collection.members.includes(normalizedOwnerId))
      .map(([id, collection]) => ({
        id,
        albumSlug: collection.albumSlug,
        name: collection.name,
        ownerId: collection.ownerId,
        memberCount: collection.members.length,
        isActive: id === activeCollectionId,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getActiveAlbum(ownerId: string): CollectionSummary | null {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = data.ownerCollections[normalizedOwnerId];
    const collection = collectionId ? data.collections[collectionId] : undefined;

    if (!collection) {
      return null;
    }

    return {
      id: collectionId,
      albumSlug: collection.albumSlug,
      name: collection.name,
      ownerId: collection.ownerId,
      memberCount: collection.members.length,
      isActive: true,
    };
  }

  createAlbum(ownerId: string, albumSlug: string): CollectionSummary | null {
    const albumTemplate = getAlbumTemplate(albumSlug);

    if (!albumTemplate) {
      return null;
    }

    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = randomUUID();

    data.collections[collectionId] = createEmptyCollection({
      albumSlug: albumTemplate.slug,
      name: albumTemplate.name,
      ownerId: normalizedOwnerId,
    });
    data.ownerCollections[normalizedOwnerId] = collectionId;
    this.writeData(data);

    return {
      id: collectionId,
      albumSlug: albumTemplate.slug,
      name: albumTemplate.name,
      ownerId: normalizedOwnerId,
      memberCount: 1,
      isActive: true,
    };
  }

  setActiveAlbum(ownerId: string, collectionId: string): CollectionSummary | null {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];

    if (!collection || !collection.members.includes(normalizedOwnerId)) {
      return null;
    }

    data.ownerCollections[normalizedOwnerId] = collectionId;
    this.writeData(data);

    return {
      id: collectionId,
      albumSlug: collection.albumSlug,
      name: collection.name,
      ownerId: collection.ownerId,
      memberCount: collection.members.length,
      isActive: true,
    };
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

    const collectionId = data.ownerCollections[normalizedFromOwnerId];
    const targetCollectionId = data.ownerCollections[toProfile.ownerId];

    if (!collectionId || !data.collections[collectionId]) {
      return {
        error: 'No hay album activo.',
      };
    }

    if (targetCollectionId && collectionId === targetCollectionId) {
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

    const sourceCollection = this.getOrCreateCollectionById(data, request.collectionId);
    const targetCollectionId = data.ownerCollections[request.toOwnerId];
    const targetCollection = targetCollectionId
      ? data.collections[targetCollectionId]
      : undefined;

    if (targetCollection) {
      for (const [key, quantity] of Object.entries(targetCollection.stickers)) {
        sourceCollection.stickers[key] = Math.max(sourceCollection.stickers[key] ?? 0, quantity);
      }
    }

    if (!sourceCollection.members.includes(request.toOwnerId)) {
      sourceCollection.members.push(request.toOwnerId);
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
    const albumTemplate = getAlbumTemplate(DEFAULT_ALBUM_SLUG);

    data.collections[collectionId] ??= createEmptyCollection({
      albumSlug: DEFAULT_ALBUM_SLUG,
      name: albumTemplate?.name ?? 'Panini FIFA World Cup 2026',
      ownerId: collectionId,
    });

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
    const normalizedData: StoredData = {
      version: 1,
      collections: data.collections ?? {},
      ownerCollections: data.ownerCollections ?? {},
      profiles: data.profiles ?? {},
      shareRequests: data.shareRequests ?? {},
    };

    const albumTemplate = getAlbumTemplate(DEFAULT_ALBUM_SLUG);

    for (const [collectionId, collection] of Object.entries(normalizedData.collections)) {
      collection.albumSlug ??= DEFAULT_ALBUM_SLUG;
      collection.name ??= albumTemplate?.name ?? 'Panini FIFA World Cup 2026';
      collection.ownerId ??= collectionId;
      collection.members ??= [collection.ownerId];
      collection.createdAt ??= new Date().toISOString();
      collection.stickers ??= {};
      collection.history ??= [];
    }

    for (const [ownerId, collectionId] of Object.entries(normalizedData.ownerCollections)) {
      const collection = normalizedData.collections[collectionId];

      if (collection && !collection.members.includes(ownerId)) {
        collection.members.push(ownerId);
      }
    }

    return normalizedData;
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
