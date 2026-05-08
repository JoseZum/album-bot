import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type StickerRef } from '../../src/catalog/world-cup.catalog';
import { parseStickerMessage } from '../../src/parsers/sticker-message.parser';
import { CollectionRepository } from '../../src/repositories/collection.repository';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG3: StickerRef = { countryCode: 'ARG', number: 3 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const BRA4: StickerRef = { countryCode: 'BRA', number: 4 };
const BRA5: StickerRef = { countryCode: 'BRA', number: 5 };

const createHarness = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-unit-trade-'));
  const repository = new CollectionRepository(path.join(directory, 'collection.json'));

  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });

  return {
    repository,
    cleanup,
  };
};

const registerUser = (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
) => {
  repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });
  const album = repository.createAlbum(ownerId, ALBUM_SLUG, `${username} album`);

  assert.ok(album);
};

const offerIds = (offers: Array<{ id: string }>) => offers.map((offer) => offer.id);

test('parser accepts marketplace direction filters and rejects bare sticker filters', () => {
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

test('parser accepts unscoped and country-scoped wildcard trade operands', () => {
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

test('repository marketplace direction filters keep wildcard give and need sides separate', () => {
  const { repository, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 2);

    const created = repository.createTradeOffer(
      'owner-a',
      { kind: 'duplicate' },
      { kind: 'missing' },
    );

    assert.ok(created.offer);
    assert.deepEqual(
      offerIds(repository.listMarketplaceTradeOffers('owner-b', { giveSticker: ARG2 })),
      ['T1'],
    );
    assert.deepEqual(
      offerIds(repository.listMarketplaceTradeOffers('owner-b', { giveSticker: BRA4 })),
      [],
    );
    assert.deepEqual(
      offerIds(repository.listMarketplaceTradeOffers('owner-b', { needSticker: BRA4 })),
      ['T1'],
    );
    assert.deepEqual(
      offerIds(repository.listMarketplaceTradeOffers('owner-b', { needSticker: ARG2 })),
      [],
    );
  } finally {
    cleanup();
  }
});

test('repository resolves wildcard duplicate and missing selectors against current inventories', () => {
  const { repository, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 2);
    repository.adjustQuantity('owner-a', ARG3, 1);
    repository.adjustQuantity('owner-a', BRA4, 1);
    repository.adjustQuantity('owner-b', BRA4, 1);
    repository.adjustQuantity('owner-b', BRA5, 1);

    const created = repository.createTradeOffer(
      'owner-a',
      { kind: 'duplicate', countryCode: 'ARG' },
      { kind: 'missing', countryCode: 'BRA' },
    );

    assert.ok(created.offer);

    const compatibility = repository.getCompatibleTradePairs('T1', 'owner-b');

    assert.ok(compatibility.pairs);
    assert.deepEqual(compatibility.pairs, [
      {
        give: ARG2,
        want: BRA5,
      },
    ]);

    const reservation = repository.reserveTradeOffer('T1', 'owner-b');

    assert.equal(reservation.error, undefined);
    assert.equal(reservation.offer?.status, 'pending_confirmation');
    assert.equal(reservation.offer?.reservedByOwnerId, 'owner-b');
    assert.deepEqual(reservation.offer?.resolvedGive, ARG2);
    assert.deepEqual(reservation.offer?.resolvedWant, BRA5);
  } finally {
    cleanup();
  }
});
