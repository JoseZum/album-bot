import { Pool } from 'pg';

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
import { pool } from '../db/pool';
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

// ---------------------------------------------------------------------------
// Row → TypeScript helpers
// ---------------------------------------------------------------------------

function rowToStoredProfile(row: Record<string, unknown>): StoredProfile {
  return {
    ownerId: row.telegram_chat_id as string,
    username: (row.telegram_username as string | null) ?? undefined,
    firstName: (row.first_name as string | null) ?? undefined,
    lastName: (row.last_name as string | null) ?? undefined,
    displayName: (row.display_name as string | null) ?? undefined,
    language: (row.language_code as BotLanguage | null) ?? undefined,
    updatedAt: (row.updated_at as Date).toISOString(),
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
    collectionId: row.user_album_id as string,
    status: row.status as ShareRequestStatus,
    createdAt: (row.created_at as Date).toISOString(),
    respondedAt: row.answered_at ? (row.answered_at as Date).toISOString() : undefined,
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
    createdAt: (row.created_at as Date).toISOString(),
    reservedByOwnerId: (row.reserved_by_telegram_chat_id as string | null) ?? undefined,
    reservedCollectionId: (row.reserved_collection_id as string | null) ?? undefined,
    resolvedGive,
    resolvedWant,
    ownerConfirmedAt: row.owner_confirmed_at ? (row.owner_confirmed_at as Date).toISOString() : undefined,
    takerConfirmedAt: row.taker_confirmed_at ? (row.taker_confirmed_at as Date).toISOString() : undefined,
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
    cancelledAt: row.cancelled_at ? (row.cancelled_at as Date).toISOString() : undefined,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// CollectionRepository
// ---------------------------------------------------------------------------

export class CollectionRepository {
  constructor(private readonly db: Pool = pool) {}

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
      `INSERT INTO collector_profiles (telegram_chat_id, telegram_username, first_name, last_name, display_name, language_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (telegram_chat_id) DO UPDATE SET
         telegram_username = EXCLUDED.telegram_username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         display_name = EXCLUDED.display_name,
         language_code = EXCLUDED.language_code,
         updated_at = now()
       RETURNING *`,
      [ownerId, finalUsername, finalFirstName, finalLastName, displayName, finalLanguage],
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
      `INSERT INTO collector_profiles (telegram_chat_id, telegram_username, first_name, last_name, display_name, language_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (telegram_chat_id) DO UPDATE SET
         language_code = EXCLUDED.language_code,
         updated_at = now()
       RETURNING *`,
      [normalizedOwnerId, finalUsername, finalFirstName, finalLastName, displayName, language],
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

    // Check user is a member of this album
    const albumResult = await this.db.query<Record<string, unknown>>(
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
      [normalizedOwnerId, collectionId],
    );

    if (!albumResult.rows[0]) {
      return null;
    }

    const album = rowToCollectionSummary(albumResult.rows[0], normalizedOwnerId, activeAlbumId);
    const stickerQuantities = await this.getStickerQuantitiesForAlbum(collectionId);

    return { album, stickerQuantities };
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
      `INSERT INTO user_albums (album_id, owner_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [catalogAlbumId, ownerUuid, albumName],
    );

    const newAlbumId = insertResult.rows[0].id;

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
              t.code AS team_code, t.name AS team_name, s.sticker_number
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
    const teamCode = eventRow.team_code as string | null;
    const teamName = eventRow.team_name as string | null;
    const stickerNumber = eventRow.sticker_number as number | null;
    const countryCode = this.toCatalogCountryCode(teamCode, teamName);

    if (!countryCode || !stickerNumber) {
      // Cannot undo non-team sticker
      await this.db.query(`DELETE FROM user_album_events WHERE id = $1`, [eventId]);

      return null;
    }

    const sticker: StickerRef = { countryCode, number: stickerNumber };
    const previousQuantity = eventRow.previous_quantity as number;
    const currentQuantity = eventRow.current_quantity as number;
    const action = eventRow.action as StickerHistoryAction;
    const timestamp = (eventRow.created_at as Date).toISOString();
    const stickerCode = eventRow.sticker_code as string;

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
      `INSERT INTO album_share_requests (user_album_id, from_collector_id, to_collector_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [activeAlbumId, fromUuid, toUuid],
    );

    const row = insertResult.rows[0];

    const shareRequest: ShareRequest = {
      id: row.id as string,
      fromOwnerId: normalizedFromOwnerId,
      toOwnerId: toOwnerId,
      targetUsername: normalizedTargetUsername,
      collectionId: activeAlbumId,
      status: 'pending',
      createdAt: (row.created_at as Date).toISOString(),
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
      createdAt: (row.created_at as Date).toISOString(),
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
      createdAt: (row.created_at as Date).toISOString(),
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

    // Get next sequence ID
    const seqResult = await this.db.query<{ next_id: string }>(
      `SELECT 'T' || nextval('trade_offer_sequence') AS next_id`,
    );

    const tradeId = seqResult.rows[0].next_id;

    // Build give/want columns
    const giveKind = give.kind;
    const giveCountryCode = give.kind === 'sticker' ? give.sticker.countryCode : (give.countryCode ?? null);
    const giveStickerNumber = give.kind === 'sticker' ? give.sticker.number : null;
    const wantKind = want.kind;
    const wantCountryCode = want.kind === 'sticker' ? want.sticker.countryCode : (want.countryCode ?? null);
    const wantStickerNumber = want.kind === 'sticker' ? want.sticker.number : null;

    await this.db.query(
      `INSERT INTO trade_offers
         (id, owner_id, collection_id, give_kind, give_country_code, give_sticker_number,
          want_kind, want_country_code, want_sticker_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
      [tradeId, ownerUuid, activeAlbumId, giveKind, giveCountryCode, giveStickerNumber,
        wantKind, wantCountryCode, wantStickerNumber],
    );

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
      `INSERT INTO collector_profiles (telegram_chat_id, display_name)
       VALUES ($1, $1)
       ON CONFLICT (telegram_chat_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id
       RETURNING id`,
      [ownerId],
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
    const result = await this.db.query<{ code: string }>(
      `SELECT s.code
       FROM stickers s
       JOIN teams t ON t.id = s.team_id
       WHERE (t.code = $1 OR ($3::text IS NOT NULL AND upper(t.name) = upper($3)))
         AND s.sticker_number = $2`,
      [sticker.countryCode.toUpperCase(), sticker.number, country?.name ?? null],
    );

    return result.rows[0]?.code ?? null;
  }

  private async getStickerQuantitiesForAlbum(albumId: string): Promise<Record<string, number>> {
    const result = await this.db.query<{
      team_code: string;
      team_name: string;
      sticker_number: number;
      quantity: number;
    }>(
      `SELECT t.code AS team_code, t.name AS team_name, s.sticker_number, uai.quantity
       FROM user_album_items uai
       JOIN stickers s ON s.code = uai.sticker_code
       JOIN teams t ON t.id = s.team_id
       WHERE uai.user_album_id = $1 AND uai.variant_code = 'BASE' AND uai.quantity > 0`,
      [albumId],
    );

    const quantities: Record<string, number> = {};

    for (const row of result.rows) {
      const countryCode = this.toCatalogCountryCode(row.team_code, row.team_name);

      if (countryCode && row.sticker_number) {
        const key = stickerKey({ countryCode, number: row.sticker_number });

        quantities[key] = row.quantity;
      }
    }

    return quantities;
  }

  private toCatalogCountryCode(teamCode: string | null | undefined, teamName: string | null | undefined): string | null {
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
