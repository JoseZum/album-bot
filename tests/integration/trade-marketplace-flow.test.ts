import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type StickerRef } from '../../src/catalog/world-cup.catalog';
import { CollectionRepository } from '../../src/repositories/collection.repository';
import { StickerBotService } from '../../src/services/sticker-bot.service';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG3: StickerRef = { countryCode: 'ARG', number: 3 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };

type Harness = {
  dataFilePath: string;
  repository: CollectionRepository;
  service: StickerBotService;
  cleanup: () => void;
};

const createHarness = (): Harness => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-marketplace-'));
  const dataFilePath = path.join(directory, 'collection.json');
  const repository = new CollectionRepository(dataFilePath);
  const service = new StickerBotService(repository);

  return {
    dataFilePath,
    repository,
    service,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
};

const withHarness = (run: (harness: Harness) => void): void => {
  const harness = createHarness();

  try {
    run(harness);
  } finally {
    harness.cleanup();
  }
};

const registerUserWithAlbum = (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
): void => {
  repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });

  const album = repository.createAlbum(ownerId, ALBUM_SLUG, `${username} album`);

  assert.ok(album);
};

const assertQuantities = (
  repository: CollectionRepository,
  expected: {
    ownerArg2: number;
    ownerArg4: number;
    takerArg2: number;
    takerArg4: number;
  },
): void => {
  assert.equal(repository.getQuantity('owner-a', ARG2), expected.ownerArg2);
  assert.equal(repository.getQuantity('owner-a', ARG4), expected.ownerArg4);
  assert.equal(repository.getQuantity('owner-b', ARG2), expected.takerArg2);
  assert.equal(repository.getQuantity('owner-b', ARG4), expected.takerArg4);
};

