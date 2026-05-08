import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type StickerRef } from '../catalog/world-cup.catalog';
import { parseStickerMessage } from '../parsers/sticker-message.parser';
import { CollectionRepository } from '../repositories/collection.repository';
import { StickerBotService } from '../services/sticker-bot.service';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const BRA4: StickerRef = { countryCode: 'BRA', number: 4 };

const createHarness = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-trade-'));
  const repository = new CollectionRepository(path.join(directory, 'collection.json'));
  const service = new StickerBotService(repository);

  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });

  return {
    repository,
    service,
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

test('parser handles trade wildcards and marketplace filters', () => {
  const tradeParsed = parseStickerMessage('trade -duplicate arg -missing bra');

  assert.equal(tradeParsed.intent, 'tradeCreate');

  if (tradeParsed.intent === 'tradeCreate') {
    assert.deepEqual(tradeParsed.give, {
      kind: 'duplicate',
      countryCode: 'ARG',
    });
    assert.deepEqual(tradeParsed.want, {
      kind: 'missing',
      countryCode: 'BRA',
    });
  }

  const tradeParsedSimple = parseStickerMessage('trade arg2 arg4');

  assert.equal(tradeParsedSimple.intent, 'tradeCreate');

  const marketplaceUser = parseStickerMessage('marketplace @tester_a');
  const marketplaceGiveSticker = parseStickerMessage('marketplace -give arg4');
  const marketplaceNeedSticker = parseStickerMessage('marketplace -need arg4');
  const marketplaceMine = parseStickerMessage('marketplace -mine');

  assert.equal(marketplaceUser.intent, 'marketplaceSearch');
  assert.equal(marketplaceGiveSticker.intent, 'marketplaceSearch');
  assert.equal(marketplaceNeedSticker.intent, 'marketplaceSearch');
  assert.equal(marketplaceMine.intent, 'marketplaceSearch');

  if (marketplaceUser.intent === 'marketplaceSearch') {
    assert.equal(marketplaceUser.search.ownerUsername, 'tester_a');
  }

  if (marketplaceGiveSticker.intent === 'marketplaceSearch') {
    assert.deepEqual(marketplaceGiveSticker.search.giveSticker, ARG4);
  }

  if (marketplaceNeedSticker.intent === 'marketplaceSearch') {
    assert.deepEqual(marketplaceNeedSticker.search.needSticker, ARG4);
  }

  if (marketplaceMine.intent === 'marketplaceSearch') {
    assert.equal(marketplaceMine.search.mineOnly, true);
  }
});

test('repository resolves wildcard pairs against current inventories', () => {
  const { repository, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 2);
    repository.adjustQuantity('owner-b', BRA4, 1);

    const created = repository.createTradeOffer(
      'owner-a',
      { kind: 'duplicate' },
      { kind: 'missing', countryCode: 'BRA' },
    );

    assert.ok(created.offer);

    const compatibility = repository.getCompatibleTradePairs(created.offer!.id, 'owner-b');

    assert.ok(compatibility.pairs);
    assert.deepEqual(compatibility.pairs, [
      {
        give: ARG2,
        want: BRA4,
      },
    ]);
  } finally {
    cleanup();
  }
});

test('marketplace direction filters give and need sides separately', () => {
  const { repository, service, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 2);
    repository.adjustQuantity('owner-b', ARG4, 1);

    service.handleMessage('trade -duplicate arg4', 'owner-a');

    const givesArg2 = service.handleMessage('marketplace -give arg2', 'owner-b');
    const givesArg4 = service.handleMessage('marketplace -give arg4', 'owner-b');
    const needsArg4 = service.handleMessage('marketplace -need arg4', 'owner-b');

    assert.match(givesArg2.reply, /#T1/);
    assert.doesNotMatch(givesArg4.reply, /#T1/);
    assert.match(needsArg4.reply, /#T1/);
  } finally {
    cleanup();
  }
});

test('trade inventory only changes after both people confirm completion', () => {
  const { repository, service, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 1);
    repository.adjustQuantity('owner-b', ARG4, 1);

    const created = service.handleMessage('trade arg2 arg4', 'owner-a');
    assert.match(created.reply, /Trade posted/);

    const marketplace = service.handleMessage('marketplace -need arg4', 'owner-b');
    assert.match(marketplace.reply, /#T1/);

    const proposed = service.handleCallbackData('trade:propose:T1', 'owner-b');
    assert.match(proposed.reply, /Trade proposal sent/);

    const accepted = service.handleCallbackData('trade:accept:T1', 'owner-a');
    assert.match(accepted.reply, /Coordination accepted/);

    const ownerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-a');
    assert.match(ownerConfirmed.reply, /Waiting for the other person/);

    assert.equal(repository.getQuantity('owner-a', ARG2), 1);
    assert.equal(repository.getQuantity('owner-a', ARG4), 0);
    assert.equal(repository.getQuantity('owner-b', ARG2), 0);
    assert.equal(repository.getQuantity('owner-b', ARG4), 1);

    const takerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-b');
    assert.equal(takerConfirmed.reply, 'Trade completed. Inventory updated.');

    assert.equal(repository.getQuantity('owner-a', ARG2), 0);
    assert.equal(repository.getQuantity('owner-a', ARG4), 1);
    assert.equal(repository.getQuantity('owner-b', ARG2), 1);
    assert.equal(repository.getQuantity('owner-b', ARG4), 0);
  } finally {
    cleanup();
  }
});

test('trade expires when inventory is no longer available at completion time', () => {
  const { repository, service, cleanup } = createHarness();

  try {
    registerUser(repository, 'owner-a', 'tester_a');
    registerUser(repository, 'owner-b', 'tester_b');

    repository.adjustQuantity('owner-a', ARG2, 1);
    repository.adjustQuantity('owner-b', ARG4, 1);

    service.handleMessage('trade arg2 arg4', 'owner-a');
    service.handleCallbackData('trade:propose:T1', 'owner-b');
    service.handleCallbackData('trade:accept:T1', 'owner-a');

    repository.adjustQuantity('owner-b', ARG4, -1);

    const completion = service.handleCallbackData('trade:complete:T1', 'owner-a');

    assert.equal(completion.reply, 'Trade expired.');
    assert.equal(repository.getTradeOffer('T1')?.status, 'expired');
    assert.equal(repository.getQuantity('owner-a', ARG2), 1);
    assert.equal(repository.getQuantity('owner-a', ARG4), 0);
    assert.equal(repository.getQuantity('owner-b', ARG2), 0);
    assert.equal(repository.getQuantity('owner-b', ARG4), 0);
  } finally {
    cleanup();
  }
});
