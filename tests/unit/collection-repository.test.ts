import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  stickerKey,
  type StickerRef,
} from '../../src/catalog/world-cup.catalog';
import {
  CollectionRepository,
  type CollectionSummary,
  type StickerHistoryEntry,
  type StickerQuantityChange,
} from '../../src/repositories/collection.repository';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG3: StickerRef = { countryCode: 'ARG', number: 3 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const BRA4: StickerRef = { countryCode: 'BRA', number: 4 };

type StoredTestData = {
  collections: Record<string, {
    members: string[];
    stickers: Record<string, number>;
    deletedAt?: string;
    history: StickerHistoryEntry[];
  }>;
  ownerCollections: Record<string, string>;
  shareRequests: Record<string, {
    status: string;
    respondedAt?: string;
  }>;
  tradeOffers: Record<string, {
    status: string;
    cancelledAt?: string;
    ownerConfirmedAt?: string;
    takerConfirmedAt?: string;
  }>;
};

const createHarness = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-unit-collection-'));
  const filePath = path.join(directory, 'collection.json');
  const repository = new CollectionRepository(filePath);

  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });

  return {
    repository,
    filePath,
    cleanup,
  };
};

const registerProfile = (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
) => repository.registerProfile({
  ownerId,
  username,
  language: 'en',
});

const createAlbum = (
  repository: CollectionRepository,
  ownerId: string,
  name: string,
): CollectionSummary => {
  const album = repository.createAlbum(ownerId, ALBUM_SLUG, name);

  assert.ok(album);

  return album;
};

const historyEntry = (
  action: StickerHistoryEntry['action'],
  change: StickerQuantityChange,
): StickerHistoryEntry => ({
  action,
  sticker: change.sticker,
  previousQuantity: change.previousQuantity,
  currentQuantity: change.currentQuantity,
  timestamp: '2026-05-08T00:00:00.000Z',
});

const readStoredData = (filePath: string): StoredTestData =>
  JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredTestData;

test('profiles normalize usernames, preserve identity, and persist language selection', () => {
  const { repository, filePath, cleanup } = createHarness();

  try {
    const created = repository.registerProfile({
      ownerId: ' owner-a ',
      username: '@StickerFan',
      firstName: 'Ana',
      lastName: 'Collector',
      language: 'es',
    });

    assert.equal(created.ownerId, 'owner-a');
    assert.equal(created.username, 'stickerfan');
    assert.equal(created.displayName, '@stickerfan');
    assert.equal(created.language, 'es');

    const updatedLanguage = repository.setLanguage(' owner-a ', 'en');

    assert.equal(updatedLanguage.username, 'stickerfan');
    assert.equal(updatedLanguage.firstName, 'Ana');
    assert.equal(updatedLanguage.lastName, 'Collector');
    assert.equal(updatedLanguage.displayName, '@stickerfan');
    assert.equal(updatedLanguage.language, 'en');

    const languageOnlyProfile = repository.setLanguage(' language-only ', 'es');

    assert.equal(languageOnlyProfile.ownerId, 'language-only');
    assert.equal(languageOnlyProfile.displayName, 'language-only');
    assert.equal(languageOnlyProfile.language, 'es');

    const reopenedRepository = new CollectionRepository(filePath);

    assert.equal(reopenedRepository.getProfile(' owner-a ')?.language, 'en');
    assert.equal(reopenedRepository.findProfileByUsername('@STICKERFAN')?.ownerId, 'owner-a');
    assert.equal(reopenedRepository.getProfile('language-only')?.language, 'es');
  } finally {
    cleanup();
  }
});