test('trade marketplace lifecycle completes only after both participants confirm', () => withHarness(({
  dataFilePath,
  repository,
  service,
}) => {
  registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  repository.adjustQuantity('owner-a', ARG2, 1);
  repository.adjustQuantity('owner-b', ARG4, 1);

  const created = service.handleMessage('trade arg2 arg4', 'owner-a');
  assert.match(created.reply, /Trade posted/);
  assert.equal(repository.getTradeOffer('T1')?.status, 'active');
  assert.ok(fs.existsSync(dataFilePath));

  const givesArg2 = service.handleMessage('marketplace -give arg2', 'owner-b');
  const needsArg4 = service.handleMessage('marketplace -need arg4', 'owner-b');
  const givesArg4 = service.handleMessage('marketplace -give arg4', 'owner-b');
  const needsArg2 = service.handleMessage('marketplace -need arg2', 'owner-b');

  assert.match(givesArg2.reply, /#T1\b/);
  assert.match(needsArg4.reply, /#T1\b/);
  assert.doesNotMatch(givesArg4.reply, /#T1\b/);
  assert.doesNotMatch(needsArg2.reply, /#T1\b/);
  assert.match(JSON.stringify(givesArg2.replyMarkup), /trade:propose:T1/);

  const proposed = service.handleCallbackData('trade:propose:T1', 'owner-b');
  assert.match(proposed.reply, /Trade proposal sent/);
  assert.equal(repository.getTradeOffer('T1')?.status, 'pending_confirmation');
  assert.equal(proposed.outboundMessages?.[0]?.chatId, 'owner-a');
  assert.match(JSON.stringify(proposed.outboundMessages?.[0]?.replyMarkup), /trade:accept:T1/);

  const hiddenWhilePending = service.handleMessage('marketplace -need arg4', 'owner-b');
  assert.doesNotMatch(hiddenWhilePending.reply, /#T1\b/);

  const accepted = service.handleCallbackData('trade:accept:T1', 'owner-a');
  assert.match(accepted.reply, /Coordination accepted/);
  assert.equal(repository.getTradeOffer('T1')?.status, 'accepted_pending_completion');
  assert.equal(accepted.outboundMessages?.[0]?.chatId, 'owner-b');

  assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });

  const ownerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-a');
  assert.match(ownerConfirmed.reply, /Waiting for the other person/);
  assert.equal(repository.getTradeOffer('T1')?.status, 'accepted_pending_completion');

  assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });

  const takerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-b');
  assert.equal(takerConfirmed.reply, 'Trade completed. Inventory updated.');
  assert.equal(repository.getTradeOffer('T1')?.status, 'completed');

  assertQuantities(repository, {
    ownerArg2: 0,
    ownerArg4: 1,
    takerArg2: 1,
    takerArg4: 0,
  });

  const persistedRepository = new CollectionRepository(dataFilePath);
  assert.equal(persistedRepository.getTradeOffer('T1')?.status, 'completed');
  assert.equal(persistedRepository.getQuantity('owner-a', ARG4), 1);
  assert.equal(persistedRepository.getQuantity('owner-b', ARG2), 1);
}));

test('trade expires when resolved inventory disappears before final completion', () => withHarness(({
  repository,
  service,
}) => {
  registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  repository.adjustQuantity('owner-a', ARG2, 1);
  repository.adjustQuantity('owner-b', ARG4, 1);

  assert.match(service.handleMessage('trade arg2 arg4', 'owner-a').reply, /Trade posted/);
  assert.match(service.handleCallbackData('trade:propose:T1', 'owner-b').reply, /Trade proposal sent/);
  assert.match(service.handleCallbackData('trade:accept:T1', 'owner-a').reply, /Coordination accepted/);

  const ownerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-a');
  assert.match(ownerConfirmed.reply, /Waiting for the other person/);

  repository.adjustQuantity('owner-a', ARG2, -1);

  const takerConfirmed = service.handleCallbackData('trade:complete:T1', 'owner-b');
  assert.equal(takerConfirmed.reply, 'Trade expired.');
  assert.equal(repository.getTradeOffer('T1')?.status, 'expired');

  assertQuantities(repository, {
    ownerArg2: 0,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });
}));

test('owner can cancel active and pending own marketplace trades', () => withHarness(({
  repository,
  service,
}) => {
  registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  repository.adjustQuantity('owner-a', ARG2, 1);
  repository.adjustQuantity('owner-a', ARG3, 1);
  repository.adjustQuantity('owner-b', ARG4, 1);

  assert.match(service.handleMessage('trade arg2 arg4', 'owner-a').reply, /Trade posted/);
  assert.match(service.handleMessage('marketplace -mine', 'owner-a').reply, /#T1\b/);

  const activeCancellation = service.handleCallbackData('trade:cancel:T1', 'owner-a');
  assert.equal(activeCancellation.reply, 'Trade cancelled: #T1.');
  assert.equal(activeCancellation.outboundMessages, undefined);
  assert.equal(repository.getTradeOffer('T1')?.status, 'cancelled');
  assert.doesNotMatch(service.handleMessage('marketplace -give arg2', 'owner-b').reply, /#T1\b/);

  assert.match(service.handleMessage('trade arg3 arg4', 'owner-a').reply, /Trade posted/);
  assert.match(service.handleCallbackData('trade:propose:T2', 'owner-b').reply, /Trade proposal sent/);
  assert.equal(repository.getTradeOffer('T2')?.status, 'pending_confirmation');

  const pendingCancellation = service.handleMessage('trade cancel T2', 'owner-a');
  assert.equal(pendingCancellation.reply, 'Trade cancelled: #T2.');
  assert.equal(pendingCancellation.outboundMessages?.[0]?.chatId, 'owner-b');
  assert.match(pendingCancellation.outboundMessages?.[0]?.text ?? '', /cancelled/);
  assert.equal(repository.getTradeOffer('T2')?.status, 'cancelled');

  assert.equal(service.handleMessage('trades', 'owner-a').reply, 'You have no active or pending trades.');
  assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });
  assert.equal(repository.getQuantity('owner-a', ARG3), 1);
}));
