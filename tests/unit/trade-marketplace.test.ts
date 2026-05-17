import test from 'node:test';
import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { type StickerRef } from '../../src/catalog/world-cup.catalog';
import { parseStickerMessage } from '../../src/parsers/sticker-message.parser';
import { CollectionRepository } from '../../src/repositories/collection.repository';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG3: StickerRef = { countryCode: 'ARG', number: 3 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const BRA4: StickerRef = { countryCode: 'BRA', number: 4 };
const BRA5: StickerRef = { countryCode: 'BRA', number: 5 };

const testPool = new Pool({ connectionString: 'postgres://album_bot:album_bot_password@localhost:5433/album_bot' });

const TRUNCATE_SQL = `TRUNCATE user_album_events, user_album_items, trade_offers, collector_active_albums, user_album_members, album_share_requests, collector_friends, friend_requests, user_albums, collector_profiles RESTART IDENTITY CASCADE; ALTER SEQUENCE trade_offer_sequence RESTART WITH 1`;

const createHarness = async () => {
  await testPool.query(TRUNCATE_SQL);
  const repository = new CollectionRepository(testPool);

  return { repository };
};

const serialTest = (name: string, fn: () => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const registerUser = async (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
) => {
  await repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });
  const album = await repository.createAlbum(ownerId, ALBUM_SLUG, `${username} album`);

  assert.ok(album);
};

const offerIds = (offers: Array<{ id: string }>) => offers.map((offer) => offer.id);

test.after(async () => {
  await testPool.end();
});

serialTest('parser accepts marketplace direction filters and rejects bare sticker filters', () => {
  const giveParsed = parseStickerMessage('marketplace -give arg4');
  const needParsed = parseStickerMessage('marketplace -need arg4');
  const bareStickerParsed = parseStickerMessage('marketplace arg4');

  assert.equal(giveParsed.intent, 'marketplaceSearch');
  assert.equal(needParsed.intent, 'marketplaceSearch');
  assert.equal(bareStickerParsed.intent, 'unknown');

  if (giveParsed.intent === 'marketplaceSearch') {
    assert.deepEqual(giveParsed.search, { giveSticker: ARG4 });
  }

  if (needParsed.intent === 'marketplaceSearch') {
    assert.deepEqual(needParsed.search, { needSticker: ARG4 });
  }

  if (bareStickerParsed.intent === 'unknown') {
    assert.equal(
      bareStickerParsed.reason,
      'Marketplace filter must be @username, -mine, -give arg4, or -need arg4.',
    );
  }
});

serialTest('parser accepts unscoped and country-scoped wildcard trade operands', () => {
  const unscopedParsed = parseStickerMessage('trade -duplicate -missing');
  const scopedParsed = parseStickerMessage('trade -duplicate argentina -missing brazil');

  assert.equal(unscopedParsed.intent, 'tradeCreate');
  assert.equal(scopedParsed.intent, 'tradeCreate');

  if (unscopedParsed.intent === 'tradeCreate') {
    assert.deepEqual(unscopedParsed.give, { kind: 'duplicate' });
    assert.deepEqual(unscopedParsed.want, { kind: 'missing' });
  }

  if (scopedParsed.intent === 'tradeCreate') {
    assert.deepEqual(scopedParsed.give, {
      kind: 'duplicate',
      countryCode: 'ARG',
    });
    assert.deepEqual(scopedParsed.want, {
      kind: 'missing',
      countryCode: 'BRA',
    });
  }
});

serialTest('repository marketplace direction filters keep wildcard give and need sides separate', async () => {
  const { repository } = await createHarness();

  await registerUser(repository, 'owner-a', 'tester_a');
  await registerUser(repository, 'owner-b', 'tester_b');

  await repository.adjustQuantity('owner-a', ARG2, 2);

  const created = await repository.createTradeOffer(
    'owner-a',
    { kind: 'duplicate' },
    { kind: 'missing' },
  );

  assert.ok(created.offer);
  assert.deepEqual(
    offerIds(await repository.listMarketplaceTradeOffers('owner-b', { giveSticker: ARG2 })),
    ['T1'],
  );
  assert.deepEqual(
    offerIds(await repository.listMarketplaceTradeOffers('owner-b', { giveSticker: BRA4 })),
    [],
  );
  assert.deepEqual(
    offerIds(await repository.listMarketplaceTradeOffers('owner-b', { needSticker: BRA4 })),
    ['T1'],
  );
  assert.deepEqual(
    offerIds(await repository.listMarketplaceTradeOffers('owner-b', { needSticker: ARG2 })),
    [],
  );
});

serialTest('repository resolves wildcard duplicate and missing selectors against current inventories', async () => {
  const { repository } = await createHarness();

  await registerUser(repository, 'owner-a', 'tester_a');
  await registerUser(repository, 'owner-b', 'tester_b');

  await repository.adjustQuantity('owner-a', ARG2, 2);
  await repository.adjustQuantity('owner-a', ARG3, 1);
  await repository.adjustQuantity('owner-a', BRA4, 1);
  await repository.adjustQuantity('owner-b', BRA4, 1);
  await repository.adjustQuantity('owner-b', BRA5, 1);

  const created = await repository.createTradeOffer(
    'owner-a',
    { kind: 'duplicate', countryCode: 'ARG' },
    { kind: 'missing', countryCode: 'BRA' },
  );

  assert.ok(created.offer);

  const compatibility = await repository.getCompatibleTradePairs('T1', 'owner-b');

  assert.ok(compatibility.pairs);
  assert.deepEqual(compatibility.pairs, [
    {
      give: ARG2,
      want: BRA5,
    },
  ]);

  const reservation = await repository.reserveTradeOffer('T1', 'owner-b');

  assert.equal(reservation.error, undefined);
  assert.equal(reservation.offer?.status, 'pending_confirmation');
  assert.equal(reservation.offer?.reservedByOwnerId, 'owner-b');
  assert.deepEqual(reservation.offer?.resolvedGive, ARG2);
  assert.deepEqual(reservation.offer?.resolvedWant, BRA5);
});
