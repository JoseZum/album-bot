import { randomUUID } from 'crypto';
import { getAlbumTemplate } from '../catalog/album-templates.catalog';
import {
  WORLD_CUP_CATALOG,
  formatSticker,
  getAllStickerRefs,
  getCatalogEntry,
  isKnownSticker,
  resolveCountry,
  stickerKey,
  type StickerRef,
} from '../catalog/world-cup.catalog';
import type { BotLanguage } from '../i18n/bot.i18n';
import { db as defaultDb } from '../db';
import type { Db } from '../db/types';
import {
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
  fromUsername?: string;
  toUsername?: string;
  collectionId: string;
  status: ShareRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type FriendRequest = {
  id: string;
  fromOwnerId: string;
  toOwnerId: string;
  targetUsername: string;
  fromUsername?: string;
  toUsername?: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

export type FriendSummary = StoredProfile & {
  friendsSince: string;
};

export type FriendOverview = {
  friends: FriendSummary[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
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

export type DuplicateStickerEntry = {
  sticker: StickerRef;
  quantity: number;
};

export type FriendDuplicateStickerGroup = {
  ownerId: string;
  displayName?: string;
  duplicates: DuplicateStickerEntry[];
};

export type CompareCandidate = {
  sticker: StickerRef;
  extraCount: number;
};

export type AlbumComparison = {
  sourceAlbum: CollectionSummary;
  sourceCanGive: CompareCandidate[];
  targetAlbum: CollectionSummary;
  targetCanGive: CompareCandidate[];
};

type AccessibleAlbumDetails = {
  summary: CollectionSummary;
  catalogAlbumId: number;
};

// ---------------------------------------------------------------------------
// Row → TypeScript helpers
// ---------------------------------------------------------------------------

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

function rowToStoredProfile(row: Record<string, unknown>): StoredProfile {
  return {
    ownerId: row.telegram_chat_id as string,
    username: (row.telegram_username as string | null) ?? undefined,
    firstName: (row.first_name as string | null) ?? undefined,
    lastName: (row.last_name as string | null) ?? undefined,
    displayName: (row.display_name as string | null) ?? undefined,
    language: (row.language_code as BotLanguage | null) ?? undefined,
    updatedAt: toIso(row.updated_at),
  };
}

function rowToCollectionSummary(
  row: Record<string, unknown>,
  requesterOwnerId: string,
  activeAlbumId: string | null | undefined,
): CollectionSummary {
  const id = row.id as string;
  const ownerId = row.owner_telegram_chat_id as string;

  return {
    id,
    albumSlug: row.album_slug as string,
    name: row.name as string,
    ownerId,
    ownerDisplayName: (row.owner_display_name as string | null) ?? undefined,
    memberCount: Number(row.member_count),
    isActive: id === activeAlbumId,
    isShared: ownerId !== requesterOwnerId,
  };
}

function rowToShareRequest(row: Record<string, unknown>): ShareRequest {
  return {
    id: row.id as string,
    fromOwnerId: row.from_telegram_chat_id as string,
    toOwnerId: row.to_telegram_chat_id as string,
    targetUsername: (row.to_telegram_username as string | null) ?? (row.to_telegram_chat_id as string),
    fromUsername: (row.from_telegram_username as string | null) ?? undefined,
    toUsername: (row.to_telegram_username as string | null) ?? undefined,
    collectionId: row.user_album_id as string,
    status: row.status as ShareRequestStatus,
    createdAt: toIso(row.created_at),
    respondedAt: row.answered_at ? toIso(row.answered_at) : undefined,
  };
}

function rowToFriendRequest(row: Record<string, unknown>): FriendRequest {
  return {
    id: row.id as string,
    fromOwnerId: row.from_telegram_chat_id as string,
    toOwnerId: row.to_telegram_chat_id as string,
    targetUsername: (row.to_telegram_username as string | null) ?? (row.to_telegram_chat_id as string),
    fromUsername: (row.from_telegram_username as string | null) ?? undefined,
    toUsername: (row.to_telegram_username as string | null) ?? undefined,
    status: row.status as FriendRequestStatus,
    createdAt: toIso(row.created_at),
    respondedAt: row.answered_at ? toIso(row.answered_at) : undefined,
  };
}

function rowToTradeOffer(row: Record<string, unknown>): TradeOffer {
  const give: TradeSelector = row.give_kind === 'sticker'
    ? {
      kind: 'sticker',
      sticker: {
        countryCode: row.give_country_code as string,
        number: row.give_sticker_number as number,
      },
    }
    : {
      kind: row.give_kind as 'duplicate' | 'missing',
      countryCode: (row.give_country_code as string | null) ?? undefined,
    };

  const want: TradeSelector = row.want_kind === 'sticker'
    ? {
      kind: 'sticker',
      sticker: {
        countryCode: row.want_country_code as string,
        number: row.want_sticker_number as number,
      },
    }
    : {
      kind: row.want_kind as 'duplicate' | 'missing',
      countryCode: (row.want_country_code as string | null) ?? undefined,
    };

  const resolvedGive: StickerRef | undefined = row.resolved_give_country_code
    ? {
      countryCode: row.resolved_give_country_code as string,
      number: row.resolved_give_sticker_number as number,
    }
    : undefined;

  const resolvedWant: StickerRef | undefined = row.resolved_want_country_code
    ? {
      countryCode: row.resolved_want_country_code as string,
      number: row.resolved_want_sticker_number as number,
    }
    : undefined;

  return {
    id: row.id as string,
    ownerId: row.owner_telegram_chat_id as string,
    collectionId: row.collection_id as string,
    give,
    want,
    status: row.status as TradeOffer['status'],
    createdAt: toIso(row.created_at),
    reservedByOwnerId: (row.reserved_by_telegram_chat_id as string | null) ?? undefined,
    reservedCollectionId: (row.reserved_collection_id as string | null) ?? undefined,
    resolvedGive,
    resolvedWant,
    ownerConfirmedAt: row.owner_confirmed_at ? toIso(row.owner_confirmed_at) : undefined,
    takerConfirmedAt: row.taker_confirmed_at ? toIso(row.taker_confirmed_at) : undefined,
    completedAt: row.completed_at ? toIso(row.completed_at) : undefined,
    cancelledAt: row.cancelled_at ? toIso(row.cancelled_at) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function normalizeOwnerId(ownerId: string): string {
  return ownerId.trim() || 'default';
}

function normalizeAlbumName(name: string | undefined): string | undefined {
  const n = name?.trim().replace(/\s+/g, ' ');

  return n || undefined;
}

function buildStickerLookupCandidates(sticker: StickerRef): string[] {
  const countryCode = sticker.countryCode.toUpperCase();
  const number = String(sticker.number);

  if (countryCode === 'WP' && sticker.number === 0) {
    return ['00', 'WP0', 'WP00', 'WP000'];
  }

  return [...new Set([
    `${countryCode}${number}`,
    `${countryCode}${number.padStart(2, '0')}`,
    `${countryCode}${number.padStart(3, '0')}`,
  ])];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// CollectionRepository
// ---------------------------------------------------------------------------

export class CollectionRepository {
  constructor(private readonly db: Db = defaultDb) {}

  // ---- Profiles ----

  async registerProfile(profile: {
    ownerId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    language?: BotLanguage;
  }): Promise<StoredProfile> {
    const ownerId = normalizeOwnerId(profile.ownerId);
    const username = profile.username?.replace(/^@/, '').toLowerCase() ?? null;

    // Get existing profile to preserve fields
    const existing = await this.getProfileRow(ownerId);

    const finalUsername = username ?? (existing?.telegram_username as string | null) ?? null;
    const finalFirstName = profile.firstName ?? (existing?.first_name as string | null) ?? null;
    const finalLastName = profile.lastName ?? (existing?.last_name as string | null) ?? null;
    const finalLanguage = profile.language ?? (existing?.language_code as string | null) ?? null;

    const displayName = finalUsername
      ? `@${finalUsername}`
      : [finalFirstName, finalLastName].filter(Boolean).join(' ') || ownerId;

    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO collector_profiles (id, telegram_chat_id, telegram_username, first_name, last_name, display_name, language_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (telegram_chat_id) DO UPDATE SET
         telegram_username = EXCLUDED.telegram_username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         display_name = EXCLUDED.display_name,
         language_code = EXCLUDED.language_code,
         updated_at = now()
       RETURNING *`,
      [randomUUID(), ownerId, finalUsername, finalFirstName, finalLastName, displayName, finalLanguage],
    );

    return rowToStoredProfile(result.rows[0]);
  }

  async getProfile(ownerId: string): Promise<StoredProfile | undefined> {
    const row = await this.getProfileRow(normalizeOwnerId(ownerId));

    return row ? rowToStoredProfile(row) : undefined;
  }

  async findProfileByUsername(username: string): Promise<StoredProfile | undefined> {
    const normalized = username.replace(/^@/, '').toLowerCase();
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM collector_profiles WHERE telegram_username = $1`,
      [normalized],
    );

    return result.rows[0] ? rowToStoredProfile(result.rows[0]) : undefined;
  }

  async setLanguage(ownerId: string, language: BotLanguage): Promise<StoredProfile> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const existing = await this.getProfileRow(normalizedOwnerId);

    const finalUsername = (existing?.telegram_username as string | null) ?? null;
    const finalFirstName = (existing?.first_name as string | null) ?? null;
    const finalLastName = (existing?.last_name as string | null) ?? null;
    const displayName = existing
      ? ((existing.display_name as string | null) ?? normalizedOwnerId)
      : normalizedOwnerId;

    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO collector_profiles (id, telegram_chat_id, telegram_username, first_name, last_name, display_name, language_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (telegram_chat_id) DO UPDATE SET
         language_code = EXCLUDED.language_code,
         updated_at = now()
       RETURNING *`,
      [randomUUID(), normalizedOwnerId, finalUsername, finalFirstName, finalLastName, displayName, language],
    );

    return rowToStoredProfile(result.rows[0]);
  }

  // ---- Albums ----

  async hasActiveAlbum(ownerId: string): Promise<boolean> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*)::int AS count
       FROM collector_active_albums
       JOIN collector_profiles ON collector_profiles.id = collector_active_albums.collector_id
       JOIN user_albums ON user_albums.id = collector_active_albums.user_album_id
       JOIN user_album_members ON user_album_members.user_album_id = user_albums.id
         AND user_album_members.collector_id = collector_active_albums.collector_id
         AND user_album_members.left_at IS NULL
       WHERE collector_profiles.telegram_chat_id = $1
         AND user_albums.deleted_at IS NULL`,
      [normalizedOwnerId],
    );

    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async listAlbums(ownerId: string): Promise<CollectionSummary[]> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumId(normalizedOwnerId);

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(active_members.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       JOIN collector_profiles member_cp ON member_cp.id = uam.collector_id
         AND member_cp.telegram_chat_id = $1
       JOIN user_album_members active_members ON active_members.user_album_id = ua.id
         AND active_members.left_at IS NULL
       WHERE ua.deleted_at IS NULL
       GROUP BY ua.id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name
       ORDER BY ua.name ASC`,
      [normalizedOwnerId],
    );

    return result.rows.map((row) => rowToCollectionSummary(row, normalizedOwnerId, activeAlbumId));
  }

  async getActiveAlbum(ownerId: string): Promise<CollectionSummary | null> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumId(normalizedOwnerId);

    if (!activeAlbumId) {
      return null;
    }

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(uam2.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       JOIN collector_profiles cp ON cp.id = uam.collector_id AND cp.telegram_chat_id = $1
       JOIN user_album_members uam2 ON uam2.user_album_id = ua.id AND uam2.left_at IS NULL
       WHERE ua.id = $2 AND ua.deleted_at IS NULL
       GROUP BY ua.id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name`,
      [normalizedOwnerId, activeAlbumId],
    );

    if (!result.rows[0]) {
      return null;
    }

    return rowToCollectionSummary(result.rows[0], normalizedOwnerId, activeAlbumId);
  }

  async getAlbumSnapshot(ownerId: string, collectionId: string): Promise<CollectionSnapshot | null> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumId(normalizedOwnerId);
    const albumDetails = await this.getAccessibleAlbumDetails(
      normalizedOwnerId,
      collectionId,
      activeAlbumId,
    );

    if (!albumDetails) {
      return null;
    }

    const stickerQuantities = await this.getStickerQuantitiesForAlbum(collectionId);

    return { album: albumDetails.summary, stickerQuantities };
  }

  async compareAlbums(
    sourceOwnerId: string,
    targetOwnerId: string,
    targetCollectionId: string,
    options?: {
      sourceCollectionId?: string;
      countryCode?: string;
    },
  ): Promise<AlbumComparison | null> {
    const normalizedSourceOwnerId = normalizeOwnerId(sourceOwnerId);
    const normalizedTargetOwnerId = normalizeOwnerId(targetOwnerId);
    const sourceActiveAlbumId = await this.getActiveAlbumId(normalizedSourceOwnerId);
    const sourceCollectionId = options?.sourceCollectionId
      ?? sourceActiveAlbumId
      ?? await this.getActiveAlbumIdOrThrow(normalizedSourceOwnerId);
    const normalizedCountryCode = options?.countryCode?.toUpperCase();
    const [sourceAlbumDetails, targetAlbumDetails] = await Promise.all([
      this.getAccessibleAlbumDetails(
        normalizedSourceOwnerId,
        sourceCollectionId,
        sourceActiveAlbumId ?? sourceCollectionId,
      ),
      this.getAccessibleAlbumDetails(normalizedTargetOwnerId, targetCollectionId, null),
    ]);

    if (!sourceAlbumDetails || !targetAlbumDetails) {
      return null;
    }

    if (sourceAlbumDetails.catalogAlbumId !== targetAlbumDetails.catalogAlbumId) {
      return null;
    }

    const [sourceCanGive, targetCanGive] = await Promise.all([
      this.listCompareCandidates(sourceCollectionId, targetCollectionId, normalizedCountryCode),
      this.listCompareCandidates(targetCollectionId, sourceCollectionId, normalizedCountryCode),
    ]);

    return {
      sourceAlbum: sourceAlbumDetails.summary,
      targetAlbum: targetAlbumDetails.summary,
      sourceCanGive,
      targetCanGive,
    };
  }

  async createAlbum(ownerId: string, albumSlug: string, name?: string): Promise<CollectionSummary | null> {
    const albumTemplate = getAlbumTemplate(albumSlug);

    if (!albumTemplate) {
      return null;
    }

    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const albumName = normalizeAlbumName(name) ?? albumTemplate.name;

    // Get the album_id from the slug
    const albumResult = await this.db.query<{ id: number }>(
      `SELECT id FROM albums WHERE slug = $1`,
      [albumSlug],
    );

    if (!albumResult.rows[0]) {
      return null;
    }

    const catalogAlbumId = albumResult.rows[0].id;

    // Get or create collector profile
    const ownerUuid = await this.getOrCreateCollectorUUID(normalizedOwnerId);

    // Create the user album
    const insertResult = await this.db.query<{ id: string }>(
      `INSERT INTO user_albums (id, album_id, owner_id, name) VALUES ($1, $2, $3, $4) RETURNING id`,
      [randomUUID(), catalogAlbumId, ownerUuid, albumName],
    );

    const newAlbumId = insertResult.rows[0].id;

    // Replicate ensure_user_album_owner_member trigger
    await this.db.query(
      `INSERT INTO user_album_members (user_album_id, collector_id, role, left_at)
       VALUES ($1, $2, 'owner', NULL)
       ON CONFLICT (user_album_id, collector_id) DO UPDATE SET
         role = 'owner',
         left_at = NULL`,
      [newAlbumId, ownerUuid],
    );

    // Set as active album
    await this.db.query(
      `INSERT INTO collector_active_albums (collector_id, user_album_id)
       VALUES ($1, $2)
       ON CONFLICT (collector_id) DO UPDATE SET user_album_id = EXCLUDED.user_album_id, updated_at = now()`,
      [ownerUuid, newAlbumId],
    );

    // Get the full summary
    const summaryResult = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(uam.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       WHERE ua.id = $1
       GROUP BY ua.id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name`,
      [newAlbumId],
    );

    if (!summaryResult.rows[0]) {
      return null;
    }

    return rowToCollectionSummary(summaryResult.rows[0], normalizedOwnerId, newAlbumId);
  }

  async renameAlbum(
    ownerId: string,
    collectionId: string,
    name: string,
  ): Promise<{ album?: CollectionSummary; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const normalizedName = normalizeAlbumName(name);

    if (!normalizedName) {
      return { error: 'Nombre de album invalido.' };
    }

    // Check album exists and requester is owner
    const albumResult = await this.db.query<{ id: string; owner_telegram_chat_id: string }>(
      `SELECT ua.id, owner_cp.telegram_chat_id AS owner_telegram_chat_id
       FROM user_albums ua
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       WHERE ua.id = $1 AND ua.deleted_at IS NULL`,
      [collectionId],
    );

    if (!albumResult.rows[0]) {
      return { error: 'Album no encontrado.' };
    }

    if (albumResult.rows[0].owner_telegram_chat_id !== normalizedOwnerId) {
      return { error: 'Solo el dueno puede renombrar el album.' };
    }

    await this.db.query(
      `UPDATE user_albums SET name = $1 WHERE id = $2`,
      [normalizedName, collectionId],
    );

    const summary = await this.getCollectionSummaryForOwner(collectionId, normalizedOwnerId);

    return { album: summary ?? undefined };
  }

  async deleteAlbum(
    ownerId: string,
    collectionId: string,
  ): Promise<{ album?: CollectionSummary; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);

    // Get the summary before deleting
    const summary = await this.getCollectionSummaryForOwner(collectionId, normalizedOwnerId);

    if (!summary) {
      return { error: 'Album no encontrado.' };
    }

    if (summary.ownerId !== normalizedOwnerId) {
      return { error: 'Solo el dueno puede borrar el album.' };
    }

    // Soft-delete: set deleted_at
    await this.db.query(
      `UPDATE user_albums SET deleted_at = now() WHERE id = $1`,
      [collectionId],
    );

    // Remove active album references
    await this.db.query(
      `DELETE FROM collector_active_albums WHERE user_album_id = $1`,
      [collectionId],
    );

    // Mark pending share requests as declined
    await this.db.query(
      `UPDATE album_share_requests SET status = 'declined', answered_at = now()
       WHERE user_album_id = $1 AND status = 'pending'`,
      [collectionId],
    );

    // Expire active/pending trade offers for this collection
    await this.db.query(
      `UPDATE trade_offers SET status = 'expired'
       WHERE (collection_id = $1 OR reserved_collection_id = $1)
         AND status NOT IN ('completed', 'cancelled', 'expired')`,
      [collectionId],
    );

    return { album: summary };
  }

  async leaveAlbum(
    ownerId: string,
    collectionId: string,
  ): Promise<{ album?: CollectionSummary; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);

    // Check user is a member
    const albumResult = await this.db.query<Record<string, unknown>>(
      `SELECT ua.id, owner_cp.telegram_chat_id AS owner_telegram_chat_id,
              al.slug AS album_slug, ua.name, owner_cp.display_name AS owner_display_name
       FROM user_albums ua
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN albums al ON al.id = ua.album_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       JOIN collector_profiles cp ON cp.id = uam.collector_id AND cp.telegram_chat_id = $1
       WHERE ua.id = $2 AND ua.deleted_at IS NULL`,
      [normalizedOwnerId, collectionId],
    );

    if (!albumResult.rows[0]) {
      return { error: 'Album no encontrado.' };
    }

    if ((albumResult.rows[0].owner_telegram_chat_id as string) === normalizedOwnerId) {
      return { error: 'El dueno no puede salir del album. Debe borrarlo.' };
    }

    const collectorUuid = await this.getCollectorUUID(normalizedOwnerId);

    if (!collectorUuid) {
      return { error: 'Album no encontrado.' };
    }

    // Set left_at on member
    await this.db.query(
      `UPDATE user_album_members SET left_at = now()
       WHERE user_album_id = $1 AND collector_id = $2 AND left_at IS NULL`,
      [collectionId, collectorUuid],
    );

    // Remove active album if it was this one
    await this.db.query(
      `DELETE FROM collector_active_albums
       WHERE collector_id = $1 AND user_album_id = $2`,
      [collectorUuid, collectionId],
    );

    // Expire trade offers for this owner in this collection
    await this.db.query(
      `UPDATE trade_offers SET status = 'expired'
       WHERE (
         (collection_id = $1 AND owner_id = $2)
         OR (reserved_collection_id = $1 AND reserved_by_owner_id = $2)
       ) AND status NOT IN ('completed', 'cancelled', 'expired')`,
      [collectionId, collectorUuid],
    );

    // Get updated member count
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM user_album_members WHERE user_album_id = $1 AND left_at IS NULL`,
      [collectionId],
    );

    const memberCount = Number(countResult.rows[0]?.count ?? 0);

    const album: CollectionSummary = {
      id: collectionId,
      albumSlug: albumResult.rows[0].album_slug as string,
      name: albumResult.rows[0].name as string,
      ownerId: albumResult.rows[0].owner_telegram_chat_id as string,
      ownerDisplayName: (albumResult.rows[0].owner_display_name as string | null) ?? undefined,
      memberCount,
      isActive: false,
      isShared: true,
    };

    return { album };
  }

  async setActiveAlbum(ownerId: string, collectionId: string): Promise<CollectionSummary | null> {
    if (!isUuid(collectionId)) {
      return null;
    }

    const normalizedOwnerId = normalizeOwnerId(ownerId);

    // Check user is a member
    const memberCheck = await this.db.query<{ collector_id: string }>(
      `SELECT cp.id AS collector_id
       FROM user_album_members uam
       JOIN collector_profiles cp ON cp.id = uam.collector_id AND cp.telegram_chat_id = $1
       WHERE uam.user_album_id = $2 AND uam.left_at IS NULL`,
      [normalizedOwnerId, collectionId],
    );

    if (!memberCheck.rows[0]) {
      return null;
    }

    // Check album is not deleted
    const albumCheck = await this.db.query<{ id: string }>(
      `SELECT id FROM user_albums WHERE id = $1 AND deleted_at IS NULL`,
      [collectionId],
    );

    if (!albumCheck.rows[0]) {
      return null;
    }

    const collectorUuid = memberCheck.rows[0].collector_id;

    await this.db.query(
      `INSERT INTO collector_active_albums (collector_id, user_album_id)
       VALUES ($1, $2)
       ON CONFLICT (collector_id) DO UPDATE SET user_album_id = EXCLUDED.user_album_id, updated_at = now()`,
      [collectorUuid, collectionId],
    );

    return this.getCollectionSummaryForOwner(collectionId, normalizedOwnerId);
  }

  // ---- Sticker quantities ----

  async getQuantity(ownerId: string, sticker: StickerRef): Promise<number> {
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizeOwnerId(ownerId));
    const stickerCode = await this.getStickerDbCode(sticker);

    if (!stickerCode) {
      return 0;
    }

    const result = await this.db.query<{ quantity: number }>(
      `SELECT quantity FROM user_album_items
       WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
      [activeAlbumId, stickerCode],
    );

    return result.rows[0]?.quantity ?? 0;
  }

  async getStickerQuantities(ownerId: string): Promise<Record<string, number>> {
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizeOwnerId(ownerId));

    return this.getStickerQuantitiesForAlbum(activeAlbumId);
  }

  async listDuplicateStickers(
    ownerId: string,
    countryCode?: string,
    sticker?: StickerRef,
  ): Promise<DuplicateStickerEntry[]> {
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizeOwnerId(ownerId));

    return this.listDuplicateStickersForAlbum(activeAlbumId, countryCode, sticker);
  }

  async listDuplicateStickersForAlbum(
    albumId: string,
    countryCode?: string,
    sticker?: StickerRef,
  ): Promise<DuplicateStickerEntry[]> {
    const result = await this.db.query<{
      sticker_code: string;
      subject: string;
      team_code: string | null;
      team_name: string | null;
      sticker_number: number;
      quantity: number;
      album_order: number;
    }>(
      `SELECT
         s.code AS sticker_code,
         s.subject,
         t.code AS team_code,
         t.name AS team_name,
         s.sticker_number,
         uai.quantity,
         s.album_order
       FROM user_album_items uai
       JOIN stickers s ON s.code = uai.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE uai.user_album_id = $1
         AND uai.variant_code = 'BASE'
         AND uai.quantity > 1
       ORDER BY s.album_order ASC`,
      [albumId],
    );

    return result.rows
      .map((row) => ({
        sticker: this.rowToStickerRef(row),
        quantity: row.quantity,
      }))
      .filter((entry): entry is DuplicateStickerEntry => Boolean(entry.sticker))
      .filter((entry) => this.matchesStickerFilters(entry.sticker, countryCode, sticker))
      .sort((left, right) => this.compareStickerRefs(left.sticker, right.sticker));
  }

  async adjustQuantity(ownerId: string, sticker: StickerRef, delta: number): Promise<StickerQuantityChange> {
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizeOwnerId(ownerId));
    const stickerCode = await this.getStickerDbCode(sticker);

    if (!stickerCode) {
      // Unknown sticker — treat as no-op
      return {
        sticker,
        previousQuantity: 0,
        currentQuantity: 0,
        changed: false,
      };
    }

    // Get current quantity
    const current = await this.db.query<{ quantity: number }>(
      `SELECT quantity FROM user_album_items
       WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
      [activeAlbumId, stickerCode],
    );

    const previousQuantity = current.rows[0]?.quantity ?? 0;
    const currentQuantity = Math.max(previousQuantity + delta, 0);

    if (currentQuantity === 0) {
      // Delete the row
      await this.db.query(
        `DELETE FROM user_album_items
         WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
        [activeAlbumId, stickerCode],
      );
    } else {
      await this.db.query(
        `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
         VALUES ($1, $2, 'BASE', $3)
         ON CONFLICT (user_album_id, sticker_code, variant_code)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [activeAlbumId, stickerCode, currentQuantity],
      );
    }

    return {
      sticker,
      previousQuantity,
      currentQuantity,
      changed: previousQuantity !== currentQuantity,
    };
  }

  // ---- Bulk sticker add ----

  async bulkAddStickers(
    ownerId: string,
    stickers: StickerRef[],
  ): Promise<StickerQuantityChange[]> {
    const normalizedId = normalizeOwnerId(ownerId);

    return this.db.transaction(async (client) => {
      const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizedId);
      const albumTemplateResult = await client.query<{ album_id: number }>(
        `SELECT album_id FROM user_albums WHERE id = $1`,
        [activeAlbumId],
      );
      const activeAlbumTemplateId = albumTemplateResult.rows[0]?.album_id;

      if (!activeAlbumTemplateId) {
        throw new Error('Album activo invalido.');
      }

      // Resolve collector UUID once (needed for history)
      const collectorRow = await client.query<{ id: string }>(
        `SELECT id FROM collector_profiles WHERE telegram_chat_id = $1`,
        [normalizedId],
      );
      const collectorUuid = collectorRow.rows[0]?.id ?? null;

      // Build per-sticker lookup params (country code, number, country name, special key)
      // and aggregate deltas for duplicates (e.g. ARG7 ARG7 → delta=2)
      const deltaMap = new Map<string, { sticker: StickerRef; delta: number }>();
      for (const sticker of stickers) {
        const key = `${sticker.countryCode.toUpperCase()}:${sticker.number}`;
        const existing = deltaMap.get(key);
        if (existing) {
          existing.delta += 1;
        } else {
          deltaMap.set(key, { sticker, delta: 1 });
        }
      }

      const uniqueEntries = [...deltaMap.values()];

      // Batch-resolve sticker DB codes via unnest
      const codes = uniqueEntries.map((e) => e.sticker.countryCode.toUpperCase());
      const numbers = uniqueEntries.map((e) => e.sticker.number);
      const names = uniqueEntries.map((e) => getCatalogEntry(e.sticker.countryCode)?.name ?? null);
      const stickerLookupCandidates = uniqueEntries.map((e) => buildStickerLookupCandidates(e.sticker));
      const specials = stickerLookupCandidates.map((candidates) => candidates[0]);
      const paddedSpecials = stickerLookupCandidates.map((candidates) => candidates[1] ?? candidates[0]);
      const triplePaddedSpecials = stickerLookupCandidates.map((candidates) => candidates[2] ?? candidates[0]);

      const lookupResult = this.db.dialect === 'pg'
        ? await client.query<{
            idx: number;
            code: string;
          }>(
            `SELECT idx, s.code
             FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) WITH ORDINALITY AS u(country_code, sticker_number, country_name, special_key, padded_special_key, triple_padded_special_key, idx)
             JOIN stickers s ON s.album_id = $7 AND s.sticker_number = u.sticker_number
             LEFT JOIN teams t ON t.id = s.team_id
             WHERE t.code = u.country_code
                OR (u.country_name IS NOT NULL AND upper(t.name) = upper(u.country_name))
                OR upper(s.code) IN (u.special_key, u.padded_special_key, u.triple_padded_special_key)
                OR replace(upper(s.subject), ' ', '') IN (u.special_key, u.padded_special_key, u.triple_padded_special_key)`,
            [codes, numbers, names, specials, paddedSpecials, triplePaddedSpecials, activeAlbumTemplateId],
          )
        : await client.query<{
            idx: number;
            code: string;
          }>(
            `SELECT json_extract(je.value, '$.idx') AS idx, s.code
             FROM json_each($1) AS je
             JOIN stickers s ON s.album_id = $2 AND s.sticker_number = json_extract(je.value, '$.n')
             LEFT JOIN teams t ON t.id = s.team_id
             WHERE t.code = json_extract(je.value, '$.cc')
                OR (json_extract(je.value, '$.name') IS NOT NULL AND upper(t.name) = upper(json_extract(je.value, '$.name')))
                OR upper(s.code) IN (json_extract(je.value, '$.s1'), json_extract(je.value, '$.s2'), json_extract(je.value, '$.s3'))
                OR replace(upper(s.subject), ' ', '') IN (json_extract(je.value, '$.s1'), json_extract(je.value, '$.s2'), json_extract(je.value, '$.s3'))`,
            [
              JSON.stringify(uniqueEntries.map((_e, i) => ({
                idx: i + 1,
                cc: codes[i],
                n: numbers[i],
                name: names[i],
                s1: specials[i],
                s2: paddedSpecials[i],
                s3: triplePaddedSpecials[i],
              }))),
              activeAlbumTemplateId,
            ],
          );

      // Map idx (1-based) → sticker DB code; keep first match per idx
      const idxToCode = new Map<number, string>();
      for (const row of lookupResult.rows) {
        const idx = Number(row.idx);

        if (!idxToCode.has(idx)) {
          idxToCode.set(idx, row.code);
        }
      }

      // Separate known from unknown
      const known: Array<{ sticker: StickerRef; dbCode: string; delta: number }> = [];
      const unknown: StickerRef[] = [];
      uniqueEntries.forEach((entry, i) => {
        const dbCode = idxToCode.get(i + 1);
        if (dbCode) {
          known.push({ sticker: entry.sticker, dbCode, delta: entry.delta });
        } else {
          unknown.push(entry.sticker);
        }
      });

      // Fetch current quantities for known stickers in one query
      const knownCodes = known.map((k) => k.dbCode);
      const currentQtyResult = await client.query<{ sticker_code: string; quantity: number }>(
        `SELECT sticker_code, quantity
         FROM user_album_items
         WHERE user_album_id = $1 AND sticker_code = ANY($2::text[]) AND variant_code = 'BASE'`,
        [activeAlbumId, knownCodes],
      );
      const currentQtyMap = new Map<string, number>();
      for (const row of currentQtyResult.rows) {
        currentQtyMap.set(row.sticker_code, row.quantity);
      }

      // Compute new quantities
      const toUpsert: Array<{ dbCode: string; newQty: number }> = [];
      const toDelete: string[] = [];
      const changes: Array<StickerQuantityChange & { dbCode: string }> = [];

      for (const item of known) {
        const prev = currentQtyMap.get(item.dbCode) ?? 0;
        const next = Math.max(prev + item.delta, 0);

        changes.push({
          sticker: item.sticker,
          previousQuantity: prev,
          currentQuantity: next,
          changed: prev !== next,
          dbCode: item.dbCode,
        });

        if (next === 0) {
          toDelete.push(item.dbCode);
        } else {
          toUpsert.push({ dbCode: item.dbCode, newQty: next });
        }
      }

      // Batch upsert
      if (toUpsert.length > 0) {
        if (this.db.dialect === 'pg') {
          await client.query(
            `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
             SELECT $1, u.code, 'BASE', u.qty
             FROM unnest($2::text[], $3::int[]) AS u(code, qty)
             ON CONFLICT (user_album_id, sticker_code, variant_code)
             DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
            [
              activeAlbumId,
              toUpsert.map((r) => r.dbCode),
              toUpsert.map((r) => r.newQty),
            ],
          );
        } else {
          await client.query(
            `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
             SELECT $1, json_extract(je.value, '$.c'), 'BASE', json_extract(je.value, '$.q')
             FROM json_each($2) AS je
             WHERE true
             ON CONFLICT (user_album_id, sticker_code, variant_code)
             DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = datetime('now')`,
            [
              activeAlbumId,
              JSON.stringify(toUpsert.map((r) => ({ c: r.dbCode, q: r.newQty }))),
            ],
          );
        }
      }

      // Batch delete (quantity reached 0)
      if (toDelete.length > 0) {
        await client.query(
          `DELETE FROM user_album_items
           WHERE user_album_id = $1 AND sticker_code = ANY($2::text[]) AND variant_code = 'BASE'`,
          [activeAlbumId, toDelete],
        );
      }

      // Batch history insert — only for rows that actually changed
      const changedRows = changes.filter((c) => c.changed);
      if (collectorUuid && changedRows.length > 0) {
        if (this.db.dialect === 'pg') {
          await client.query(
            `INSERT INTO user_album_events
               (user_album_id, collector_id, sticker_code, variant_code, action, previous_quantity, current_quantity, quantity_delta)
             SELECT $1, $2, u.code, 'BASE', 'add', u.prev, u.curr, u.curr - u.prev
             FROM unnest($3::text[], $4::int[], $5::int[]) AS u(code, prev, curr)`,
            [
              activeAlbumId,
              collectorUuid,
              changedRows.map((c) => c.dbCode),
              changedRows.map((c) => c.previousQuantity),
              changedRows.map((c) => c.currentQuantity),
            ],
          );
        } else {
          await client.query(
            `INSERT INTO user_album_events
               (user_album_id, collector_id, sticker_code, variant_code, action, previous_quantity, current_quantity, quantity_delta)
             SELECT $1, $2, json_extract(je.value, '$.c'), 'BASE', 'add', json_extract(je.value, '$.p'), json_extract(je.value, '$.n'), json_extract(je.value, '$.n') - json_extract(je.value, '$.p')
             FROM json_each($3) AS je`,
            [
              activeAlbumId,
              collectorUuid,
              JSON.stringify(changedRows.map((c) => ({ c: c.dbCode, p: c.previousQuantity, n: c.currentQuantity }))),
            ],
          );
        }
      }

      // Build final result: unknown stickers as no-op changes
      const unknownChanges: StickerQuantityChange[] = unknown.map((s) => ({
        sticker: s,
        previousQuantity: 0,
        currentQuantity: 0,
        changed: false,
      }));

      return [
        ...changes.map(({ dbCode: _dbCode, ...rest }) => rest),
        ...unknownChanges,
      ];
    });
  }

  // ---- Bulk sticker remove ----

  async bulkRemoveStickers(
    ownerId: string,
    stickers: StickerRef[],
  ): Promise<StickerQuantityChange[]> {
    const normalizedId = normalizeOwnerId(ownerId);

    return this.db.transaction(async (client) => {
      const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizedId);
      const albumTemplateResult = await client.query<{ album_id: number }>(
        `SELECT album_id FROM user_albums WHERE id = $1`,
        [activeAlbumId],
      );
      const activeAlbumTemplateId = albumTemplateResult.rows[0]?.album_id;

      if (!activeAlbumTemplateId) {
        throw new Error('Album activo invalido.');
      }

      const collectorRow = await client.query<{ id: string }>(
        `SELECT id FROM collector_profiles WHERE telegram_chat_id = $1`,
        [normalizedId],
      );
      const collectorUuid = collectorRow.rows[0]?.id ?? null;

      const deltaMap = new Map<string, { sticker: StickerRef; delta: number }>();
      for (const sticker of stickers) {
        const key = `${sticker.countryCode.toUpperCase()}:${sticker.number}`;
        const existing = deltaMap.get(key);
        if (existing) {
          existing.delta -= 1;
        } else {
          deltaMap.set(key, { sticker, delta: -1 });
        }
      }

      const uniqueEntries = [...deltaMap.values()];

      const codes = uniqueEntries.map((e) => e.sticker.countryCode.toUpperCase());
      const numbers = uniqueEntries.map((e) => e.sticker.number);
      const names = uniqueEntries.map((e) => getCatalogEntry(e.sticker.countryCode)?.name ?? null);
      const stickerLookupCandidates = uniqueEntries.map((e) => buildStickerLookupCandidates(e.sticker));
      const specials = stickerLookupCandidates.map((candidates) => candidates[0]);
      const paddedSpecials = stickerLookupCandidates.map((candidates) => candidates[1] ?? candidates[0]);
      const triplePaddedSpecials = stickerLookupCandidates.map((candidates) => candidates[2] ?? candidates[0]);

      const lookupResult = this.db.dialect === 'pg'
        ? await client.query<{
            idx: number;
            code: string;
          }>(
            `SELECT idx, s.code
             FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) WITH ORDINALITY AS u(country_code, sticker_number, country_name, special_key, padded_special_key, triple_padded_special_key, idx)
             JOIN stickers s ON s.album_id = $7 AND s.sticker_number = u.sticker_number
             LEFT JOIN teams t ON t.id = s.team_id
             WHERE t.code = u.country_code
                OR (u.country_name IS NOT NULL AND upper(t.name) = upper(u.country_name))
                OR upper(s.code) IN (u.special_key, u.padded_special_key, u.triple_padded_special_key)
                OR replace(upper(s.subject), ' ', '') IN (u.special_key, u.padded_special_key, u.triple_padded_special_key)`,
            [codes, numbers, names, specials, paddedSpecials, triplePaddedSpecials, activeAlbumTemplateId],
          )
        : await client.query<{
            idx: number;
            code: string;
          }>(
            `SELECT json_extract(je.value, '$.idx') AS idx, s.code
             FROM json_each($1) AS je
             JOIN stickers s ON s.album_id = $2 AND s.sticker_number = json_extract(je.value, '$.n')
             LEFT JOIN teams t ON t.id = s.team_id
             WHERE t.code = json_extract(je.value, '$.cc')
                OR (json_extract(je.value, '$.name') IS NOT NULL AND upper(t.name) = upper(json_extract(je.value, '$.name')))
                OR upper(s.code) IN (json_extract(je.value, '$.s1'), json_extract(je.value, '$.s2'), json_extract(je.value, '$.s3'))
                OR replace(upper(s.subject), ' ', '') IN (json_extract(je.value, '$.s1'), json_extract(je.value, '$.s2'), json_extract(je.value, '$.s3'))`,
            [
              JSON.stringify(uniqueEntries.map((_e, i) => ({
                idx: i + 1,
                cc: codes[i],
                n: numbers[i],
                name: names[i],
                s1: specials[i],
                s2: paddedSpecials[i],
                s3: triplePaddedSpecials[i],
              }))),
              activeAlbumTemplateId,
            ],
          );

      const idxToCode = new Map<number, string>();
      for (const row of lookupResult.rows) {
        const idx = Number(row.idx);

        if (!idxToCode.has(idx)) {
          idxToCode.set(idx, row.code);
        }
      }

      const known: Array<{ sticker: StickerRef; dbCode: string; delta: number }> = [];
      const unknown: StickerRef[] = [];
      uniqueEntries.forEach((entry, i) => {
        const dbCode = idxToCode.get(i + 1);
        if (dbCode) {
          known.push({ sticker: entry.sticker, dbCode, delta: entry.delta });
        } else {
          unknown.push(entry.sticker);
        }
      });

      const knownCodes = known.map((k) => k.dbCode);
      const currentQtyResult = await client.query<{ sticker_code: string; quantity: number }>(
        `SELECT sticker_code, quantity
         FROM user_album_items
         WHERE user_album_id = $1 AND sticker_code = ANY($2::text[]) AND variant_code = 'BASE'`,
        [activeAlbumId, knownCodes],
      );
      const currentQtyMap = new Map<string, number>();
      for (const row of currentQtyResult.rows) {
        currentQtyMap.set(row.sticker_code, row.quantity);
      }

      const toUpsert: Array<{ dbCode: string; newQty: number }> = [];
      const toDelete: string[] = [];
      const changes: Array<StickerQuantityChange & { dbCode: string }> = [];

      for (const item of known) {
        const prev = currentQtyMap.get(item.dbCode) ?? 0;
        const next = Math.max(prev + item.delta, 0);

        changes.push({
          sticker: item.sticker,
          previousQuantity: prev,
          currentQuantity: next,
          changed: prev !== next,
          dbCode: item.dbCode,
        });

        if (next === 0) {
          toDelete.push(item.dbCode);
        } else {
          toUpsert.push({ dbCode: item.dbCode, newQty: next });
        }
      }

      if (toUpsert.length > 0) {
        if (this.db.dialect === 'pg') {
          await client.query(
            `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
             SELECT $1, u.code, 'BASE', u.qty
             FROM unnest($2::text[], $3::int[]) AS u(code, qty)
             ON CONFLICT (user_album_id, sticker_code, variant_code)
             DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
            [
              activeAlbumId,
              toUpsert.map((r) => r.dbCode),
              toUpsert.map((r) => r.newQty),
            ],
          );
        } else {
          await client.query(
            `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
             SELECT $1, json_extract(je.value, '$.c'), 'BASE', json_extract(je.value, '$.q')
             FROM json_each($2) AS je
             WHERE true
             ON CONFLICT (user_album_id, sticker_code, variant_code)
             DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = datetime('now')`,
            [
              activeAlbumId,
              JSON.stringify(toUpsert.map((r) => ({ c: r.dbCode, q: r.newQty }))),
            ],
          );
        }
      }

      if (toDelete.length > 0) {
        await client.query(
          `DELETE FROM user_album_items
           WHERE user_album_id = $1 AND sticker_code = ANY($2::text[]) AND variant_code = 'BASE'`,
          [activeAlbumId, toDelete],
        );
      }

      const changedRows = changes.filter((c) => c.changed);
      if (collectorUuid && changedRows.length > 0) {
        if (this.db.dialect === 'pg') {
          await client.query(
            `INSERT INTO user_album_events
               (user_album_id, collector_id, sticker_code, variant_code, action, previous_quantity, current_quantity, quantity_delta)
             SELECT $1, $2, u.code, 'BASE', 'remove', u.prev, u.curr, u.curr - u.prev
             FROM unnest($3::text[], $4::int[], $5::int[]) AS u(code, prev, curr)`,
            [
              activeAlbumId,
              collectorUuid,
              changedRows.map((c) => c.dbCode),
              changedRows.map((c) => c.previousQuantity),
              changedRows.map((c) => c.currentQuantity),
            ],
          );
        } else {
          await client.query(
            `INSERT INTO user_album_events
               (user_album_id, collector_id, sticker_code, variant_code, action, previous_quantity, current_quantity, quantity_delta)
             SELECT $1, $2, json_extract(je.value, '$.c'), 'BASE', 'remove', json_extract(je.value, '$.p'), json_extract(je.value, '$.n'), json_extract(je.value, '$.n') - json_extract(je.value, '$.p')
             FROM json_each($3) AS je`,
            [
              activeAlbumId,
              collectorUuid,
              JSON.stringify(changedRows.map((c) => ({ c: c.dbCode, p: c.previousQuantity, n: c.currentQuantity }))),
            ],
          );
        }
      }

      const unknownChanges: StickerQuantityChange[] = unknown.map((s) => ({
        sticker: s,
        previousQuantity: 0,
        currentQuantity: 0,
        changed: false,
      }));

      return [
        ...changes.map(({ dbCode: _dbCode, ...rest }) => rest),
        ...unknownChanges,
      ];
    });
  }

  async recordHistory(ownerId: string, entry: StickerHistoryEntry): Promise<void> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizedOwnerId);
    const collectorUuid = await this.getCollectorUUID(normalizedOwnerId);
    const stickerCode = await this.getStickerDbCode(entry.sticker);

    if (!stickerCode) {
      return;
    }

    await this.db.query(
      `INSERT INTO user_album_events
         (user_album_id, collector_id, sticker_code, variant_code, action, previous_quantity, current_quantity, quantity_delta)
       VALUES ($1, $2, $3, 'BASE', $4, $5, $6, $7)`,
      [
        activeAlbumId,
        collectorUuid,
        stickerCode,
        entry.action,
        entry.previousQuantity,
        entry.currentQuantity,
        entry.currentQuantity - entry.previousQuantity,
      ],
    );
  }

  async undoLast(ownerId: string): Promise<StickerHistoryEntry | null> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumIdOrThrow(normalizedOwnerId);
    const collectorUuid = await this.getCollectorUUID(normalizedOwnerId);

    // Get last event for this collector in this album
    const eventResult = await this.db.query<Record<string, unknown>>(
      `SELECT e.id, e.sticker_code, e.action, e.previous_quantity, e.current_quantity, e.created_at,
              t.code AS team_code, t.name AS team_name, s.sticker_number, s.subject
       FROM user_album_events e
       JOIN stickers s ON s.code = e.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE e.user_album_id = $1 AND e.collector_id = $2
       ORDER BY e.id DESC
       LIMIT 1`,
      [activeAlbumId, collectorUuid],
    );

    if (!eventResult.rows[0]) {
      return null;
    }

    const eventRow = eventResult.rows[0];
    const eventId = eventRow.id as number;
    const stickerCode = eventRow.sticker_code as string;
    const teamCode = eventRow.team_code as string | null;
    const teamName = eventRow.team_name as string | null;
    const stickerNumber = eventRow.sticker_number as number | null;
    const subject = eventRow.subject as string | null;
    const countryCode = this.toCatalogCountryCode(teamCode, teamName, stickerCode, subject);

    if (!countryCode || stickerNumber === null || stickerNumber === undefined) {
      await this.db.query(`DELETE FROM user_album_events WHERE id = $1`, [eventId]);

      return null;
    }

    const sticker: StickerRef = { countryCode, number: stickerNumber };
    const previousQuantity = eventRow.previous_quantity as number;
    const currentQuantity = eventRow.current_quantity as number;
    const action = eventRow.action as StickerHistoryAction;
    const timestamp = toIso(eventRow.created_at);

    // Restore previous quantity
    if (previousQuantity === 0) {
      await this.db.query(
        `DELETE FROM user_album_items
         WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
        [activeAlbumId, stickerCode],
      );
    } else {
      await this.db.query(
        `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
         VALUES ($1, $2, 'BASE', $3)
         ON CONFLICT (user_album_id, sticker_code, variant_code)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [activeAlbumId, stickerCode, previousQuantity],
      );
    }

    // Delete the event
    await this.db.query(`DELETE FROM user_album_events WHERE id = $1`, [eventId]);

    return {
      action,
      sticker,
      previousQuantity,
      currentQuantity,
      timestamp,
    };
  }

  // ---- Friends ----

  async listFriendOverview(ownerId: string): Promise<FriendOverview> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const collectorUuid = await this.getCollectorUUID(normalizedOwnerId);

    if (!collectorUuid) {
      return { friends: [], incomingRequests: [], outgoingRequests: [] };
    }

    const friendsResult = await this.db.query<Record<string, unknown>>(
      `SELECT cp.*, cf.created_at AS friends_since
       FROM collector_friends cf
       JOIN collector_profiles cp ON cp.id = cf.friend_collector_id
       WHERE cf.collector_id = $1
       ORDER BY cp.display_name`,
      [collectorUuid],
    );

    const pendingResult = await this.db.query<Record<string, unknown>>(
      `SELECT fr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              from_cp.telegram_username AS from_telegram_username,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM friend_requests fr
       JOIN collector_profiles from_cp ON from_cp.id = fr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = fr.to_collector_id
       WHERE fr.status = 'pending'
         AND (fr.from_collector_id = $1 OR fr.to_collector_id = $1)
       ORDER BY fr.created_at DESC`,
      [collectorUuid],
    );

    return {
      friends: friendsResult.rows.map((row) => ({
        ...rowToStoredProfile(row),
        friendsSince: toIso(row.friends_since),
      })),
      incomingRequests: pendingResult.rows
        .filter((row) => row.to_collector_id === collectorUuid)
        .map(rowToFriendRequest),
      outgoingRequests: pendingResult.rows
        .filter((row) => row.from_collector_id === collectorUuid)
        .map(rowToFriendRequest),
    };
  }

  async listFriendDuplicateInventories(
    ownerId: string,
  ): Promise<Array<{ ownerId: string; displayName?: string; quantities: Record<string, number> }>> {
    const result = await this.db.query<{
      friend_owner_id: string;
      friend_display_name: string | null;
      sticker_code: string;
      subject: string;
      sticker_number: number;
      team_code: string | null;
      team_name: string | null;
      quantity: number;
    }>(
      `SELECT
         cp_friend.telegram_chat_id AS friend_owner_id,
         cp_friend.display_name AS friend_display_name,
         s.code AS sticker_code, s.subject, s.sticker_number,
         t.code AS team_code, t.name AS team_name,
         uai.quantity
       FROM collector_profiles cp_owner
       JOIN collector_friends cf ON cf.collector_id = cp_owner.id
       JOIN collector_profiles cp_friend ON cp_friend.id = cf.friend_collector_id
       JOIN collector_active_albums caa ON caa.collector_id = cp_friend.id
       JOIN user_albums ua ON ua.id = caa.user_album_id AND ua.deleted_at IS NULL
       JOIN user_album_members uam
         ON uam.user_album_id = ua.id
         AND uam.collector_id = cp_friend.id
         AND uam.left_at IS NULL
       JOIN user_album_items uai
         ON uai.user_album_id = ua.id
         AND uai.variant_code = 'BASE'
         AND uai.quantity > 1
       JOIN stickers s ON s.code = uai.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE cp_owner.telegram_chat_id = $1
       ORDER BY cp_friend.display_name NULLS LAST, cp_friend.telegram_chat_id, s.sticker_number`,
      [normalizeOwnerId(ownerId)],
    );

    const byFriend = new Map<string, { ownerId: string; displayName?: string; quantities: Record<string, number> }>();

    for (const row of result.rows) {
      let entry = byFriend.get(row.friend_owner_id);

      if (!entry) {
        entry = {
          ownerId: row.friend_owner_id,
          displayName: row.friend_display_name ?? undefined,
          quantities: {},
        };
        byFriend.set(row.friend_owner_id, entry);
      }

      const sticker = this.rowToStickerRef(row);

      if (sticker) {
        entry.quantities[stickerKey(sticker)] = row.quantity;
      }
    }

    return [...byFriend.values()];
  }

  async listFriendDuplicateStickers(
    ownerId: string,
    countryCode?: string,
    sticker?: StickerRef,
  ): Promise<FriendDuplicateStickerGroup[]> {
    const result = await this.db.query<{
      friend_owner_id: string;
      friend_display_name: string | null;
      sticker_code: string;
      subject: string;
      sticker_number: number;
      team_code: string | null;
      team_name: string | null;
      quantity: number;
      album_order: number;
    }>(
      `SELECT
         cp_friend.telegram_chat_id AS friend_owner_id,
         cp_friend.display_name AS friend_display_name,
         s.code AS sticker_code,
         s.subject,
         s.sticker_number,
         t.code AS team_code,
         t.name AS team_name,
         uai.quantity,
         s.album_order
       FROM collector_profiles cp_owner
       JOIN collector_friends cf ON cf.collector_id = cp_owner.id
       JOIN collector_profiles cp_friend ON cp_friend.id = cf.friend_collector_id
       JOIN collector_active_albums caa ON caa.collector_id = cp_friend.id
       JOIN user_albums ua ON ua.id = caa.user_album_id AND ua.deleted_at IS NULL
       JOIN user_album_members uam
         ON uam.user_album_id = ua.id
         AND uam.collector_id = cp_friend.id
         AND uam.left_at IS NULL
       JOIN user_album_items uai
         ON uai.user_album_id = ua.id
         AND uai.variant_code = 'BASE'
         AND uai.quantity > 1
       JOIN stickers s ON s.code = uai.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE cp_owner.telegram_chat_id = $1
       ORDER BY cp_friend.display_name NULLS LAST, cp_friend.telegram_chat_id, s.album_order`,
      [normalizeOwnerId(ownerId)],
    );

    const byFriend = new Map<string, FriendDuplicateStickerGroup>();

    for (const row of result.rows) {
      const mappedSticker = this.rowToStickerRef(row);

      if (!mappedSticker || !this.matchesStickerFilters(mappedSticker, countryCode, sticker)) {
        continue;
      }

      let entry = byFriend.get(row.friend_owner_id);

      if (!entry) {
        entry = {
          ownerId: row.friend_owner_id,
          displayName: row.friend_display_name ?? undefined,
          duplicates: [],
        };
        byFriend.set(row.friend_owner_id, entry);
      }

      entry.duplicates.push({
        sticker: mappedSticker,
        quantity: row.quantity,
      });
    }

    for (const group of byFriend.values()) {
      group.duplicates.sort((left, right) => this.compareStickerRefs(left.sticker, right.sticker));
    }

    return [...byFriend.values()];
  }

  async listCompareCandidates(
    sourceAlbumId: string,
    targetAlbumId: string,
    countryCode?: string,
  ): Promise<CompareCandidate[]> {
    const result = await this.db.query<{
      sticker_code: string;
      subject: string;
      team_code: string | null;
      team_name: string | null;
      sticker_number: number;
      quantity: number;
      album_order: number;
    }>(
      `SELECT
         s.code AS sticker_code,
         s.subject,
         t.code AS team_code,
         t.name AS team_name,
         s.sticker_number,
         source_items.quantity,
         s.album_order
       FROM user_album_items source_items
       JOIN stickers s ON s.code = source_items.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       LEFT JOIN user_album_items target_items
         ON target_items.user_album_id = $2
         AND target_items.sticker_code = source_items.sticker_code
         AND target_items.variant_code = 'BASE'
         AND target_items.quantity > 0
       WHERE source_items.user_album_id = $1
         AND source_items.variant_code = 'BASE'
         AND source_items.quantity > 1
         AND target_items.sticker_code IS NULL
       ORDER BY s.album_order ASC`,
      [sourceAlbumId, targetAlbumId],
    );

    return result.rows
      .map((row) => ({
        sticker: this.rowToStickerRef(row),
        extraCount: row.quantity - 1,
      }))
      .filter((entry): entry is CompareCandidate => Boolean(entry.sticker))
      .filter((entry) => !countryCode || entry.sticker.countryCode === countryCode)
      .sort((left, right) => this.compareStickerRefs(left.sticker, right.sticker));
  }

  async listFriendOwnerIds(ownerId: string): Promise<string[]> {
    const collectorUuid = await this.getCollectorUUID(normalizeOwnerId(ownerId));

    if (!collectorUuid) {
      return [];
    }

    const result = await this.db.query<{ telegram_chat_id: string }>(
      `SELECT cp.telegram_chat_id
       FROM collector_friends cf
       JOIN collector_profiles cp ON cp.id = cf.friend_collector_id
       WHERE cf.collector_id = $1`,
      [collectorUuid],
    );

    return result.rows.map((row) => row.telegram_chat_id);
  }

  async areFriends(leftOwnerId: string, rightOwnerId: string): Promise<boolean> {
    const leftUuid = await this.getCollectorUUID(normalizeOwnerId(leftOwnerId));
    const rightUuid = await this.getCollectorUUID(normalizeOwnerId(rightOwnerId));

    if (!leftUuid || !rightUuid) {
      return false;
    }

    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM collector_friends
       WHERE collector_id = $1 AND friend_collector_id = $2`,
      [leftUuid, rightUuid],
    );

    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async createFriendRequest(
    fromOwnerId: string,
    targetUsername: string,
  ): Promise<{ request?: FriendRequest; targetProfile?: StoredProfile; error?: string }> {
    const normalizedFromOwnerId = normalizeOwnerId(fromOwnerId);
    const normalizedTargetUsername = targetUsername.replace(/^@/, '').toLowerCase();
    const targetProfile = await this.findProfileByUsername(normalizedTargetUsername);

    if (!targetProfile) {
      return { error: `No conozco a @${normalizedTargetUsername}. Esa persona debe abrir el bot y mandar /start primero.` };
    }

    if (targetProfile.ownerId === normalizedFromOwnerId) {
      return { error: 'No puedes agregarte como amigo.' };
    }

    const fromUuid = await this.getOrCreateCollectorUUID(normalizedFromOwnerId);
    const toUuid = await this.getCollectorUUID(targetProfile.ownerId);

    if (!toUuid) {
      return { error: `No conozco a @${normalizedTargetUsername}. Esa persona debe abrir el bot y mandar /start primero.` };
    }

    if (await this.areFriends(normalizedFromOwnerId, targetProfile.ownerId)) {
      return { error: `Ya eres amigo de @${normalizedTargetUsername}.` };
    }

    const existingPending = await this.db.query<Record<string, unknown>>(
      `SELECT fr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              from_cp.telegram_username AS from_telegram_username,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM friend_requests fr
       JOIN collector_profiles from_cp ON from_cp.id = fr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = fr.to_collector_id
       WHERE fr.status = 'pending'
         AND (
           (fr.from_collector_id = $1 AND fr.to_collector_id = $2)
           OR (fr.from_collector_id = $2 AND fr.to_collector_id = $1)
         )
       LIMIT 1`,
      [fromUuid, toUuid],
    );

    if (existingPending.rows[0]) {
      const request = rowToFriendRequest(existingPending.rows[0]);

      if (request.fromOwnerId === normalizedFromOwnerId) {
        return { request, targetProfile };
      }

      return { error: `@${normalizedTargetUsername} ya te envio una solicitud. Aceptala desde el mensaje que recibiste.` };
    }

    const insertResult = await this.db.query<Record<string, unknown>>(
      `INSERT INTO friend_requests (id, from_collector_id, to_collector_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [randomUUID(), fromUuid, toUuid],
    );

    const requestResult = await this.getFriendRequestRow(insertResult.rows[0].id as string);

    return {
      request: requestResult ? rowToFriendRequest(requestResult) : undefined,
      targetProfile,
    };
  }

  async acceptFriendRequest(
    requestId: string,
    responderOwnerId: string,
  ): Promise<{ request?: FriendRequest; fromProfile?: StoredProfile; error?: string }> {
    const result = await this.answerFriendRequest(requestId, responderOwnerId, 'accepted');

    if (result.error || !result.row) {
      return { error: result.error };
    }

    await this.db.query(
      `INSERT INTO collector_friends (collector_id, friend_collector_id)
       VALUES ($1, $2), ($2, $1)
       ON CONFLICT (collector_id, friend_collector_id) DO NOTHING`,
      [result.row.from_collector_id, result.row.to_collector_id],
    );

    return {
      request: rowToFriendRequest(result.row),
      fromProfile: await this.getProfile(result.row.from_telegram_chat_id as string),
    };
  }

  async declineFriendRequest(
    requestId: string,
    responderOwnerId: string,
  ): Promise<{ request?: FriendRequest; fromProfile?: StoredProfile; error?: string }> {
    const result = await this.answerFriendRequest(requestId, responderOwnerId, 'declined');

    if (result.error || !result.row) {
      return { error: result.error };
    }

    return {
      request: rowToFriendRequest(result.row),
      fromProfile: await this.getProfile(result.row.from_telegram_chat_id as string),
    };
  }

  async removeFriend(
    ownerId: string,
    targetUsername: string,
  ): Promise<{ friend?: StoredProfile; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const normalizedTargetUsername = targetUsername.replace(/^@/, '').toLowerCase();
    const targetProfile = await this.findProfileByUsername(normalizedTargetUsername);

    if (!targetProfile) {
      return { error: `No conozco a @${normalizedTargetUsername}. Esa persona debe abrir el bot y mandar /start primero.` };
    }

    const ownerUuid = await this.getCollectorUUID(normalizedOwnerId);
    const targetUuid = await this.getCollectorUUID(targetProfile.ownerId);

    if (!ownerUuid || !targetUuid) {
      return { error: `No eres amigo de @${normalizedTargetUsername}.` };
    }

    const deleteResult = await this.db.query(
      `DELETE FROM collector_friends
       WHERE (collector_id = $1 AND friend_collector_id = $2)
          OR (collector_id = $2 AND friend_collector_id = $1)`,
      [ownerUuid, targetUuid],
    );

    if ((deleteResult.rowCount ?? 0) === 0) {
      return { error: `No eres amigo de @${normalizedTargetUsername}.` };
    }

    await this.db.query(
      `UPDATE friend_requests
       SET status = 'cancelled', answered_at = now()
       WHERE status = 'pending'
         AND (
           (from_collector_id = $1 AND to_collector_id = $2)
           OR (from_collector_id = $2 AND to_collector_id = $1)
         )`,
      [ownerUuid, targetUuid],
    );

    return { friend: targetProfile };
  }

  // ---- Share requests ----

  async createShareRequest(
    fromOwnerId: string,
    targetUsername: string,
  ): Promise<{ request?: ShareRequest; error?: string }> {
    const normalizedFromOwnerId = normalizeOwnerId(fromOwnerId);
    const normalizedTargetUsername = targetUsername.replace(/^@/, '').toLowerCase();

    // Find target profile
    const toProfile = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM collector_profiles WHERE telegram_username = $1`,
      [normalizedTargetUsername],
    );

    if (!toProfile.rows[0]) {
      return {
        error: `No conozco a @${normalizedTargetUsername}. Esa persona debe abrir el bot y mandar /start primero.`,
      };
    }

    const toOwnerId = toProfile.rows[0].telegram_chat_id as string;

    if (toOwnerId === normalizedFromOwnerId) {
      return { error: 'No puedes compartir el album contigo mismo.' };
    }

    // Get active album for fromOwner
    const activeAlbumId = await this.getActiveAlbumId(normalizedFromOwnerId);

    if (!activeAlbumId) {
      return { error: 'No hay album activo.' };
    }

    // Check if target is already a member
    const memberCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM user_album_members uam
       JOIN collector_profiles cp ON cp.id = uam.collector_id AND cp.telegram_chat_id = $1
       WHERE uam.user_album_id = $2 AND uam.left_at IS NULL`,
      [toOwnerId, activeAlbumId],
    );

    if (Number(memberCheck.rows[0]?.count ?? 0) > 0) {
      return { error: `Ya compartes album con @${normalizedTargetUsername}.` };
    }

    const fromUuid = await this.getOrCreateCollectorUUID(normalizedFromOwnerId);
    const toUuid = toProfile.rows[0].id as string;

    // Check for existing pending request
    const existingRequest = await this.db.query<Record<string, unknown>>(
      `SELECT asr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM album_share_requests asr
       JOIN collector_profiles from_cp ON from_cp.id = asr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = asr.to_collector_id
       WHERE asr.user_album_id = $1
         AND asr.from_collector_id = $2
         AND asr.to_collector_id = $3
         AND asr.status = 'pending'`,
      [activeAlbumId, fromUuid, toUuid],
    );

    if (existingRequest.rows[0]) {
      return { request: rowToShareRequest(existingRequest.rows[0]) };
    }

    // Create new request
    const insertResult = await this.db.query<Record<string, unknown>>(
      `INSERT INTO album_share_requests (id, user_album_id, from_collector_id, to_collector_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [randomUUID(), activeAlbumId, fromUuid, toUuid],
    );

    const row = insertResult.rows[0];

    const shareRequest: ShareRequest = {
      id: row.id as string,
      fromOwnerId: normalizedFromOwnerId,
      toOwnerId: toOwnerId,
      targetUsername: normalizedTargetUsername,
      collectionId: activeAlbumId,
      status: 'pending',
      createdAt: toIso(row.created_at),
    };

    return { request: shareRequest };
  }

  async acceptShareRequest(
    requestId: string,
    responderOwnerId: string,
  ): Promise<{ request?: ShareRequest; fromProfile?: StoredProfile; error?: string }> {
    if (!isUuid(requestId)) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    const normalizedResponderOwnerId = normalizeOwnerId(responderOwnerId);

    const requestResult = await this.db.query<Record<string, unknown>>(
      `SELECT asr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM album_share_requests asr
       JOIN collector_profiles from_cp ON from_cp.id = asr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = asr.to_collector_id
       WHERE asr.id = $1`,
      [requestId],
    );

    if (!requestResult.rows[0]) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    const row = requestResult.rows[0];

    if ((row.to_telegram_chat_id as string) !== normalizedResponderOwnerId) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    if ((row.status as string) !== 'pending') {
      return { error: 'Esta solicitud ya fue respondida.' };
    }

    const collectionId = row.user_album_id as string;

    // Check source album still exists
    const albumCheck = await this.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM user_albums WHERE id = $1 AND deleted_at IS NULL`,
      [collectionId],
    );

    if (!albumCheck.rows[0]) {
      return { error: 'Album no encontrado.' };
    }

    // Check from_collector is still a member
    const fromMemberCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM user_album_members
       WHERE user_album_id = $1 AND collector_id = $2 AND left_at IS NULL`,
      [collectionId, row.from_collector_id],
    );

    if (Number(fromMemberCheck.rows[0]?.count ?? 0) === 0) {
      return { error: 'Album no encontrado.' };
    }

    const toCollectorId = row.to_collector_id as string;

    // Merge sticker quantities from the responder's current album into the shared album
    const responderActiveAlbumId = await this.getActiveAlbumId(normalizedResponderOwnerId);

    if (responderActiveAlbumId && responderActiveAlbumId !== collectionId) {
      // Check if the responder's current album is owned by them
      const responderAlbumCheck = await this.db.query<{ owner_id: string }>(
        `SELECT owner_id FROM user_albums WHERE id = $1 AND deleted_at IS NULL`,
        [responderActiveAlbumId],
      );

      if (responderAlbumCheck.rows[0] && responderAlbumCheck.rows[0].owner_id === toCollectorId) {
        // Merge: take max of each sticker quantity
        await this.db.query(
          `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
           SELECT $1, src.sticker_code, src.variant_code, src.quantity
           FROM user_album_items src
           WHERE src.user_album_id = $2 AND src.variant_code = 'BASE'
           ON CONFLICT (user_album_id, sticker_code, variant_code) DO UPDATE
             SET quantity = GREATEST(user_album_items.quantity, EXCLUDED.quantity),
                 updated_at = now()`,
          [collectionId, responderActiveAlbumId],
        );
      }
    }

    // Add responder as member if not already
    await this.db.query(
      `INSERT INTO user_album_members (user_album_id, collector_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (user_album_id, collector_id) DO UPDATE SET left_at = NULL`,
      [collectionId, toCollectorId],
    );

    // Set active album for responder
    await this.db.query(
      `INSERT INTO collector_active_albums (collector_id, user_album_id)
       VALUES ($1, $2)
       ON CONFLICT (collector_id) DO UPDATE SET user_album_id = EXCLUDED.user_album_id, updated_at = now()`,
      [toCollectorId, collectionId],
    );

    // Update request status
    await this.db.query(
      `UPDATE album_share_requests SET status = 'accepted', answered_at = now() WHERE id = $1`,
      [requestId],
    );

    const fromOwnerId = row.from_telegram_chat_id as string;
    const fromProfile = await this.getProfile(fromOwnerId);

    const shareRequest: ShareRequest = {
      id: requestId,
      fromOwnerId,
      toOwnerId: normalizedResponderOwnerId,
      targetUsername: (row.to_telegram_username as string | null) ?? normalizedResponderOwnerId,
      collectionId,
      status: 'accepted',
      createdAt: toIso(row.created_at),
      respondedAt: new Date().toISOString(),
    };

    return { request: shareRequest, fromProfile };
  }

  async declineShareRequest(
    requestId: string,
    responderOwnerId: string,
  ): Promise<{ request?: ShareRequest; fromProfile?: StoredProfile; error?: string }> {
    if (!isUuid(requestId)) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    const normalizedResponderOwnerId = normalizeOwnerId(responderOwnerId);

    const requestResult = await this.db.query<Record<string, unknown>>(
      `SELECT asr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM album_share_requests asr
       JOIN collector_profiles from_cp ON from_cp.id = asr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = asr.to_collector_id
       WHERE asr.id = $1`,
      [requestId],
    );

    if (!requestResult.rows[0]) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    const row = requestResult.rows[0];

    if ((row.to_telegram_chat_id as string) !== normalizedResponderOwnerId) {
      return { error: 'Solicitud de album compartido no encontrada.' };
    }

    if ((row.status as string) !== 'pending') {
      return { error: 'Esta solicitud ya fue respondida.' };
    }

    await this.db.query(
      `UPDATE album_share_requests SET status = 'declined', answered_at = now() WHERE id = $1`,
      [requestId],
    );

    const fromOwnerId = row.from_telegram_chat_id as string;
    const fromProfile = await this.getProfile(fromOwnerId);

    const shareRequest: ShareRequest = {
      id: requestId,
      fromOwnerId,
      toOwnerId: normalizedResponderOwnerId,
      targetUsername: (row.to_telegram_username as string | null) ?? normalizedResponderOwnerId,
      collectionId: row.user_album_id as string,
      status: 'declined',
      createdAt: toIso(row.created_at),
      respondedAt: new Date().toISOString(),
    };

    return { request: shareRequest, fromProfile };
  }

  async getCollectionSummaryById(collectionId: string): Promise<CollectionSummary | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(uam.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       WHERE ua.id = $1 AND ua.deleted_at IS NULL
       GROUP BY ua.id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name`,
      [collectionId],
    );

    if (!result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    const ownerId = row.owner_telegram_chat_id as string;

    return {
      id: row.id as string,
      albumSlug: row.album_slug as string,
      name: row.name as string,
      ownerId,
      ownerDisplayName: (row.owner_display_name as string | null) ?? undefined,
      memberCount: Number(row.member_count),
      isActive: false,
      isShared: false,
    };
  }

  // ---- Trade offers ----

  async createTradeOffer(
    ownerId: string,
    give: TradeSelector,
    want: TradeSelector,
  ): Promise<{ offer?: TradeOffer; error?: string }> {
    if (give.kind === 'missing' || want.kind === 'duplicate') {
      return { error: 'Trade format: use a sticker or -duplicate to give, and a sticker or -missing to want.' };
    }

    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const activeAlbumId = await this.getActiveAlbumId(normalizedOwnerId);

    if (!activeAlbumId) {
      return { error: 'No active album.' };
    }

    const ownerUuid = await this.getCollectorUUID(normalizedOwnerId);

    if (!ownerUuid) {
      return { error: 'No active album.' };
    }

    const stickers = await this.getStickerQuantitiesForAlbum(activeAlbumId);

    const giveError = this.validateTradeGiveSelector(stickers, give);

    if (giveError) {
      return { error: giveError };
    }

    const wantError = this.validateTradeWantSelector(stickers, want);

    if (wantError) {
      return { error: wantError };
    }

    // Build give/want columns
    const giveKind = give.kind;
    const giveCountryCode = give.kind === 'sticker' ? give.sticker.countryCode : (give.countryCode ?? null);
    const giveStickerNumber = give.kind === 'sticker' ? give.sticker.number : null;
    const wantKind = want.kind;
    const wantCountryCode = want.kind === 'sticker' ? want.sticker.countryCode : (want.countryCode ?? null);
    const wantStickerNumber = want.kind === 'sticker' ? want.sticker.number : null;

    const tradeId = await this.db.transaction(async (client) => {
      const counterRow = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(CAST(SUBSTR(id, 2) AS INTEGER)), 0) + 1 AS next FROM trade_offers WHERE id LIKE 'T%'`,
      );
      const tradeCode = `T${counterRow.rows[0].next}`;

      await client.query(
        `INSERT INTO trade_offers
           (id, owner_id, collection_id, give_kind, give_country_code, give_sticker_number,
            want_kind, want_country_code, want_sticker_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
        [tradeCode, ownerUuid, activeAlbumId, giveKind, giveCountryCode, giveStickerNumber,
          wantKind, wantCountryCode, wantStickerNumber],
      );

      return tradeCode;
    });

    const offer = await this.getTradeOfferById(tradeId);

    return { offer: offer ?? undefined };
  }

  async listTradeOffersForOwner(ownerId: string): Promise<TradeOffer[]> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const ownerUuid = await this.getCollectorUUID(normalizedOwnerId);

    if (!ownerUuid) {
      return [];
    }

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT to_.*,
              owner_cp.telegram_chat_id AS owner_telegram_chat_id,
              reserved_cp.telegram_chat_id AS reserved_by_telegram_chat_id
       FROM trade_offers to_
       JOIN collector_profiles owner_cp ON owner_cp.id = to_.owner_id
       LEFT JOIN collector_profiles reserved_cp ON reserved_cp.id = to_.reserved_by_owner_id
       WHERE to_.owner_id = $1
         AND to_.status NOT IN ('completed', 'cancelled', 'expired')
       ORDER BY to_.created_at DESC`,
      [ownerUuid],
    );

    return result.rows.map(rowToTradeOffer);
  }

  async listMarketplaceTradeOffers(
    viewerOwnerId: string | undefined,
    search: MarketplaceSearch = {},
  ): Promise<TradeOffer[]> {
    const normalizedViewerOwnerId = viewerOwnerId ? normalizeOwnerId(viewerOwnerId) : undefined;
    const viewerActiveAlbumId = normalizedViewerOwnerId
      ? await this.getActiveAlbumId(normalizedViewerOwnerId)
      : undefined;
    const friendOwnerIds = search.friendsOnly && normalizedViewerOwnerId
      ? new Set(await this.listFriendOwnerIds(normalizedViewerOwnerId))
      : undefined;

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT to_.*,
              owner_cp.telegram_chat_id AS owner_telegram_chat_id,
              reserved_cp.telegram_chat_id AS reserved_by_telegram_chat_id
       FROM trade_offers to_
       JOIN collector_profiles owner_cp ON owner_cp.id = to_.owner_id
       LEFT JOIN collector_profiles reserved_cp ON reserved_cp.id = to_.reserved_by_owner_id
       WHERE to_.status = 'active'
       ORDER BY to_.created_at DESC`,
    );

    // Apply filters in memory (validity checks require sticker data)
    const offers = result.rows.map(rowToTradeOffer);
    const filtered: TradeOffer[] = [];

    for (const offer of offers) {
      // Filter by mineOnly or not-mine
      if (search.mineOnly) {
        if (offer.ownerId !== normalizedViewerOwnerId) continue;
      } else {
        if (offer.ownerId === normalizedViewerOwnerId) continue;
        if (viewerActiveAlbumId && offer.collectionId === viewerActiveAlbumId) continue;
      }

      if (friendOwnerIds && !friendOwnerIds.has(offer.ownerId)) continue;

      // Filter by owner username
      if (search.ownerUsername) {
        const ownerProfile = await this.getProfile(offer.ownerId);

        if (ownerProfile?.username !== search.ownerUsername) continue;
      }

      // Check validity
      const valid = await this.isTradeOfferValidById(offer);

      if (!valid) continue;

      // Filter by give/want stickers
      if (search.giveSticker || search.needSticker) {
        const ownerStickers = await this.getStickerQuantitiesForAlbum(offer.collectionId);

        if (search.giveSticker && !this.tradeGiveSelectorCanResolveToSticker(offer.give, search.giveSticker, ownerStickers)) {
          continue;
        }

        if (search.needSticker && !this.tradeNeedSelectorCanResolveToSticker(offer.want, search.needSticker, ownerStickers)) {
          continue;
        }
      }

      filtered.push(offer);
    }

    return filtered;
  }

  async getTradeOffer(tradeId: string): Promise<TradeOffer | null> {
    return this.getTradeOfferById(tradeId.toUpperCase());
  }

  async isTradeOfferCurrentlyValid(tradeId: string): Promise<boolean> {
    const offer = await this.getTradeOfferById(tradeId.toUpperCase());

    if (!offer) return false;

    return this.isTradeOfferValidById(offer);
  }

  async cancelTradeOffer(
    ownerId: string,
    tradeId: string,
  ): Promise<{ offer?: TradeOffer; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const normalizedTradeId = tradeId.toUpperCase();

    const offer = await this.getTradeOfferById(normalizedTradeId);

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active' && offer.status !== 'pending_confirmation') {
      return { error: 'Only active or pending trades can be cancelled.' };
    }

    await this.db.query(
      `UPDATE trade_offers SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
      [normalizedTradeId],
    );

    const updated = await this.getTradeOfferById(normalizedTradeId);

    return { offer: updated ?? undefined };
  }

  async getCompatibleTradePairs(
    tradeId: string,
    takerOwnerId: string,
  ): Promise<{ offer?: TradeOffer; pairs?: TradePair[]; error?: string }> {
    const offer = await this.getTradeOfferById(tradeId.toUpperCase());

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active') {
      return { error: 'This trade is no longer active.' };
    }

    const normalizedTakerOwnerId = normalizeOwnerId(takerOwnerId);

    if (offer.ownerId === normalizedTakerOwnerId) {
      return { error: 'You cannot take your own trade.' };
    }

    const takerActiveAlbumId = await this.getActiveAlbumId(normalizedTakerOwnerId);

    if (!takerActiveAlbumId) {
      return { error: 'No active album.' };
    }

    if (takerActiveAlbumId === offer.collectionId) {
      return { error: 'This trade already belongs to your active shared album.' };
    }

    const valid = await this.isTradeOfferValidById(offer);

    if (!valid) {
      await this.db.query(
        `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
        [offer.id],
      );

      return { error: 'Trade expired.' };
    }

    const pairs = await this.getCompatiblePairs(offer, takerActiveAlbumId);

    if (pairs.length === 0) {
      return { error: 'No compatible sticker pair found right now.' };
    }

    return { offer, pairs };
  }

  async reserveTradeOffer(
    tradeId: string,
    takerOwnerId: string,
    pair?: TradePair,
  ): Promise<{ offer?: TradeOffer; error?: string }> {
    const normalizedTradeId = tradeId.toUpperCase();
    const normalizedTakerOwnerId = normalizeOwnerId(takerOwnerId);
    const offer = await this.getTradeOfferById(normalizedTradeId);

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'active') {
      return { error: 'This trade is no longer active.' };
    }

    if (offer.ownerId === normalizedTakerOwnerId) {
      return { error: 'You cannot take your own trade.' };
    }

    const takerActiveAlbumId = await this.getActiveAlbumId(normalizedTakerOwnerId);

    if (!takerActiveAlbumId) {
      return { error: 'No active album.' };
    }

    if (takerActiveAlbumId === offer.collectionId) {
      return { error: 'This trade already belongs to your active shared album.' };
    }

    const valid = await this.isTradeOfferValidById(offer);

    if (!valid) {
      await this.db.query(
        `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
        [normalizedTradeId],
      );

      return { error: 'Trade expired.' };
    }

    const compatiblePairs = await this.getCompatiblePairs(offer, takerActiveAlbumId);

    if (compatiblePairs.length === 0) {
      return { error: 'No compatible sticker pair found right now.' };
    }

    const resolvedPair = pair
      ? compatiblePairs.find((c) => this.tradePairsEqual(c, pair))
      : compatiblePairs.length === 1
        ? compatiblePairs[0]
        : undefined;

    if (!resolvedPair) {
      return { error: 'Choose an exact sticker pair first.' };
    }

    const takerUuid = await this.getCollectorUUID(normalizedTakerOwnerId);

    await this.db.query(
      `UPDATE trade_offers SET
         status = 'pending_confirmation',
         reserved_by_owner_id = $1,
         reserved_collection_id = $2,
         resolved_give_country_code = $3,
         resolved_give_sticker_number = $4,
         resolved_want_country_code = $5,
         resolved_want_sticker_number = $6,
         owner_confirmed_at = NULL,
         taker_confirmed_at = NULL
       WHERE id = $7`,
      [
        takerUuid,
        takerActiveAlbumId,
        resolvedPair.give.countryCode,
        resolvedPair.give.number,
        resolvedPair.want.countryCode,
        resolvedPair.want.number,
        normalizedTradeId,
      ],
    );

    const updated = await this.getTradeOfferById(normalizedTradeId);

    return { offer: updated ?? undefined };
  }

  async acceptTradeOffer(
    tradeId: string,
    ownerId: string,
  ): Promise<{ offer?: TradeOffer; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const offer = await this.getTradeOfferById(tradeId.toUpperCase());

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'pending_confirmation') {
      return { error: 'This trade is not waiting for coordination.' };
    }

    const valid = await this.isTradeOfferValidById(offer);

    if (!valid) {
      await this.db.query(
        `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
        [offer.id],
      );

      return { error: 'Trade expired.' };
    }

    await this.db.query(
      `UPDATE trade_offers SET status = 'accepted_pending_completion',
         owner_confirmed_at = NULL, taker_confirmed_at = NULL WHERE id = $1`,
      [offer.id],
    );

    const updated = await this.getTradeOfferById(offer.id);

    return { offer: updated ?? undefined };
  }

  async declineTradeOffer(
    tradeId: string,
    ownerId: string,
  ): Promise<{ offer?: TradeOffer; error?: string }> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const offer = await this.getTradeOfferById(tradeId.toUpperCase());

    if (!offer || offer.ownerId !== normalizedOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'pending_confirmation') {
      return { error: 'This trade is not waiting for coordination.' };
    }

    // Clear reservation — go back to active
    await this.db.query(
      `UPDATE trade_offers SET
         status = 'active',
         reserved_by_owner_id = NULL,
         reserved_collection_id = NULL,
         resolved_give_country_code = NULL,
         resolved_give_sticker_number = NULL,
         resolved_want_country_code = NULL,
         resolved_want_sticker_number = NULL,
         owner_confirmed_at = NULL,
         taker_confirmed_at = NULL
       WHERE id = $1`,
      [offer.id],
    );

    const updated = await this.getTradeOfferById(offer.id);

    return { offer: updated ?? undefined };
  }

  async confirmTradeOfferCompleted(
    tradeId: string,
    actorOwnerId: string,
  ): Promise<{
    offer?: TradeOffer;
    completed?: boolean;
    waitingForOther?: boolean;
    alreadyConfirmed?: boolean;
    error?: string;
  }> {
    const normalizedActorOwnerId = normalizeOwnerId(actorOwnerId);
    const offer = await this.getTradeOfferById(tradeId.toUpperCase());

    if (!offer) {
      return { error: 'Trade not found.' };
    }

    if (offer.ownerId !== normalizedActorOwnerId && offer.reservedByOwnerId !== normalizedActorOwnerId) {
      return { error: 'Trade not found.' };
    }

    if (offer.status !== 'accepted_pending_completion') {
      if (offer.status === 'completed') {
        return { offer, completed: true };
      }

      return { error: 'This trade is not waiting for completion.' };
    }

    const valid = await this.isTradeOfferValidById(offer);

    if (!valid) {
      await this.db.query(
        `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
        [offer.id],
      );

      return { error: 'Trade expired.' };
    }

    const isOwnerConfirmation = offer.ownerId === normalizedActorOwnerId;
    const alreadyConfirmed = isOwnerConfirmation
      ? Boolean(offer.ownerConfirmedAt)
      : Boolean(offer.takerConfirmedAt);

    if (!alreadyConfirmed) {
      if (isOwnerConfirmation) {
        await this.db.query(
          `UPDATE trade_offers SET owner_confirmed_at = now() WHERE id = $1`,
          [offer.id],
        );
      } else {
        await this.db.query(
          `UPDATE trade_offers SET taker_confirmed_at = now() WHERE id = $1`,
          [offer.id],
        );
      }
    }

    // Re-read to get updated timestamps
    const refreshed = await this.getTradeOfferById(offer.id);

    if (!refreshed) {
      return { error: 'Trade not found.' };
    }

    if (refreshed.ownerConfirmedAt && refreshed.takerConfirmedAt) {
      // Both confirmed — apply inventory changes
      if (
        !refreshed.resolvedGive
        || !refreshed.resolvedWant
        || !refreshed.reservedCollectionId
      ) {
        await this.db.query(
          `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
          [offer.id],
        );

        return { error: 'Trade expired.' };
      }

      const ownerGiveStickerCode = await this.getStickerDbCode(refreshed.resolvedGive);
      const ownerWantStickerCode = await this.getStickerDbCode(refreshed.resolvedWant);

      if (!ownerGiveStickerCode || !ownerWantStickerCode) {
        await this.db.query(
          `UPDATE trade_offers SET status = 'expired' WHERE id = $1`,
          [offer.id],
        );

        return { error: 'Trade expired.' };
      }

      // Owner: give resolvedGive (-1), receive resolvedWant (+1)
      await this.applyQuantityChange(refreshed.collectionId, ownerGiveStickerCode, -1);
      await this.applyQuantityChange(refreshed.collectionId, ownerWantStickerCode, 1);

      // Taker: give resolvedWant (-1), receive resolvedGive (+1)
      await this.applyQuantityChange(refreshed.reservedCollectionId, ownerWantStickerCode, -1);
      await this.applyQuantityChange(refreshed.reservedCollectionId, ownerGiveStickerCode, 1);

      await this.db.query(
        `UPDATE trade_offers SET status = 'completed', completed_at = now() WHERE id = $1`,
        [offer.id],
      );

      const completed = await this.getTradeOfferById(offer.id);

      return { offer: completed ?? undefined, completed: true, alreadyConfirmed };
    }

    return { offer: refreshed, waitingForOther: true, alreadyConfirmed };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getProfileRow(ownerId: string): Promise<Record<string, unknown> | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM collector_profiles WHERE telegram_chat_id = $1`,
      [ownerId],
    );

    return result.rows[0] ?? null;
  }

  private async getCollectorUUID(ownerId: string): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM collector_profiles WHERE telegram_chat_id = $1`,
      [ownerId],
    );

    return result.rows[0]?.id ?? null;
  }

  private async getOrCreateCollectorUUID(ownerId: string): Promise<string> {
    const existing = await this.getCollectorUUID(ownerId);

    if (existing) {
      return existing;
    }

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO collector_profiles (id, telegram_chat_id, display_name)
       VALUES ($1, $2, $2)
       ON CONFLICT (telegram_chat_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id
       RETURNING id`,
      [randomUUID(), ownerId],
    );

    return result.rows[0].id;
  }

  private async getActiveAlbumId(ownerId: string): Promise<string | null> {
    const result = await this.db.query<{ user_album_id: string }>(
      `SELECT caa.user_album_id
       FROM collector_active_albums caa
       JOIN collector_profiles cp ON cp.id = caa.collector_id AND cp.telegram_chat_id = $1
       JOIN user_albums ua ON ua.id = caa.user_album_id AND ua.deleted_at IS NULL
       JOIN user_album_members uam ON uam.user_album_id = ua.id
         AND uam.collector_id = caa.collector_id AND uam.left_at IS NULL`,
      [ownerId],
    );

    return result.rows[0]?.user_album_id ?? null;
  }

  private async getActiveAlbumIdOrThrow(ownerId: string): Promise<string> {
    const id = await this.getActiveAlbumId(ownerId);

    if (!id) {
      throw new Error('No hay album activo.');
    }

    return id;
  }

  private async getStickerDbCode(sticker: StickerRef): Promise<string | null> {
    const country = getCatalogEntry(sticker.countryCode);
    const lookupCandidates = buildStickerLookupCandidates(sticker);
    const result = await this.db.query<{ code: string }>(
      `SELECT s.code
       FROM stickers s
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE s.sticker_number = $2
         AND (
           t.code = $1
           OR ($3::text IS NOT NULL AND upper(t.name) = upper($3))
           OR upper(s.code) = ANY($4::text[])
           OR regexp_replace(upper(s.subject), '\s+', '', 'g') = ANY($4::text[])
         )`,
      [sticker.countryCode.toUpperCase(), sticker.number, country?.name ?? null, lookupCandidates],
    );

    return result.rows[0]?.code ?? null;
  }

  private async getFriendRequestRow(requestId: string): Promise<Record<string, unknown> | null> {
    if (!isUuid(requestId)) {
      return null;
    }

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT fr.*,
              from_cp.telegram_chat_id AS from_telegram_chat_id,
              from_cp.telegram_username AS from_telegram_username,
              to_cp.telegram_chat_id AS to_telegram_chat_id,
              to_cp.telegram_username AS to_telegram_username
       FROM friend_requests fr
       JOIN collector_profiles from_cp ON from_cp.id = fr.from_collector_id
       JOIN collector_profiles to_cp ON to_cp.id = fr.to_collector_id
       WHERE fr.id = $1`,
      [requestId],
    );

    return result.rows[0] ?? null;
  }

  private async answerFriendRequest(
    requestId: string,
    responderOwnerId: string,
    status: 'accepted' | 'declined',
  ): Promise<{ row?: Record<string, unknown>; error?: string }> {
    const row = await this.getFriendRequestRow(requestId);

    if (!row) {
      return { error: 'Solicitud de amistad no encontrada.' };
    }

    if ((row.to_telegram_chat_id as string) !== normalizeOwnerId(responderOwnerId)) {
      return { error: 'Solicitud de amistad no encontrada.' };
    }

    if ((row.status as string) !== 'pending') {
      return { error: 'Esta solicitud ya fue respondida.' };
    }

    await this.db.query(
      `UPDATE friend_requests SET status = $1, answered_at = now() WHERE id = $2`,
      [status, requestId],
    );

    const updated = await this.getFriendRequestRow(requestId);

    return updated ? { row: updated } : { error: 'Solicitud de amistad no encontrada.' };
  }

  private async getAccessibleAlbumDetails(
    ownerId: string,
    collectionId: string,
    activeAlbumId?: string | null,
  ): Promise<AccessibleAlbumDetails | null> {
    const normalizedOwnerId = normalizeOwnerId(ownerId);
    const resolvedActiveAlbumId = activeAlbumId === undefined
      ? await this.getActiveAlbumId(normalizedOwnerId)
      : activeAlbumId;
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         ua.album_id AS catalog_album_id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(active_members.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members requester_member
         ON requester_member.user_album_id = ua.id
         AND requester_member.left_at IS NULL
       JOIN collector_profiles requester_cp
         ON requester_cp.id = requester_member.collector_id
         AND requester_cp.telegram_chat_id = $1
       JOIN user_album_members active_members
         ON active_members.user_album_id = ua.id
         AND active_members.left_at IS NULL
       WHERE ua.id = $2
         AND ua.deleted_at IS NULL
       GROUP BY ua.id, ua.album_id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name`,
      [normalizedOwnerId, collectionId],
    );

    if (!result.rows[0]) {
      return null;
    }

    return {
      summary: rowToCollectionSummary(result.rows[0], normalizedOwnerId, resolvedActiveAlbumId),
      catalogAlbumId: Number(result.rows[0].catalog_album_id),
    };
  }

  private async getStickerQuantitiesForAlbum(albumId: string): Promise<Record<string, number>> {
    const result = await this.db.query<{
      sticker_code: string;
      subject: string;
      team_code: string;
      team_name: string;
      sticker_number: number;
      quantity: number;
    }>(
      `SELECT s.code AS sticker_code, s.subject, t.code AS team_code, t.name AS team_name, s.sticker_number, uai.quantity
       FROM user_album_items uai
       JOIN stickers s ON s.code = uai.sticker_code
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE uai.user_album_id = $1 AND uai.variant_code = 'BASE' AND uai.quantity > 0`,
      [albumId],
    );

    const quantities: Record<string, number> = {};

    for (const row of result.rows) {
      const sticker = this.rowToStickerRef(row);

      if (sticker) {
        quantities[stickerKey(sticker)] = row.quantity;
      }
    }

    return quantities;
  }

  private rowToStickerRef(row: {
    team_code: string | null | undefined;
    team_name: string | null | undefined;
    sticker_code?: string | null;
    subject?: string | null;
    sticker_number: number | null | undefined;
  }): StickerRef | null {
    const countryCode = this.toCatalogCountryCode(
      row.team_code,
      row.team_name,
      row.sticker_code,
      row.subject,
    );

    if (!countryCode || row.sticker_number === null || row.sticker_number === undefined) {
      return null;
    }

    return {
      countryCode,
      number: row.sticker_number,
    };
  }

  private matchesStickerFilters(
    sticker: StickerRef,
    countryCode?: string,
    selectedSticker?: StickerRef,
  ): boolean {
    if (countryCode && sticker.countryCode !== countryCode) {
      return false;
    }

    if (selectedSticker && stickerKey(sticker) !== stickerKey(selectedSticker)) {
      return false;
    }

    return true;
  }

  private compareStickerRefs(left: StickerRef, right: StickerRef): number {
    return left.countryCode.localeCompare(right.countryCode)
      || left.number - right.number;
  }

  private toCatalogCountryCode(
    teamCode: string | null | undefined,
    teamName: string | null | undefined,
    stickerCode?: string | null,
    subject?: string | null,
  ): string | null {
    if (teamCode) {
      const directMatch = getCatalogEntry(teamCode);

      if (directMatch) {
        return directMatch.code;
      }
    }

    if (teamName) {
      const nameMatch = resolveCountry(teamName);

      if (nameMatch) {
        return nameMatch.code;
      }
    }

    if (stickerCode === '00') {
      return 'WP';
    }

    if (stickerCode && /^CC\d+$/i.test(stickerCode)) {
      return 'CC';
    }

    if (stickerCode && /^FWC\d+$/i.test(stickerCode)) {
      return 'FWC';
    }

    if (subject && /^FWC\s*\d+$/i.test(subject)) {
      return 'FWC';
    }

    if (subject && /^WE ARE PANINI$/i.test(subject)) {
      return 'WP';
    }

    return teamCode ?? null;
  }

  private async getCollectionSummaryForOwner(
    collectionId: string,
    ownerId: string,
  ): Promise<CollectionSummary | null> {
    const activeAlbumId = await this.getActiveAlbumId(ownerId);

    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         ua.id,
         al.slug AS album_slug,
         ua.name,
         owner_cp.telegram_chat_id AS owner_telegram_chat_id,
         owner_cp.display_name AS owner_display_name,
         COUNT(uam.collector_id) AS member_count
       FROM user_albums ua
       JOIN albums al ON al.id = ua.album_id
       JOIN collector_profiles owner_cp ON owner_cp.id = ua.owner_id
       JOIN user_album_members uam ON uam.user_album_id = ua.id AND uam.left_at IS NULL
       WHERE ua.id = $1 AND ua.deleted_at IS NULL
       GROUP BY ua.id, al.slug, ua.name, owner_cp.telegram_chat_id, owner_cp.display_name`,
      [collectionId],
    );

    if (!result.rows[0]) {
      return null;
    }

    return rowToCollectionSummary(result.rows[0], ownerId, activeAlbumId);
  }

  private async getTradeOfferById(tradeId: string): Promise<TradeOffer | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT to_.*,
              owner_cp.telegram_chat_id AS owner_telegram_chat_id,
              reserved_cp.telegram_chat_id AS reserved_by_telegram_chat_id
       FROM trade_offers to_
       JOIN collector_profiles owner_cp ON owner_cp.id = to_.owner_id
       LEFT JOIN collector_profiles reserved_cp ON reserved_cp.id = to_.reserved_by_owner_id
       WHERE to_.id = $1`,
      [tradeId],
    );

    return result.rows[0] ? rowToTradeOffer(result.rows[0]) : null;
  }

  private async isTradeOfferValidById(offer: TradeOffer): Promise<boolean> {
    if (offer.status === 'active') {
      return this.isTradeOfferActive(offer);
    }

    if (offer.status === 'pending_confirmation' || offer.status === 'accepted_pending_completion') {
      return this.isTradeOfferResolved(offer);
    }

    return false;
  }

  private async isTradeOfferActive(offer: TradeOffer): Promise<boolean> {
    // Check owner is still a member and album not deleted
    const memberCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM user_album_members uam
       JOIN user_albums ua ON ua.id = uam.user_album_id
       JOIN collector_profiles cp ON cp.id = uam.collector_id
       WHERE uam.user_album_id = $1 AND cp.telegram_chat_id = $2
         AND uam.left_at IS NULL AND ua.deleted_at IS NULL`,
      [offer.collectionId, offer.ownerId],
    );

    if (Number(memberCheck.rows[0]?.count ?? 0) === 0) {
      return false;
    }

    const stickers = await this.getStickerQuantitiesForAlbum(offer.collectionId);

    return !this.validateTradeGiveSelector(stickers, offer.give)
      && !this.validateTradeWantSelector(stickers, offer.want);
  }

  private async isTradeOfferResolved(offer: TradeOffer): Promise<boolean> {
    if (
      !offer.resolvedGive
      || !offer.resolvedWant
      || !offer.reservedByOwnerId
      || !offer.reservedCollectionId
    ) {
      return false;
    }

    // Check both collections are valid and members are still in
    const ownerMemberCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM user_album_members uam
       JOIN user_albums ua ON ua.id = uam.user_album_id
       JOIN collector_profiles cp ON cp.id = uam.collector_id
       WHERE uam.user_album_id = $1 AND cp.telegram_chat_id = $2
         AND uam.left_at IS NULL AND ua.deleted_at IS NULL`,
      [offer.collectionId, offer.ownerId],
    );

    if (Number(ownerMemberCheck.rows[0]?.count ?? 0) === 0) return false;

    const takerMemberCheck = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM user_album_members uam
       JOIN user_albums ua ON ua.id = uam.user_album_id
       JOIN collector_profiles cp ON cp.id = uam.collector_id
       WHERE uam.user_album_id = $1 AND cp.telegram_chat_id = $2
         AND uam.left_at IS NULL AND ua.deleted_at IS NULL`,
      [offer.reservedCollectionId, offer.reservedByOwnerId],
    );

    if (Number(takerMemberCheck.rows[0]?.count ?? 0) === 0) return false;

    if (offer.collectionId === offer.reservedCollectionId) return false;

    const ownerStickers = await this.getStickerQuantitiesForAlbum(offer.collectionId);
    const takerStickers = await this.getStickerQuantitiesForAlbum(offer.reservedCollectionId);

    return this.isResolvedGiveStillValid(offer.give, offer.resolvedGive, ownerStickers)
      && this.isResolvedWantStillValid(offer.want, offer.resolvedWant, ownerStickers, takerStickers);
  }

  private async getCompatiblePairs(offer: TradeOffer, takerCollectionId: string): Promise<TradePair[]> {
    if (offer.collectionId === takerCollectionId) {
      return [];
    }

    const ownerStickers = await this.getStickerQuantitiesForAlbum(offer.collectionId);
    const takerStickers = await this.getStickerQuantitiesForAlbum(takerCollectionId);

    const giveCandidates = offer.give.kind === 'sticker'
      ? (ownerStickers[stickerKey(offer.give.sticker)] ?? 0) >= 1
        ? [offer.give.sticker]
        : []
      : this.getScopedStickerRefs(offer.give.countryCode)
        .filter((s) => (ownerStickers[stickerKey(s)] ?? 0) > 1);

    const wantCandidates = offer.want.kind === 'sticker'
      ? (
        (ownerStickers[stickerKey(offer.want.sticker)] ?? 0) <= 0
        && (takerStickers[stickerKey(offer.want.sticker)] ?? 0) >= 1
      )
        ? [offer.want.sticker]
        : []
      : this.getScopedStickerRefs(offer.want.countryCode).filter((s) =>
        (ownerStickers[stickerKey(s)] ?? 0) <= 0
        && (takerStickers[stickerKey(s)] ?? 0) >= 1,
      );

    return giveCandidates.flatMap((give) =>
      wantCandidates.map((want) => ({ give, want })),
    );
  }

  private async applyQuantityChange(albumId: string, stickerCode: string, delta: number): Promise<void> {
    const current = await this.db.query<{ quantity: number }>(
      `SELECT quantity FROM user_album_items
       WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
      [albumId, stickerCode],
    );

    const currentQty = current.rows[0]?.quantity ?? 0;
    const nextQty = Math.max(currentQty + delta, 0);

    if (nextQty === 0) {
      await this.db.query(
        `DELETE FROM user_album_items WHERE user_album_id = $1 AND sticker_code = $2 AND variant_code = 'BASE'`,
        [albumId, stickerCode],
      );
    } else {
      await this.db.query(
        `INSERT INTO user_album_items (user_album_id, sticker_code, variant_code, quantity)
         VALUES ($1, $2, 'BASE', $3)
         ON CONFLICT (user_album_id, sticker_code, variant_code)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [albumId, stickerCode, nextQty],
      );
    }
  }

  private validateTradeGiveSelector(
    stickers: Record<string, number>,
    selector: TradeSelector,
  ): string | undefined {
    if (selector.kind === 'sticker') {
      if (!isKnownSticker(selector.sticker)) {
        return 'Unknown trade sticker.';
      }

      return (stickers[stickerKey(selector.sticker)] ?? 0) >= 1
        ? undefined
        : `You cannot offer ${formatSticker(selector.sticker)} right now.`;
    }

    const hasDuplicate = this.getScopedStickerRefs(selector.countryCode)
      .some((s) => (stickers[stickerKey(s)] ?? 0) > 1);

    if (hasDuplicate) return undefined;

    return selector.countryCode
      ? `You do not have a duplicate from ${selector.countryCode} to offer.`
      : 'You do not have any duplicate to offer.';
  }

  private validateTradeWantSelector(
    stickers: Record<string, number>,
    selector: TradeSelector,
  ): string | undefined {
    if (selector.kind === 'sticker') {
      if (!isKnownSticker(selector.sticker)) {
        return 'Unknown trade sticker.';
      }

      return (stickers[stickerKey(selector.sticker)] ?? 0) <= 0
        ? undefined
        : `You already have ${formatSticker(selector.sticker)} in this album.`;
    }

    const hasMissing = this.getScopedStickerRefs(selector.countryCode)
      .some((s) => (stickers[stickerKey(s)] ?? 0) <= 0);

    if (hasMissing) return undefined;

    return selector.countryCode
      ? `You are not missing any sticker from ${selector.countryCode}.`
      : 'You are not missing any sticker right now.';
  }

  private tradeGiveSelectorCanResolveToSticker(
    selector: TradeSelector,
    sticker: StickerRef,
    ownerStickers: Record<string, number>,
  ): boolean {
    const key = stickerKey(sticker);

    if (selector.kind === 'sticker') {
      return stickerKey(selector.sticker) === key && (ownerStickers[key] ?? 0) >= 1;
    }

    if (selector.kind === 'duplicate') {
      return this.matchesTradeSelectorScope(selector, sticker) && (ownerStickers[key] ?? 0) > 1;
    }

    return false;
  }

  private tradeNeedSelectorCanResolveToSticker(
    selector: TradeSelector,
    sticker: StickerRef,
    ownerStickers: Record<string, number>,
  ): boolean {
    const key = stickerKey(sticker);

    if (selector.kind === 'sticker') {
      return stickerKey(selector.sticker) === key && (ownerStickers[key] ?? 0) <= 0;
    }

    if (selector.kind === 'missing') {
      return this.matchesTradeSelectorScope(selector, sticker) && (ownerStickers[key] ?? 0) <= 0;
    }

    return false;
  }

  private isResolvedGiveStillValid(
    selector: TradeSelector,
    resolvedSticker: StickerRef,
    ownerStickers: Record<string, number>,
  ): boolean {
    const quantity = ownerStickers[stickerKey(resolvedSticker)] ?? 0;

    if (selector.kind === 'sticker') {
      return stickerKey(selector.sticker) === stickerKey(resolvedSticker) && quantity >= 1;
    }

    return this.matchesTradeSelectorScope(selector, resolvedSticker) && quantity > 1;
  }

  private isResolvedWantStillValid(
    selector: TradeSelector,
    resolvedSticker: StickerRef,
    ownerStickers: Record<string, number>,
    takerStickers: Record<string, number>,
  ): boolean {
    const ownerQuantity = ownerStickers[stickerKey(resolvedSticker)] ?? 0;
    const takerQuantity = takerStickers[stickerKey(resolvedSticker)] ?? 0;

    if (selector.kind === 'sticker') {
      return (
        stickerKey(selector.sticker) === stickerKey(resolvedSticker)
        && ownerQuantity <= 0
        && takerQuantity >= 1
      );
    }

    return (
      this.matchesTradeSelectorScope(selector, resolvedSticker)
      && ownerQuantity <= 0
      && takerQuantity >= 1
    );
  }

  private getScopedStickerRefs(countryCode?: string): StickerRef[] {
    if (countryCode) {
      return getAllStickerRefs(countryCode);
    }

    return WORLD_CUP_CATALOG.flatMap((country) => getAllStickerRefs(country.code));
  }

  private matchesTradeSelectorScope(
    selector: Exclude<TradeSelector, { kind: 'sticker' }>,
    sticker: StickerRef,
  ): boolean {
    return !selector.countryCode || selector.countryCode === sticker.countryCode;
  }

  private tradePairsEqual(left: TradePair, right: TradePair): boolean {
    return (
      stickerKey(left.give) === stickerKey(right.give)
      && stickerKey(left.want) === stickerKey(right.want)
    );
  }
}

export const collectionRepository = new CollectionRepository();