test('albums can be created, listed, selected, renamed, deleted, and left by shared members', () => {
  const { repository, filePath, cleanup } = createHarness();

  try {
    registerProfile(repository, 'owner-a', 'alice');
    registerProfile(repository, 'owner-b', 'bob');

    const betaAlbum = createAlbum(repository, ' owner-a ', 'Beta Album');
    const alphaAlbum = createAlbum(repository, 'owner-a', 'Alpha Album');

    assert.equal(repository.hasActiveAlbum('owner-a'), true);
    assert.equal(repository.getActiveAlbum('owner-a')?.id, alphaAlbum.id);
    assert.deepEqual(
      repository.listAlbums('owner-a').map((album) => ({
        id: album.id,
        name: album.name,
        isActive: album.isActive,
      })),
      [
        { id: alphaAlbum.id, name: 'Alpha Album', isActive: true },
        { id: betaAlbum.id, name: 'Beta Album', isActive: false },
      ],
    );
    assert.equal(repository.createAlbum('owner-a', 'unknown-template'), null);
    assert.equal(repository.setActiveAlbum('owner-b', betaAlbum.id), null);

    const selectedAlbum = repository.setActiveAlbum(' owner-a ', betaAlbum.id);

    assert.equal(selectedAlbum?.id, betaAlbum.id);
    assert.equal(selectedAlbum?.isActive, true);

    const renamedAlbum = repository.renameAlbum('owner-a', betaAlbum.id, '  Gamma   Album  ');

    assert.equal(renamedAlbum.error, undefined);
    assert.equal(renamedAlbum.album?.name, 'Gamma Album');
    assert.equal(
      repository.renameAlbum('owner-b', betaAlbum.id, 'Bob Album').error,
      'Solo el dueno puede renombrar el album.',
    );
    assert.equal(
      repository.renameAlbum('owner-a', betaAlbum.id, '   ').error,
      'Nombre de album invalido.',
    );

    const shareRequest = repository.createShareRequest('owner-a', '@bob');

    assert.ok(shareRequest.request);
    assert.equal(repository.acceptShareRequest(shareRequest.request.id, ' owner-b ').error, undefined);

    const bobActiveAlbum = repository.getActiveAlbum('owner-b');

    assert.equal(bobActiveAlbum?.id, betaAlbum.id);
    assert.equal(bobActiveAlbum?.name, 'Gamma Album');
    assert.equal(bobActiveAlbum?.isShared, true);
    assert.equal(bobActiveAlbum?.ownerDisplayName, '@alice');
    assert.equal(bobActiveAlbum?.memberCount, 2);

    const leaveResult = repository.leaveAlbum(' owner-b ', betaAlbum.id);

    assert.equal(leaveResult.error, undefined);
    assert.equal(leaveResult.album?.memberCount, 1);
    assert.equal(repository.getActiveAlbum('owner-b'), null);
    assert.deepEqual(repository.listAlbums('owner-b'), []);
    assert.equal(
      repository.leaveAlbum('owner-a', betaAlbum.id).error,
      'El dueno no puede salir del album. Debe borrarlo.',
    );

    const deleteResult = repository.deleteAlbum(' owner-a ', betaAlbum.id);

    assert.equal(deleteResult.error, undefined);
    assert.equal(deleteResult.album?.name, 'Gamma Album');
    assert.equal(repository.getActiveAlbum('owner-a'), null);
    assert.deepEqual(
      repository.listAlbums('owner-a').map((album) => ({
        id: album.id,
        name: album.name,
        isActive: album.isActive,
      })),
      [
        { id: alphaAlbum.id, name: 'Alpha Album', isActive: false },
      ],
    );
    assert.equal(repository.setActiveAlbum('owner-a', alphaAlbum.id)?.id, alphaAlbum.id);

    const reopenedRepository = new CollectionRepository(filePath);

    assert.equal(reopenedRepository.getCollectionSummaryById(betaAlbum.id), null);
    assert.equal(reopenedRepository.setActiveAlbum('owner-b', betaAlbum.id), null);
    assert.deepEqual(
      reopenedRepository.listAlbums('owner-a').map((album) => ({
        id: album.id,
        name: album.name,
        isActive: album.isActive,
      })),
      [
        { id: alphaAlbum.id, name: 'Alpha Album', isActive: true },
      ],
    );
  } finally {
    cleanup();
  }
});

