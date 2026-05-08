import test from 'node:test';
import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { type StickerRef } from '../../src/catalog/world-cup.catalog';
import { CollectionRepository } from '../../src/repositories/collection.repository';
import { StickerBotService } from '../../src/services/sticker-bot.service';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG3: StickerRef = { countryCode: 'ARG', number: 3 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };

const testPool = new Pool({ connectionString: 'postgres://album_bot:album_bot_password@localhost:5433/album_bot' });

const TRUNCATE_SQL = `
  TRUNCATE user_album_events, user_album_items, trade_offers,
    collector_active_albums, user_album_members, album_share_requests,
    user_albums, collector_profiles RESTART IDENTITY CASCADE;
  ALTER SEQUENCE trade_offer_sequence RESTART WITH 1
`;

type Harness = {
  repository: CollectionRepository;
  service: StickerBotService;
};

const createHarness = async (): Promise<Harness> => {
  await testPool.query(TRUNCATE_SQL);
  const repository = new CollectionRepository(testPool);
  const service = new StickerBotService(repository);

  return { repository, service };
};

const withHarness = async (run: (harness: Harness) => Promise<void>): Promise<void> => {
  const harness = await createHarness();
  await run(harness);
};

const registerUserWithAlbum = async (
  repository: CollectionRepository,
  ownerId: string,
  username: string,
): Promise<void> => {
  await repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });

  const album = await repository.createAlbum(ownerId, ALBUM_SLUG, `${username} album`);

  assert.ok(album);
};

const assertQuantities = async (
  repository: CollectionRepository,
  expected: {
    ownerArg2: number;
    ownerArg4: number;
    takerArg2: number;
    takerArg4: number;
  },
): Promise<void> => {
  assert.equal(await repository.getQuantity('owner-a', ARG2), expected.ownerArg2);
  assert.equal(await repository.getQuantity('owner-a', ARG4), expected.ownerArg4);
  assert.equal(await repository.getQuantity('owner-b', ARG2), expected.takerArg2);
  assert.equal(await repository.getQuantity('owner-b', ARG4), expected.takerArg4);
};

test('trade marketplace lifecycle completes only after both participants confirm', async () => withHarness(async ({
  repository,
  service,
}) => {
  await registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  await registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  await repository.adjustQuantity('owner-a', ARG2, 1);
  await repository.adjustQuantity('owner-b', ARG4, 1);

  const created = await service.handleMessage('trade arg2 arg4', 'owner-a');
  assert.match(created.reply, /Trade posted/);
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'active');

  const givesArg2 = await service.handleMessage('marketplace -give arg2', 'owner-b');
  const needsArg4 = await service.handleMessage('marketplace -need arg4', 'owner-b');
  const givesArg4 = await service.handleMessage('marketplace -give arg4', 'owner-b');
  const needsArg2 = await service.handleMessage('marketplace -need arg2', 'owner-b');

  assert.match(givesArg2.reply, /#T1\b/);
  assert.match(needsArg4.reply, /#T1\b/);
  assert.doesNotMatch(givesArg4.reply, /#T1\b/);
  assert.doesNotMatch(needsArg2.reply, /#T1\b/);
  assert.match(JSON.stringify(givesArg2.replyMarkup), /trade:propose:T1/);

  const proposed = await service.handleCallbackData('trade:propose:T1', 'owner-b');
  assert.match(proposed.reply, /Trade proposal sent/);
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'pending_confirmation');
  assert.equal(proposed.outboundMessages?.[0]?.chatId, 'owner-a');
  assert.match(JSON.stringify(proposed.outboundMessages?.[0]?.replyMarkup), /trade:accept:T1/);

  const hiddenWhilePending = await service.handleMessage('marketplace -need arg4', 'owner-b');
  assert.doesNotMatch(hiddenWhilePending.reply, /#T1\b/);

  const accepted = await service.handleCallbackData('trade:accept:T1', 'owner-a');
  assert.match(accepted.reply, /Coordination accepted/);
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'accepted_pending_completion');
  assert.equal(accepted.outboundMessages?.[0]?.chatId, 'owner-b');

  await assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });

  const ownerConfirmed = await service.handleCallbackData('trade:complete:T1', 'owner-a');
  assert.match(ownerConfirmed.reply, /Waiting for the other person/);
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'accepted_pending_completion');

  await assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });

  const takerConfirmed = await service.handleCallbackData('trade:complete:T1', 'owner-b');
  assert.equal(takerConfirmed.reply, 'Trade completed. Inventory updated.');
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'completed');

  await assertQuantities(repository, {
    ownerArg2: 0,
    ownerArg4: 1,
    takerArg2: 1,
    takerArg4: 0,
  });

  const persistedRepository = new CollectionRepository(testPool);
  assert.equal((await persistedRepository.getTradeOffer('T1'))?.status, 'completed');
  assert.equal(await persistedRepository.getQuantity('owner-a', ARG4), 1);
  assert.equal(await persistedRepository.getQuantity('owner-b', ARG2), 1);
}));

