import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { getAlbumTemplate } from '../catalog/album-templates.catalog';
import {
  WORLD_CUP_CATALOG,
  formatSticker,
  getAllStickerRefs,
  isKnownSticker,
  stickerKey,
  type StickerRef,
} from '../catalog/world-cup.catalog';
import type { BotLanguage } from '../i18n/bot.i18n';
import {
  tradeSelectorMatchesSticker,
  type MarketplaceSearch,
  type TradeOffer,
  type TradePair,
  type TradeSelector,
} from '../trades/trade.types';

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
  ownerDisplayName?: string;
  memberCount: number;
  isActive: boolean;
  isShared: boolean;
};

export type CollectionSnapshot = {
  album: CollectionSummary;
  stickerQuantities: Record<string, number>;
};

type StoredCollection = {
  albumSlug: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: string;
  deletedAt?: string;
  stickers: Record<string, number>;
  history: StickerHistoryEntry[];
};

type StoredData = {
  version: 2;
  collections: Record<string, StoredCollection>;
  ownerCollections: Record<string, string>;
  profiles: Record<string, StoredProfile>;
  shareRequests: Record<string, ShareRequest>;
  tradeOffers: Record<string, TradeOffer>;
  tradeOfferSequence: number;
};

const createEmptyData = (): StoredData => ({
  version: 2,
  collections: {},
  ownerCollections: {},
  profiles: {},
  shareRequests: {},
  tradeOffers: {},
  tradeOfferSequence: 0,
});