test('inventory adjustments and undo history restore persisted sticker quantities', () => {
  const { repository, filePath, cleanup } = createHarness();

  try {
    createAlbum(repository, 'owner-a', 'History Album');

    const firstAdd = repository.adjustQuantity('owner-a', ARG2, 1);

    assert.deepEqual(firstAdd, {
      sticker: ARG2,
      previousQuantity: 0,
      currentQuantity: 1,
      changed: true,
    });
    repository.recordHistory('owner-a', historyEntry('add', firstAdd));

    const secondAdd = repository.adjustQuantity('owner-a', ARG2, 1);
    repository.recordHistory('owner-a', historyEntry('add', secondAdd));

    const remove = repository.adjustQuantity('owner-a', ARG2, -1);
    repository.recordHistory('owner-a', historyEntry('remove', remove));

    assert.equal(repository.getQuantity('owner-a', ARG2), 1);
    assert.deepEqual(repository.getStickerQuantities('owner-a'), {
      [stickerKey(ARG2)]: 1,
    });

    const undoneRemove = repository.undoLast('owner-a');

    assert.equal(undoneRemove?.action, 'remove');
    assert.equal(repository.getQuantity('owner-a', ARG2), 2);

    const reopenedRepository = new CollectionRepository(filePath);

    assert.equal(reopenedRepository.getQuantity('owner-a', ARG2), 2);
    assert.equal(reopenedRepository.undoLast('owner-a')?.currentQuantity, 2);
    assert.equal(reopenedRepository.getQuantity('owner-a', ARG2), 1);
    assert.equal(reopenedRepository.undoLast('owner-a')?.currentQuantity, 1);
    assert.equal(reopenedRepository.getQuantity('owner-a', ARG2), 0);
    assert.deepEqual(reopenedRepository.getStickerQuantities('owner-a'), {});
    assert.equal(reopenedRepository.undoLast('owner-a'), null);

    const noChange = reopenedRepository.adjustQuantity('owner-a', ARG2, -1);

    assert.deepEqual(noChange, {
      sticker: ARG2,
      previousQuantity: 0,
      currentQuantity: 0,
      changed: false,
    });
  } finally {
    cleanup();
  }
});