test('trade expires when resolved inventory disappears before final completion', async () => withHarness(async ({
  repository,
  service,
}) => {
  await registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  await registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  await repository.adjustQuantity('owner-a', ARG2, 1);
  await repository.adjustQuantity('owner-b', ARG4, 1);

  assert.match((await service.handleMessage('trade arg2 arg4', 'owner-a')).reply, /Trade posted/);
  assert.match((await service.handleCallbackData('trade:propose:T1', 'owner-b')).reply, /Trade proposal sent/);
  assert.match((await service.handleCallbackData('trade:accept:T1', 'owner-a')).reply, /Coordination accepted/);

  const ownerConfirmed = await service.handleCallbackData('trade:complete:T1', 'owner-a');
  assert.match(ownerConfirmed.reply, /Waiting for the other person/);

  await repository.adjustQuantity('owner-a', ARG2, -1);

  const takerConfirmed = await service.handleCallbackData('trade:complete:T1', 'owner-b');
  assert.equal(takerConfirmed.reply, 'Trade expired.');
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'expired');

  await assertQuantities(repository, {
    ownerArg2: 0,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });
}));

test('owner can cancel active and pending own marketplace trades', async () => withHarness(async ({
  repository,
  service,
}) => {
  await registerUserWithAlbum(repository, 'owner-a', 'tester_a');
  await registerUserWithAlbum(repository, 'owner-b', 'tester_b');

  await repository.adjustQuantity('owner-a', ARG2, 1);
  await repository.adjustQuantity('owner-a', ARG3, 1);
  await repository.adjustQuantity('owner-b', ARG4, 1);

  assert.match((await service.handleMessage('trade arg2 arg4', 'owner-a')).reply, /Trade posted/);
  assert.match((await service.handleMessage('marketplace -mine', 'owner-a')).reply, /#T1\b/);

  const activeCancellation = await service.handleCallbackData('trade:cancel:T1', 'owner-a');
  assert.equal(activeCancellation.reply, 'Trade cancelled: #T1.');
  assert.equal(activeCancellation.outboundMessages, undefined);
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'cancelled');
  assert.doesNotMatch((await service.handleMessage('marketplace -give arg2', 'owner-b')).reply, /#T1\b/);

  assert.match((await service.handleMessage('trade arg3 arg4', 'owner-a')).reply, /Trade posted/);
  assert.match((await service.handleCallbackData('trade:propose:T2', 'owner-b')).reply, /Trade proposal sent/);
  assert.equal((await repository.getTradeOffer('T2'))?.status, 'pending_confirmation');

  const pendingCancellation = await service.handleMessage('trade cancel T2', 'owner-a');
  assert.equal(pendingCancellation.reply, 'Trade cancelled: #T2.');
  assert.equal(pendingCancellation.outboundMessages?.[0]?.chatId, 'owner-b');
  assert.match(pendingCancellation.outboundMessages?.[0]?.text ?? '', /cancelled/);
  assert.equal((await repository.getTradeOffer('T2'))?.status, 'cancelled');

  assert.equal((await service.handleMessage('trades', 'owner-a')).reply, 'You have no active or pending trades.');
  await assertQuantities(repository, {
    ownerArg2: 1,
    ownerArg4: 0,
    takerArg2: 0,
    takerArg4: 1,
  });
  assert.equal(await repository.getQuantity('owner-a', ARG3), 1);
}));

test.after(async () => {
  await testPool.end();
});