const DEFAULT_ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const createEmptyCollection = (options: {
  albumSlug: string;
  name: string;
  ownerId: string;
  members?: string[];
  createdAt?: string;
  deletedAt?: string;
  stickers?: Record<string, number>;
  history?: StickerHistoryEntry[];
}): StoredCollection => ({
  albumSlug: options.albumSlug,
  name: options.name,
  ownerId: options.ownerId,
  members: options.members ?? [options.ownerId],
  createdAt: options.createdAt ?? new Date().toISOString(),
  deletedAt: options.deletedAt,
  stickers: options.stickers ?? {},
  history: options.history ?? [],
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
    this.writeData(data);

    return profile;
  }

  getQuantity(ownerId: string, sticker: StickerRef): number {
    const data = this.readData();
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      throw new Error('No hay album activo.');
    }

    return activeCollection.collection.stickers[stickerKey(sticker)] ?? 0;
  }

  hasActiveAlbum(ownerId: string): boolean {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = data.ownerCollections[normalizedOwnerId];

    const collection = collectionId ? data.collections[collectionId] : undefined;

    return Boolean(
      collection
      && !collection.deletedAt
      && collection.members.includes(normalizedOwnerId),
    );
  }

  listAlbums(ownerId: string): CollectionSummary[] {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const activeCollectionId = data.ownerCollections[normalizedOwnerId];

    return Object.entries(data.collections)
      .filter(([, collection]) =>
        !collection.deletedAt && collection.members.includes(normalizedOwnerId),
      )
      .map(([id, collection]) => this.toCollectionSummary(
        data,
        id,
        collection,
        normalizedOwnerId,
        activeCollectionId,
      ))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getActiveAlbum(ownerId: string): CollectionSummary | null {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = data.ownerCollections[normalizedOwnerId];
    const collection = collectionId ? data.collections[collectionId] : undefined;

    if (!collection || collection.deletedAt || !collection.members.includes(normalizedOwnerId)) {
      return null;
    }

    return this.toCollectionSummary(data, collectionId, collection, normalizedOwnerId, collectionId);
  }

  getAlbumSnapshot(ownerId: string, collectionId: string): CollectionSnapshot | null {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];

    if (!collection || collection.deletedAt || !collection.members.includes(normalizedOwnerId)) {
      return null;
    }

    return {
      album: this.toCollectionSummary(
        data,
        collectionId,
        collection,
        normalizedOwnerId,
        data.ownerCollections[normalizedOwnerId],
      ),
      stickerQuantities: { ...collection.stickers },
    };
  }

  createAlbum(ownerId: string, albumSlug: string, name?: string): CollectionSummary | null {
    const albumTemplate = getAlbumTemplate(albumSlug);

    if (!albumTemplate) {
      return null;
    }

    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = randomUUID();
    const albumName = this.normalizeAlbumName(name) ?? albumTemplate.name;

    data.collections[collectionId] = createEmptyCollection({
      albumSlug: albumTemplate.slug,
      name: albumName,
      ownerId: normalizedOwnerId,
    });
    data.ownerCollections[normalizedOwnerId] = collectionId;
    this.writeData(data);

    return this.toCollectionSummary(
      data,
      collectionId,
      data.collections[collectionId],
      normalizedOwnerId,
      collectionId,
    );
  }

  renameAlbum(
    ownerId: string,
    collectionId: string,
    name: string,
  ): { album?: CollectionSummary; error?: string } {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];
    const normalizedName = this.normalizeAlbumName(name);

    if (!collection || collection.deletedAt) {
      return { error: 'Album no encontrado.' };
    }

    if (collection.ownerId !== normalizedOwnerId) {
      return { error: 'Solo el dueno puede renombrar el album.' };
    }

    if (!normalizedName) {
      return { error: 'Nombre de album invalido.' };
    }

    collection.name = normalizedName;
    this.writeData(data);

    return {
      album: this.toCollectionSummary(
        data,
        collectionId,
        collection,
        normalizedOwnerId,
        data.ownerCollections[normalizedOwnerId],
      ),
    };
  }

  deleteAlbum(
    ownerId: string,
    collectionId: string,
  ): { album?: CollectionSummary; error?: string } {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];

    if (!collection || collection.deletedAt) {
      return { error: 'Album no encontrado.' };
    }

    if (collection.ownerId !== normalizedOwnerId) {
      return { error: 'Solo el dueno puede borrar el album.' };
    }

    const summary = this.toCollectionSummary(
      data,
      collectionId,
      collection,
      normalizedOwnerId,
      data.ownerCollections[normalizedOwnerId],
    );

    collection.deletedAt = new Date().toISOString();
    collection.members = [];
    this.removeActiveCollectionReferences(data, collectionId);
    this.expirePendingShareRequests(data, collectionId);
    this.expireTradeOffersForCollection(data, collectionId);
    this.writeData(data);

    return { album: summary };
  }

  leaveAlbum(
    ownerId: string,
    collectionId: string,
  ): { album?: CollectionSummary; error?: string } {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];

    if (!collection || collection.deletedAt || !collection.members.includes(normalizedOwnerId)) {
      return { error: 'Album no encontrado.' };
    }

    if (collection.ownerId === normalizedOwnerId) {
      return { error: 'El dueno no puede salir del album. Debe borrarlo.' };
    }

    collection.members = collection.members.filter((memberId) => memberId !== normalizedOwnerId);

    if (data.ownerCollections[normalizedOwnerId] === collectionId) {
      delete data.ownerCollections[normalizedOwnerId];
    }

    this.expireTradeOffersForOwnerInCollection(data, normalizedOwnerId, collectionId);

    this.writeData(data);

    return {
      album: this.toCollectionSummary(
        data,
        collectionId,
        collection,
        normalizedOwnerId,
        data.ownerCollections[normalizedOwnerId],
      ),
    };
  }

  setActiveAlbum(ownerId: string, collectionId: string): CollectionSummary | null {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collection = data.collections[collectionId];

    if (!collection || collection.deletedAt || !collection.members.includes(normalizedOwnerId)) {
      return null;
    }

    data.ownerCollections[normalizedOwnerId] = collectionId;
    this.writeData(data);

    return this.toCollectionSummary(data, collectionId, collection, normalizedOwnerId, collectionId);
  }

  getStickerQuantities(ownerId: string): Record<string, number> {
    const data = this.readData();
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      throw new Error('No hay album activo.');
    }

    return { ...activeCollection.collection.stickers };
  }

  adjustQuantity(ownerId: string, sticker: StickerRef, delta: number): StickerQuantityChange {
    const data = this.readData();
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      throw new Error('No hay album activo.');
    }

    const collection = activeCollection.collection;
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
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      throw new Error('No hay album activo.');
    }

    activeCollection.collection.history.push(entry);
    this.writeData(data);
  }

  undoLast(ownerId: string): StickerHistoryEntry | null {
    const data = this.readData();
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      throw new Error('No hay album activo.');
    }

    const collection = activeCollection.collection;
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

    const activeCollection = this.getActiveCollection(data, normalizedFromOwnerId);

    if (!activeCollection) {
      return {
        error: 'No hay album activo.',
      };
    }

    const { id: collectionId } = activeCollection;

    if (activeCollection.collection.members.includes(toProfile.ownerId)) {
      return {
        error: `Ya compartes album con @${normalizedTargetUsername}.`,
      };
    }

    const existingRequest = Object.values(data.shareRequests).find(
      (request) =>
        request.status === 'pending'
        && request.fromOwnerId === normalizedFromOwnerId
        && request.toOwnerId === toProfile.ownerId
        && request.collectionId === collectionId,
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

    const sourceCollection = data.collections[request.collectionId];

    if (!sourceCollection || sourceCollection.deletedAt) {
      return { error: 'Album no encontrado.' };
    }

    if (!sourceCollection.members.includes(request.fromOwnerId)) {
      return { error: 'Album no encontrado.' };
    }

    const targetCollectionId = data.ownerCollections[request.toOwnerId];
    const targetCollection = targetCollectionId
      ? data.collections[targetCollectionId]
      : undefined;

    if (targetCollection && !targetCollection.deletedAt && targetCollection.ownerId === request.toOwnerId) {
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

  getCollectionSummaryById(collectionId: string): CollectionSummary | null {
    const data = this.readData();
    const collection = data.collections[collectionId];

    if (!collection || collection.deletedAt) {
      return null;
    }

    return this.toCollectionSummary(
      data,
      collectionId,
      collection,
      collection.ownerId,
      undefined,
    );
  }

  createTradeOffer(
    ownerId: string,
    give: TradeSelector,
    want: TradeSelector,
  ): { offer?: TradeOffer; error?: string } {
    const data = this.readData();
    const activeCollection = this.getActiveCollection(data, ownerId);

    if (!activeCollection) {
      return { error: 'No active album.' };
    }

    const giveError = this.validateTradeGiveSelector(
      activeCollection.collection.stickers,
      give,
    );

    if (giveError) {
      return { error: giveError };
    }

    const wantError = this.validateTradeWantSelector(
      activeCollection.collection.stickers,
      want,
    );

    if (wantError) {
      return { error: wantError };
    }

    const nextSequence = data.tradeOfferSequence + 1;
    const offer: TradeOffer = {
      id: `T${nextSequence}`,
      ownerId: this.normalizeOwnerId(ownerId),
      collectionId: activeCollection.id,
      give,
      want,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    data.tradeOfferSequence = nextSequence;
    data.tradeOffers[offer.id] = offer;
    this.writeData(data);

    return {
      offer: this.cloneTradeOffer(offer),
    };
  }

  listTradeOffersForOwner(ownerId: string): TradeOffer[] {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);

    return Object.values(data.tradeOffers)
      .filter((offer) => offer.ownerId === normalizedOwnerId)
      .filter((offer) => offer.status !== 'completed' && offer.status !== 'cancelled')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((offer) => this.cloneTradeOffer(offer));
  }

  listMarketplaceTradeOffers(
    viewerOwnerId: string | undefined,
    search: MarketplaceSearch = {},
  ): TradeOffer[] {
    const data = this.readData();
    const normalizedViewerOwnerId = viewerOwnerId
      ? this.normalizeOwnerId(viewerOwnerId)
      : undefined;
    const viewerCollectionId = normalizedViewerOwnerId
      ? data.ownerCollections[normalizedViewerOwnerId]
      : undefined;

    return Object.values(data.tradeOffers)
      .filter((offer) => offer.status === 'active')
      .filter((offer) => this.isTradeOfferValid(data, offer))
      .filter((offer) =>
        search.mineOnly
          ? offer.ownerId === normalizedViewerOwnerId
          : offer.ownerId !== normalizedViewerOwnerId,
      )
      .filter((offer) => search.mineOnly || !viewerCollectionId || offer.collectionId !== viewerCollectionId)
      .filter((offer) =>
        !search.ownerUsername
        || data.profiles[offer.ownerId]?.username === search.ownerUsername,
      )
      .filter((offer) =>
        !search.sticker
        || tradeSelectorMatchesSticker(offer.give, search.sticker)
        || tradeSelectorMatchesSticker(offer.want, search.sticker),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((offer) => this.cloneTradeOffer(offer));
  }

  getTradeOffer(tradeId: string): TradeOffer | null {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];

    return offer ? this.cloneTradeOffer(offer) : null;
  }

  isTradeOfferCurrentlyValid(tradeId: string): boolean {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];

    return offer ? this.isTradeOfferValid(data, offer) : false;
  }

  cancelTradeOffer(
    ownerId: string,
    tradeId: string,
  ): { offer?: TradeOffer; error?: string } {
    const data = this.readData();
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const offer = data.tradeOffers[tradeId.toUpperCase()];

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active' && offer.status !== 'pending_confirmation') {
      return { error: 'Only active or pending trades can be cancelled.' };
    }

    offer.status = 'cancelled';
    offer.cancelledAt = new Date().toISOString();
    this.writeData(data);

    return { offer: this.cloneTradeOffer(offer) };
  }

  getCompatibleTradePairs(
    tradeId: string,
    takerOwnerId: string,
  ): { offer?: TradeOffer; pairs?: TradePair[]; error?: string } {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active') {
      return { error: 'This trade is no longer active.' };
    }

    const normalizedTakerOwnerId = this.normalizeOwnerId(takerOwnerId);

    if (offer.ownerId === normalizedTakerOwnerId) {
      return { error: 'You cannot take your own trade.' };
    }

    const takerCollection = this.getActiveCollection(data, normalizedTakerOwnerId);

    if (!takerCollection) {
      return { error: 'No active album.' };
    }

    if (takerCollection.id === offer.collectionId) {
      return { error: 'This trade already belongs to your active shared album.' };
    }

    if (!this.isTradeOfferValid(data, offer)) {
      return { error: 'Trade expired.' };
    }

    const pairs = this.getCompatiblePairs(data, offer, takerCollection.id);

    if (pairs.length === 0) {
      return { error: 'No compatible sticker pair found right now.' };
    }

    return {
      offer: this.cloneTradeOffer(offer),
      pairs,
    };
  }

  reserveTradeOffer(
    tradeId: string,
    takerOwnerId: string,
    pair?: TradePair,
  ): { offer?: TradeOffer; error?: string } {
    const data = this.readData();
    const normalizedTradeId = tradeId.toUpperCase();
    const normalizedTakerOwnerId = this.normalizeOwnerId(takerOwnerId);
    const offer = data.tradeOffers[normalizedTradeId];

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active') {
      return { error: 'This trade is no longer active.' };
    }

    if (offer.ownerId === normalizedTakerOwnerId) {
      return { error: 'You cannot take your own trade.' };
    }

    const takerCollection = this.getActiveCollection(data, normalizedTakerOwnerId);

    if (!takerCollection) {
      return { error: 'No active album.' };
    }

    if (takerCollection.id === offer.collectionId) {
      return { error: 'This trade already belongs to your active shared album.' };
    }

    if (!this.isTradeOfferValid(data, offer)) {
      this.markTradeOfferExpired(offer);
      this.writeData(data);

      return { error: 'Trade expired.' };
    }

    const compatiblePairs = this.getCompatiblePairs(data, offer, takerCollection.id);

    if (compatiblePairs.length === 0) {
      return { error: 'No compatible sticker pair found right now.' };
    }

    const resolvedPair = pair
      ? compatiblePairs.find((candidate) => this.tradePairsEqual(candidate, pair))
      : compatiblePairs.length === 1
        ? compatiblePairs[0]
        : undefined;

    if (!resolvedPair) {
      return { error: 'Choose an exact sticker pair first.' };
    }

    offer.status = 'pending_confirmation';
    offer.reservedByOwnerId = normalizedTakerOwnerId;
    offer.reservedCollectionId = takerCollection.id;
    offer.resolvedGive = resolvedPair.give;
    offer.resolvedWant = resolvedPair.want;
    offer.ownerConfirmedAt = undefined;
    offer.takerConfirmedAt = undefined;
    this.writeData(data);

    return {
      offer: this.cloneTradeOffer(offer),
    };
  }

  acceptTradeOffer(
    tradeId: string,
    ownerId: string,
  ): { offer?: TradeOffer; error?: string } {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'pending_confirmation') {
      return { error: 'This trade is not waiting for coordination.' };
    }

    if (!this.isTradeOfferValid(data, offer)) {
      this.markTradeOfferExpired(offer);
      this.writeData(data);

      return { error: 'Trade expired.' };
    }

    offer.status = 'accepted_pending_completion';
    offer.ownerConfirmedAt = undefined;
    offer.takerConfirmedAt = undefined;
    this.writeData(data);

    return {
      offer: this.cloneTradeOffer(offer),
    };
  }

  declineTradeOffer(
    tradeId: string,
    ownerId: string,
  ): { offer?: TradeOffer; error?: string } {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'pending_confirmation') {
      return { error: 'This trade is not waiting for coordination.' };
    }

    this.clearTradeReservation(offer);
    this.writeData(data);

    return {
      offer: this.cloneTradeOffer(offer),
    };
  }

  confirmTradeOfferCompleted(
    tradeId: string,
    actorOwnerId: string,
  ): {
    offer?: TradeOffer;
    completed?: boolean;
    waitingForOther?: boolean;
    alreadyConfirmed?: boolean;
    error?: string;
  } {
    const data = this.readData();
    const offer = data.tradeOffers[tradeId.toUpperCase()];
    const normalizedActorOwnerId = this.normalizeOwnerId(actorOwnerId);

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (
      offer.ownerId !== normalizedActorOwnerId
      && offer.reservedByOwnerId !== normalizedActorOwnerId
    ) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'accepted_pending_completion') {
      if (offer.status === 'completed') {
        return { offer: this.cloneTradeOffer(offer), completed: true };
      }

      return { error: 'This trade is not waiting for completion.' };
    }

    if (!this.isTradeOfferValid(data, offer)) {
      this.markTradeOfferExpired(offer);
      this.writeData(data);

      return { error: 'Trade expired.' };
    }

    const isOwnerConfirmation = offer.ownerId === normalizedActorOwnerId;
    const timestamp = new Date().toISOString();
    const alreadyConfirmed = isOwnerConfirmation
      ? Boolean(offer.ownerConfirmedAt)
      : Boolean(offer.takerConfirmedAt);

    if (!alreadyConfirmed) {
      if (isOwnerConfirmation) {
        offer.ownerConfirmedAt = timestamp;
      } else {
        offer.takerConfirmedAt = timestamp;
      }
    }

    if (offer.ownerConfirmedAt && offer.takerConfirmedAt) {
      const ownerCollection = data.collections[offer.collectionId];
      const takerCollection = offer.reservedCollectionId
        ? data.collections[offer.reservedCollectionId]
        : undefined;

      if (
        !ownerCollection
        || ownerCollection.deletedAt
        || !takerCollection
        || takerCollection.deletedAt
        || !offer.resolvedGive
        || !offer.resolvedWant
      ) {
        this.markTradeOfferExpired(offer);
        this.writeData(data);

        return { error: 'Trade expired.' };
      }

      this.changeCollectionStickerQuantity(ownerCollection, offer.resolvedGive, -1);
      this.changeCollectionStickerQuantity(ownerCollection, offer.resolvedWant, 1);
      this.changeCollectionStickerQuantity(takerCollection, offer.resolvedWant, -1);
      this.changeCollectionStickerQuantity(takerCollection, offer.resolvedGive, 1);

      offer.status = 'completed';
      offer.completedAt = timestamp;
      this.writeData(data);

      return {
        offer: this.cloneTradeOffer(offer),
        completed: true,
        alreadyConfirmed,
      };
    }

    this.writeData(data);

    return {
      offer: this.cloneTradeOffer(offer),
      waitingForOther: true,
      alreadyConfirmed,
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

  private getActiveCollection(
    data: StoredData,
    ownerId: string,
  ): { id: string; collection: StoredCollection } | null {
    const normalizedOwnerId = this.normalizeOwnerId(ownerId);
    const collectionId = data.ownerCollections[normalizedOwnerId];
    const collection = collectionId ? data.collections[collectionId] : undefined;

    if (!collection || collection.deletedAt || !collection.members.includes(normalizedOwnerId)) {
      return null;
    }

    return { id: collectionId, collection };
  }

  private normalizeOwnerId(ownerId: string): string {
    return ownerId.trim() || 'default';
  }

  private normalizeAlbumName(name: string | undefined): string | undefined {
    const normalizedName = name?.trim().replace(/\s+/g, ' ');

    return normalizedName || undefined;
  }

  private normalizeData(data: Partial<StoredData>): StoredData {
    const normalizedData: StoredData = {
      version: 2,
      collections: data.collections ?? {},
      ownerCollections: data.ownerCollections ?? {},
      profiles: data.profiles ?? {},
      shareRequests: data.shareRequests ?? {},
      tradeOffers: data.tradeOffers ?? {},
      tradeOfferSequence: data.tradeOfferSequence ?? 0,
    };

    const albumTemplate = getAlbumTemplate(DEFAULT_ALBUM_SLUG);

    for (const [collectionId, collection] of Object.entries(normalizedData.collections)) {
      const legacyOwnerId = collection.ownerId ?? collectionId;

      collection.albumSlug ??= DEFAULT_ALBUM_SLUG;
      collection.name ??= albumTemplate?.name ?? 'Panini FIFA World Cup 2026';
      collection.ownerId = this.normalizeOwnerId(legacyOwnerId);
      collection.members = [...new Set((collection.members ?? [collection.ownerId]).map((memberId) =>
        this.normalizeOwnerId(memberId),
      ))];
      collection.createdAt ??= new Date().toISOString();
      collection.stickers ??= {};
      collection.history ??= [];

      if (!collection.deletedAt && !collection.members.includes(collection.ownerId)) {
        collection.members.unshift(collection.ownerId);
      }

      normalizedData.ownerCollections[collection.ownerId] ??= collectionId;
    }

    for (const [ownerId, collectionId] of Object.entries(normalizedData.ownerCollections)) {
      const normalizedOwnerId = this.normalizeOwnerId(ownerId);
      const collection = normalizedData.collections[collectionId];

      if (!collection || collection.deletedAt) {
        delete normalizedData.ownerCollections[ownerId];
        continue;
      }

      if (!collection.members.includes(normalizedOwnerId)) {
        delete normalizedData.ownerCollections[ownerId];
      }
    }

    for (const request of Object.values(normalizedData.shareRequests)) {
      request.fromOwnerId = this.normalizeOwnerId(request.fromOwnerId);
      request.toOwnerId = this.normalizeOwnerId(request.toOwnerId);
      request.targetUsername = request.targetUsername?.replace(/^@/, '').toLowerCase();

      if (!request.collectionId) {
        request.collectionId = normalizedData.ownerCollections[request.fromOwnerId];
      }

      const collection = normalizedData.collections[request.collectionId];

      if (!collection || collection.deletedAt) {
        request.status = request.status === 'pending' ? 'declined' : request.status;
        request.respondedAt ??= new Date().toISOString();
      }
    }

    for (const [tradeId, offer] of Object.entries(normalizedData.tradeOffers)) {
      offer.id = (offer.id ?? tradeId).toUpperCase();
      offer.ownerId = this.normalizeOwnerId(offer.ownerId);
      offer.status ??= 'active';
      offer.createdAt ??= new Date().toISOString();
      offer.reservedByOwnerId = offer.reservedByOwnerId
        ? this.normalizeOwnerId(offer.reservedByOwnerId)
        : undefined;
      offer.collectionId ??= normalizedData.ownerCollections[offer.ownerId];

      if (
        (offer.status === 'pending_confirmation' || offer.status === 'accepted_pending_completion')
        && (!offer.resolvedGive || !offer.resolvedWant || !offer.reservedByOwnerId)
      ) {
        offer.status = 'expired';
      }

      const ownerCollection = offer.collectionId
        ? normalizedData.collections[offer.collectionId]
        : undefined;
      const reservedCollection = offer.reservedCollectionId
        ? normalizedData.collections[offer.reservedCollectionId]
        : undefined;

      if (!ownerCollection || ownerCollection.deletedAt) {
        if (offer.status !== 'completed' && offer.status !== 'cancelled') {
          offer.status = 'expired';
        }
      }

      if (
        offer.reservedCollectionId
        && (!reservedCollection || reservedCollection.deletedAt)
        && offer.status !== 'completed'
        && offer.status !== 'cancelled'
      ) {
        offer.status = 'expired';
      }

      const numericId = Number(offer.id.replace(/^T/, ''));

      if (Number.isFinite(numericId)) {
        normalizedData.tradeOfferSequence = Math.max(normalizedData.tradeOfferSequence, numericId);
      }
    }

    return normalizedData;
  }

  private toCollectionSummary(
    data: StoredData,
    id: string,
    collection: StoredCollection,
    requesterOwnerId: string,
    activeCollectionId: string | undefined,
  ): CollectionSummary {
    const normalizedRequesterOwnerId = this.normalizeOwnerId(requesterOwnerId);

    return {
      id,
      albumSlug: collection.albumSlug,
      name: collection.name,
      ownerId: collection.ownerId,
      ownerDisplayName: data.profiles[collection.ownerId]?.displayName,
      memberCount: collection.members.length,
      isActive: id === activeCollectionId,
      isShared: collection.ownerId !== normalizedRequesterOwnerId,
    };
  }

  private removeActiveCollectionReferences(data: StoredData, collectionId: string): void {
    for (const [ownerId, activeCollectionId] of Object.entries(data.ownerCollections)) {
      if (activeCollectionId === collectionId) {
        delete data.ownerCollections[ownerId];
      }
    }
  }

  private expirePendingShareRequests(data: StoredData, collectionId: string): void {
    for (const request of Object.values(data.shareRequests)) {
      if (request.collectionId === collectionId && request.status === 'pending') {
        request.status = 'declined';
        request.respondedAt = new Date().toISOString();
      }
    }
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