test('share requests handle creation, acceptance, decline, duplicate, and answered edge cases', () => {
  const { repository, filePath, cleanup } = createHarness();

  try {
    registerProfile(repository, 'alice-id', 'alice');
    registerProfile(repository, 'bob-id', 'bob');
    registerProfile(repository, 'carol-id', 'carol');

    const aliceAlbum = createAlbum(repository, 'alice-id', 'Alice Album');

    repository.adjustQuantity('alice-id', ARG2, 1);

    assert.match(
      repository.createShareRequest('alice-id', 'unknown').error ?? '',
      /^No conozco a @unknown\./,
    );
    assert.equal(
      repository.createShareRequest('alice-id', '@ALICE').error,
      'No puedes compartir el album contigo mismo.',
    );

    createAlbum(repository, 'bob-id', 'Bob Album');
    repository.adjustQuantity('bob-id', ARG2, 2);
    repository.adjustQuantity('bob-id', BRA4, 1);

    const bobRequest = repository.createShareRequest('alice-id', 'BOB');

    assert.ok(bobRequest.request);
    assert.equal(bobRequest.request.status, 'pending');
    assert.equal(bobRequest.request.targetUsername, 'bob');
    assert.equal(repository.createShareRequest('alice-id', '@bob').request?.id, bobRequest.request.id);
    assert.equal(
      repository.acceptShareRequest(bobRequest.request.id, 'carol-id').error,
      'Solicitud de album compartido no encontrada.',
    );

    const accepted = repository.acceptShareRequest(bobRequest.request.id, 'bob-id');

    assert.equal(accepted.error, undefined);
    assert.equal(accepted.request?.status, 'accepted');
    assert.equal(accepted.fromProfile?.username, 'alice');
    assert.equal(
      repository.acceptShareRequest(bobRequest.request.id, 'bob-id').error,
      'Esta solicitud ya fue respondida.',
    );

    const sharedSnapshot = repository.getAlbumSnapshot('bob-id', aliceAlbum.id);

    assert.equal(sharedSnapshot?.album.isShared, true);
    assert.equal(sharedSnapshot?.album.memberCount, 2);
    assert.equal(sharedSnapshot?.stickerQuantities[stickerKey(ARG2)], 2);
    assert.equal(sharedSnapshot?.stickerQuantities[stickerKey(BRA4)], 1);
    assert.equal(
      repository.createShareRequest('alice-id', 'bob').error,
      'Ya compartes album con @bob.',
    );

    const carolRequest = repository.createShareRequest('alice-id', 'carol');

    assert.ok(carolRequest.request);

    const declined = repository.declineShareRequest(carolRequest.request.id, 'carol-id');

    assert.equal(declined.error, undefined);
    assert.equal(declined.request?.status, 'declined');
    assert.equal(declined.fromProfile?.username, 'alice');
    assert.equal(
      repository.declineShareRequest(carolRequest.request.id, 'carol-id').error,
      'Esta solicitud ya fue respondida.',
    );
    assert.equal(
      repository.acceptShareRequest(carolRequest.request.id, 'carol-id').error,
      'Esta solicitud ya fue respondida.',
    );
    assert.equal(
      repository.declineShareRequest(carolRequest.request.id, 'bob-id').error,
      'Solicitud de album compartido no encontrada.',
    );

    const storedData = readStoredData(filePath);

    assert.equal(storedData.shareRequests[bobRequest.request.id].status, 'accepted');
    assert.ok(storedData.shareRequests[bobRequest.request.id].respondedAt);
    assert.equal(storedData.shareRequests[carolRequest.request.id].status, 'declined');
    assert.ok(storedData.shareRequests[carolRequest.request.id].respondedAt);

    const reopenedRepository = new CollectionRepository(filePath);

    assert.equal(
      reopenedRepository.acceptShareRequest(bobRequest.request.id, 'bob-id').error,
      'Esta solicitud ya fue respondida.',
    );
    assert.equal(
      reopenedRepository.declineShareRequest(carolRequest.request.id, 'carol-id').error,
      'Esta solicitud ya fue respondida.',
    );
    assert.equal(
      reopenedRepository.getAlbumSnapshot('bob-id', aliceAlbum.id)
        ?.stickerQuantities[stickerKey(BRA4)],
      1,
    );
  } finally {
    cleanup();
  }
});

test('active album requirement errors are returned or thrown before persistence changes', () => {
  const { repository, cleanup } = createHarness();

  try {
    registerProfile(repository, 'owner-without-album', 'missing_album');
    registerProfile(repository, 'target-owner', 'target');

    assert.equal(repository.hasActiveAlbum('owner-without-album'), false);
    assert.equal(repository.getActiveAlbum('owner-without-album'), null);
    assert.throws(
      () => repository.getQuantity('owner-without-album', ARG2),
      /No hay album activo\./,
    );
    assert.throws(
      () => repository.getStickerQuantities('owner-without-album'),
      /No hay album activo\./,
    );
    assert.throws(
      () => repository.adjustQuantity('owner-without-album', ARG2, 1),
      /No hay album activo\./,
    );
    assert.throws(
      () => repository.recordHistory('owner-without-album', {
        action: 'add',
        sticker: ARG2,
        previousQuantity: 0,
        currentQuantity: 1,
        timestamp: '2026-05-08T00:00:00.000Z',
      }),
      /No hay album activo\./,
    );
    assert.throws(
      () => repository.undoLast('owner-without-album'),
      /No hay album activo\./,
    );
    assert.equal(
      repository.createShareRequest('owner-without-album', 'target').error,
      'No hay album activo.',
    );
    assert.equal(
      repository.createTradeOffer(
        'owner-without-album',
        { kind: 'sticker', sticker: ARG2 },
        { kind: 'sticker', sticker: ARG3 },
      ).error,
      'No active album.',
    );

    createAlbum(repository, 'trade-owner', 'Trade Owner Album');
    repository.adjustQuantity('trade-owner', ARG2, 1);

    const tradeOffer = repository.createTradeOffer(
      'trade-owner',
      { kind: 'sticker', sticker: ARG2 },
      { kind: 'sticker', sticker: ARG3 },
    );

    assert.ok(tradeOffer.offer);
    assert.equal(
      repository.getCompatibleTradePairs(tradeOffer.offer.id, 'owner-without-album').error,
      'No active album.',
    );
    assert.equal(
      repository.reserveTradeOffer(tradeOffer.offer.id, 'owner-without-album').error,
      'No active album.',
    );
  } finally {
    cleanup();
  }
});

