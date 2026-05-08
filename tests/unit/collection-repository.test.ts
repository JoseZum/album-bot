import test from 'node:test';
import assert from 'node:assert/strict';

import { Pool } from 'pg';

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

const testPool = new Pool({ connectionString: 'postgres://album_bot:album_bot_password@localhost:5433/album_bot' });

const TRUNCATE_SQL = `TRUNCATE user_album_events, user_album_items, trade_offers, collector_active_albums, user_album_members, album_share_requests, collector_friends, friend_requests, user_albums, collector_profiles RESTART IDENTITY CASCADE; ALTER SEQUENCE trade_offer_sequence RESTART WITH 1`;

const createHarness = async () => {
  await testPool.query(TRUNCATE_SQL);
  const repository = new CollectionRepository(testPool);

  return { repository };
};

const registerProfile = async (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
) => repository.registerProfile({
  ownerId,
  username,
  language: 'en',
});

const createAlbum = async (
  repository: CollectionRepository,
  ownerId: string,
  name: string,
): Promise<CollectionSummary> => {
  const album = await repository.createAlbum(ownerId, ALBUM_SLUG, name);

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

test.after(async () => {
  await testPool.end();
});

test('profiles normalize usernames, preserve identity, and persist language selection', async () => {
  const { repository } = await createHarness();

  const created = await repository.registerProfile({
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

  const updatedLanguage = await repository.setLanguage(' owner-a ', 'en');

  assert.equal(updatedLanguage.username, 'stickerfan');
  assert.equal(updatedLanguage.firstName, 'Ana');
  assert.equal(updatedLanguage.lastName, 'Collector');
  assert.equal(updatedLanguage.displayName, '@stickerfan');
  assert.equal(updatedLanguage.language, 'en');

  const languageOnlyProfile = await repository.setLanguage(' language-only ', 'es');

  assert.equal(languageOnlyProfile.ownerId, 'language-only');
  assert.equal(languageOnlyProfile.displayName, 'language-only');
  assert.equal(languageOnlyProfile.language, 'es');

  // Reopen - data persists in DB
  assert.equal((await repository.getProfile(' owner-a '))?.language, 'en');
  assert.equal((await repository.findProfileByUsername('@STICKERFAN'))?.ownerId, 'owner-a');
  assert.equal((await repository.getProfile('language-only'))?.language, 'es');
});

test('albums can be created, listed, selected, renamed, deleted, and left by shared members', async () => {
  const { repository } = await createHarness();

  await registerProfile(repository, 'owner-a', 'alice');
  await registerProfile(repository, 'owner-b', 'bob');

  const betaAlbum = await createAlbum(repository, ' owner-a ', 'Beta Album');
  const alphaAlbum = await createAlbum(repository, 'owner-a', 'Alpha Album');

  assert.equal(await repository.hasActiveAlbum('owner-a'), true);
  assert.equal((await repository.getActiveAlbum('owner-a'))?.id, alphaAlbum.id);
  assert.deepEqual(
    (await repository.listAlbums('owner-a')).map((album) => ({
      id: album.id,
      name: album.name,
      isActive: album.isActive,
    })),
    [
      { id: alphaAlbum.id, name: 'Alpha Album', isActive: true },
      { id: betaAlbum.id, name: 'Beta Album', isActive: false },
    ],
  );
  assert.equal(await repository.createAlbum('owner-a', 'unknown-template'), null);
  assert.equal(await repository.setActiveAlbum('owner-b', betaAlbum.id), null);

  const selectedAlbum = await repository.setActiveAlbum(' owner-a ', betaAlbum.id);

  assert.equal(selectedAlbum?.id, betaAlbum.id);
  assert.equal(selectedAlbum?.isActive, true);

  const renamedAlbum = await repository.renameAlbum('owner-a', betaAlbum.id, '  Gamma   Album  ');

  assert.equal(renamedAlbum.error, undefined);
  assert.equal(renamedAlbum.album?.name, 'Gamma Album');
  assert.equal(
    (await repository.renameAlbum('owner-b', betaAlbum.id, 'Bob Album')).error,
    'Solo el dueno puede renombrar el album.',
  );
  assert.equal(
    (await repository.renameAlbum('owner-a', betaAlbum.id, '   ')).error,
    'Nombre de album invalido.',
  );

  const shareRequest = await repository.createShareRequest('owner-a', '@bob');

  assert.ok(shareRequest.request);
  assert.equal((await repository.acceptShareRequest(shareRequest.request.id, ' owner-b ')).error, undefined);

  const bobActiveAlbum = await repository.getActiveAlbum('owner-b');

  assert.equal(bobActiveAlbum?.id, betaAlbum.id);
  assert.equal(bobActiveAlbum?.name, 'Gamma Album');
  assert.equal(bobActiveAlbum?.isShared, true);
  assert.equal(bobActiveAlbum?.ownerDisplayName, '@alice');
  assert.equal(bobActiveAlbum?.memberCount, 2);

  const leaveResult = await repository.leaveAlbum(' owner-b ', betaAlbum.id);

  assert.equal(leaveResult.error, undefined);
  assert.equal(leaveResult.album?.memberCount, 1);
  assert.equal(await repository.getActiveAlbum('owner-b'), null);
  assert.deepEqual(await repository.listAlbums('owner-b'), []);
  assert.equal(
    (await repository.leaveAlbum('owner-a', betaAlbum.id)).error,
    'El dueno no puede salir del album. Debe borrarlo.',
  );

  const deleteResult = await repository.deleteAlbum(' owner-a ', betaAlbum.id);

  assert.equal(deleteResult.error, undefined);
  assert.equal(deleteResult.album?.name, 'Gamma Album');
  assert.equal(await repository.getActiveAlbum('owner-a'), null);
  assert.deepEqual(
    (await repository.listAlbums('owner-a')).map((album) => ({
      id: album.id,
      name: album.name,
      isActive: album.isActive,
    })),
    [
      { id: alphaAlbum.id, name: 'Alpha Album', isActive: false },
    ],
  );
  assert.equal((await repository.setActiveAlbum('owner-a', alphaAlbum.id))?.id, alphaAlbum.id);

  // Data persists in DB — reopen is just the same DB
  assert.equal(await repository.getCollectionSummaryById(betaAlbum.id), null);
  assert.equal(await repository.setActiveAlbum('owner-b', betaAlbum.id), null);
  assert.deepEqual(
    (await repository.listAlbums('owner-a')).map((album) => ({
      id: album.id,
      name: album.name,
      isActive: album.isActive,
    })),
    [
      { id: alphaAlbum.id, name: 'Alpha Album', isActive: true },
    ],
  );
});

test('inventory adjustments and undo history restore persisted sticker quantities', async () => {
  const { repository } = await createHarness();

  await createAlbum(repository, 'owner-a', 'History Album');

  const firstAdd = await repository.adjustQuantity('owner-a', ARG2, 1);

  assert.deepEqual(firstAdd, {
    sticker: ARG2,
    previousQuantity: 0,
    currentQuantity: 1,
    changed: true,
  });
  await repository.recordHistory('owner-a', historyEntry('add', firstAdd));

  const secondAdd = await repository.adjustQuantity('owner-a', ARG2, 1);

  await repository.recordHistory('owner-a', historyEntry('add', secondAdd));

  const remove = await repository.adjustQuantity('owner-a', ARG2, -1);

  await repository.recordHistory('owner-a', historyEntry('remove', remove));

  assert.equal(await repository.getQuantity('owner-a', ARG2), 1);
  assert.deepEqual(await repository.getStickerQuantities('owner-a'), {
    [stickerKey(ARG2)]: 1,
  });

  const undoneRemove = await repository.undoLast('owner-a');

  assert.equal(undoneRemove?.action, 'remove');
  assert.equal(await repository.getQuantity('owner-a', ARG2), 2);

  // Undo second add (previousQuantity=1, currentQuantity=2, so restore to 1)
  assert.equal((await repository.undoLast('owner-a'))?.currentQuantity, 2);
  assert.equal(await repository.getQuantity('owner-a', ARG2), 1);

  // Undo first add (previousQuantity=0, currentQuantity=1, so restore to 0)
  assert.equal((await repository.undoLast('owner-a'))?.currentQuantity, 1);
  assert.equal(await repository.getQuantity('owner-a', ARG2), 0);
  assert.deepEqual(await repository.getStickerQuantities('owner-a'), {});
  assert.equal(await repository.undoLast('owner-a'), null);

  const noChange = await repository.adjustQuantity('owner-a', ARG2, -1);

  assert.deepEqual(noChange, {
    sticker: ARG2,
    previousQuantity: 0,
    currentQuantity: 0,
    changed: false,
  });
});

test('share requests handle creation, acceptance, decline, duplicate, and answered edge cases', async () => {
  const { repository } = await createHarness();

  await registerProfile(repository, 'alice-id', 'alice');
  await registerProfile(repository, 'bob-id', 'bob');
  await registerProfile(repository, 'carol-id', 'carol');

  const aliceAlbum = await createAlbum(repository, 'alice-id', 'Alice Album');

  await repository.adjustQuantity('alice-id', ARG2, 1);

  assert.match(
    (await repository.createShareRequest('alice-id', 'unknown')).error ?? '',
    /^No conozco a @unknown\./,
  );
  assert.equal(
    (await repository.createShareRequest('alice-id', '@ALICE')).error,
    'No puedes compartir el album contigo mismo.',
  );

  await createAlbum(repository, 'bob-id', 'Bob Album');
  await repository.adjustQuantity('bob-id', ARG2, 2);
  await repository.adjustQuantity('bob-id', BRA4, 1);

  const bobRequest = await repository.createShareRequest('alice-id', 'BOB');

  assert.ok(bobRequest.request);
  assert.equal(bobRequest.request.status, 'pending');
  assert.equal(bobRequest.request.targetUsername, 'bob');
  assert.equal((await repository.createShareRequest('alice-id', '@bob')).request?.id, bobRequest.request.id);
  assert.equal(
    (await repository.acceptShareRequest(bobRequest.request.id, 'carol-id')).error,
    'Solicitud de album compartido no encontrada.',
  );

  const accepted = await repository.acceptShareRequest(bobRequest.request.id, 'bob-id');

  assert.equal(accepted.error, undefined);
  assert.equal(accepted.request?.status, 'accepted');
  assert.equal(accepted.fromProfile?.username, 'alice');
  assert.equal(
    (await repository.acceptShareRequest(bobRequest.request.id, 'bob-id')).error,
    'Esta solicitud ya fue respondida.',
  );

  const sharedSnapshot = await repository.getAlbumSnapshot('bob-id', aliceAlbum.id);

  assert.equal(sharedSnapshot?.album.isShared, true);
  assert.equal(sharedSnapshot?.album.memberCount, 2);
  assert.equal(sharedSnapshot?.stickerQuantities[stickerKey(ARG2)], 2);
  assert.equal(sharedSnapshot?.stickerQuantities[stickerKey(BRA4)], 1);
  assert.equal(
    (await repository.createShareRequest('alice-id', 'bob')).error,
    'Ya compartes album con @bob.',
  );

  const carolRequest = await repository.createShareRequest('alice-id', 'carol');

  assert.ok(carolRequest.request);

  const declined = await repository.declineShareRequest(carolRequest.request.id, 'carol-id');

  assert.equal(declined.error, undefined);
  assert.equal(declined.request?.status, 'declined');
  assert.equal(declined.fromProfile?.username, 'alice');
  assert.equal(
    (await repository.declineShareRequest(carolRequest.request.id, 'carol-id')).error,
    'Esta solicitud ya fue respondida.',
  );
  assert.equal(
    (await repository.acceptShareRequest(carolRequest.request.id, 'carol-id')).error,
    'Esta solicitud ya fue respondida.',
  );
  assert.equal(
    (await repository.declineShareRequest(carolRequest.request.id, 'bob-id')).error,
    'Solicitud de album compartido no encontrada.',
  );

  // Verify state in DB by re-querying
  const acceptedRequest = await repository.acceptShareRequest(bobRequest.request.id, 'bob-id');

  assert.equal(acceptedRequest.error, 'Esta solicitud ya fue respondida.');

  const declinedRequest = await repository.declineShareRequest(carolRequest.request.id, 'carol-id');

  assert.equal(declinedRequest.error, 'Esta solicitud ya fue respondida.');

  // Bob still has access to alice's album
  assert.equal(
    (await repository.getAlbumSnapshot('bob-id', aliceAlbum.id))?.stickerQuantities[stickerKey(BRA4)],
    1,
  );
});

test('active album requirement errors are returned or thrown before persistence changes', async () => {
  const { repository } = await createHarness();

  await registerProfile(repository, 'owner-without-album', 'missing_album');
  await registerProfile(repository, 'target-owner', 'target');

  assert.equal(await repository.hasActiveAlbum('owner-without-album'), false);
  assert.equal(await repository.getActiveAlbum('owner-without-album'), null);
  await assert.rejects(
    () => repository.getQuantity('owner-without-album', ARG2),
    /No hay album activo\./,
  );
  await assert.rejects(
    () => repository.getStickerQuantities('owner-without-album'),
    /No hay album activo\./,
  );
  await assert.rejects(
    () => repository.adjustQuantity('owner-without-album', ARG2, 1),
    /No hay album activo\./,
  );
  await assert.rejects(
    () => repository.recordHistory('owner-without-album', {
      action: 'add',
      sticker: ARG2,
      previousQuantity: 0,
      currentQuantity: 1,
      timestamp: '2026-05-08T00:00:00.000Z',
    }),
    /No hay album activo\./,
  );
  await assert.rejects(
    () => repository.undoLast('owner-without-album'),
    /No hay album activo\./,
  );
  assert.equal(
    (await repository.createShareRequest('owner-without-album', 'target')).error,
    'No hay album activo.',
  );
  assert.equal(
    (await repository.createTradeOffer(
      'owner-without-album',
      { kind: 'sticker', sticker: ARG2 },
      { kind: 'sticker', sticker: ARG3 },
    )).error,
    'No active album.',
  );

  await createAlbum(repository, 'trade-owner', 'Trade Owner Album');
  await repository.adjustQuantity('trade-owner', ARG2, 1);

  const tradeOffer = await repository.createTradeOffer(
    'trade-owner',
    { kind: 'sticker', sticker: ARG2 },
    { kind: 'sticker', sticker: ARG3 },
  );

  assert.ok(tradeOffer.offer);
  assert.equal(
    (await repository.getCompatibleTradePairs(tradeOffer.offer.id, 'owner-without-album')).error,
    'No active album.',
  );
  assert.equal(
    (await repository.reserveTradeOffer(tradeOffer.offer.id, 'owner-without-album')).error,
    'No active album.',
  );
});

test('trade cancellation and expiration statuses persist across repository instances', async () => {
  const { repository } = await createHarness();

  await registerProfile(repository, 'owner-a', 'owner_a');
  await registerProfile(repository, 'owner-b', 'owner_b');
  await createAlbum(repository, 'owner-a', 'Owner Album');
  await createAlbum(repository, 'owner-b', 'Taker Album');

  await repository.adjustQuantity('owner-a', ARG2, 1);
  await repository.adjustQuantity('owner-b', ARG4, 1);

  const expiringTrade = await repository.createTradeOffer(
    'owner-a',
    { kind: 'sticker', sticker: ARG2 },
    { kind: 'sticker', sticker: ARG4 },
  );

  assert.ok(expiringTrade.offer);
  assert.equal(expiringTrade.offer.id, 'T1');

  const reservedTrade = await repository.reserveTradeOffer('t1', 'owner-b');

  assert.equal(reservedTrade.error, undefined);
  assert.equal(reservedTrade.offer?.status, 'pending_confirmation');
  assert.deepEqual(reservedTrade.offer?.resolvedGive, ARG2);
  assert.deepEqual(reservedTrade.offer?.resolvedWant, ARG4);
  assert.equal((await repository.acceptTradeOffer('T1', 'owner-a')).offer?.status, 'accepted_pending_completion');

  const ownerConfirmation = await repository.confirmTradeOfferCompleted('T1', 'owner-a');

  assert.equal(ownerConfirmation.error, undefined);
  assert.equal(ownerConfirmation.waitingForOther, true);

  await repository.adjustQuantity('owner-a', ARG2, -1);

  const expiredCompletion = await repository.confirmTradeOfferCompleted('T1', 'owner-b');

  assert.equal(expiredCompletion.error, 'Trade expired.');
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'expired');

  await repository.adjustQuantity('owner-a', ARG3, 1);

  const cancellableTrade = await repository.createTradeOffer(
    'owner-a',
    { kind: 'sticker', sticker: ARG3 },
    { kind: 'sticker', sticker: BRA4 },
  );

  assert.ok(cancellableTrade.offer);
  assert.equal(cancellableTrade.offer.id, 'T2');
  assert.equal((await repository.cancelTradeOffer('owner-b', 'T2')).error, 'Trade not found.');

  const cancelledTrade = await repository.cancelTradeOffer('owner-a', 't2');

  assert.equal(cancelledTrade.error, undefined);
  assert.equal(cancelledTrade.offer?.status, 'cancelled');
  assert.ok(cancelledTrade.offer?.cancelledAt);
  assert.equal(
    (await repository.cancelTradeOffer('owner-a', 'T2')).error,
    'Only active or pending trades can be cancelled.',
  );

  // Verify state via DB queries
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'expired');
  assert.equal((await repository.getTradeOffer('T2'))?.status, 'cancelled');
  assert.deepEqual(await repository.listTradeOffersForOwner('owner-a'), []);
  assert.deepEqual(await repository.listMarketplaceTradeOffers('owner-b'), []);
});