test('trade cancellation and expiration statuses persist across repository instances', () => {
  const { repository, filePath, cleanup } = createHarness();

  try {
    registerProfile(repository, 'owner-a', 'owner_a');
    registerProfile(repository, 'owner-b', 'owner_b');
    createAlbum(repository, 'owner-a', 'Owner Album');
    createAlbum(repository, 'owner-b', 'Taker Album');

    repository.adjustQuantity('owner-a', ARG2, 1);
    repository.adjustQuantity('owner-b', ARG4, 1);

    const expiringTrade = repository.createTradeOffer(
      'owner-a',
      { kind: 'sticker', sticker: ARG2 },
      { kind: 'sticker', sticker: ARG4 },
    );

    assert.ok(expiringTrade.offer);
    assert.equal(expiringTrade.offer.id, 'T1');

    const reservedTrade = repository.reserveTradeOffer('t1', 'owner-b');

    assert.equal(reservedTrade.error, undefined);
    assert.equal(reservedTrade.offer?.status, 'pending_confirmation');
    assert.deepEqual(reservedTrade.offer?.resolvedGive, ARG2);
    assert.deepEqual(reservedTrade.offer?.resolvedWant, ARG4);
    assert.equal(repository.acceptTradeOffer('T1', 'owner-a').offer?.status, 'accepted_pending_completion');

    const ownerConfirmation = repository.confirmTradeOfferCompleted('T1', 'owner-a');

    assert.equal(ownerConfirmation.error, undefined);
    assert.equal(ownerConfirmation.waitingForOther, true);

    repository.adjustQuantity('owner-a', ARG2, -1);

    const expiredCompletion = repository.confirmTradeOfferCompleted('T1', 'owner-b');

    assert.equal(expiredCompletion.error, 'Trade expired.');
    assert.equal(repository.getTradeOffer('T1')?.status, 'expired');

    repository.adjustQuantity('owner-a', ARG3, 1);

    const cancellableTrade = repository.createTradeOffer(
      'owner-a',
      { kind: 'sticker', sticker: ARG3 },
      { kind: 'sticker', sticker: BRA4 },
    );

    assert.ok(cancellableTrade.offer);
    assert.equal(cancellableTrade.offer.id, 'T2');
    assert.equal(repository.cancelTradeOffer('owner-b', 'T2').error, 'Trade not found.');

    const cancelledTrade = repository.cancelTradeOffer('owner-a', 't2');

    assert.equal(cancelledTrade.error, undefined);
    assert.equal(cancelledTrade.offer?.status, 'cancelled');
    assert.ok(cancelledTrade.offer?.cancelledAt);
    assert.equal(
      repository.cancelTradeOffer('owner-a', 'T2').error,
      'Only active or pending trades can be cancelled.',
    );

    const storedData = readStoredData(filePath);

    assert.equal(storedData.tradeOffers.T1.status, 'expired');
    assert.equal(storedData.tradeOffers.T1.ownerConfirmedAt, undefined);
    assert.equal(storedData.tradeOffers.T1.takerConfirmedAt, undefined);
    assert.equal(storedData.tradeOffers.T2.status, 'cancelled');
    assert.ok(storedData.tradeOffers.T2.cancelledAt);

    const reopenedRepository = new CollectionRepository(filePath);

    assert.equal(reopenedRepository.getTradeOffer('T1')?.status, 'expired');
    assert.equal(reopenedRepository.getTradeOffer('T2')?.status, 'cancelled');
    assert.deepEqual(reopenedRepository.listTradeOffersForOwner('owner-a'), []);
    assert.deepEqual(reopenedRepository.listMarketplaceTradeOffers('owner-b'), []);
  } finally {
    cleanup();
  }
});
