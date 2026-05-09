import test from 'node:test';
import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { type StickerRef } from '../../src/catalog/world-cup.catalog';
import {
  CollectionRepository,
  type CollectionSummary,
} from '../../src/repositories/collection.repository';
import { StickerBotService } from '../../src/services/sticker-bot.service';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';

const ARG1: StickerRef = { countryCode: 'ARG', number: 1 };
const ARG2: StickerRef = { countryCode: 'ARG', number: 2 };
const ARG5: StickerRef = { countryCode: 'ARG', number: 5 };
const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const ARG10: StickerRef = { countryCode: 'ARG', number: 10 };
const BRA3: StickerRef = { countryCode: 'BRA', number: 3 };
const BRA4: StickerRef = { countryCode: 'BRA', number: 4 };
const CC1: StickerRef = { countryCode: 'CC', number: 1 };
const FWC9: StickerRef = { countryCode: 'FWC', number: 9 };
const FRA9: StickerRef = { countryCode: 'FRA', number: 9 };
const JPN3: StickerRef = { countryCode: 'JPN', number: 3 };
const JPN10: StickerRef = { countryCode: 'JPN', number: 10 };

type Harness = {
  repository: CollectionRepository;
  service: StickerBotService;
};

const testPool = new Pool({ connectionString: 'postgres://album_bot:album_bot_password@localhost:5433/album_bot' });

const TRUNCATE_SQL = `TRUNCATE user_album_events, user_album_items, trade_offers, collector_active_albums, user_album_members, album_share_requests, collector_friends, friend_requests, user_albums, collector_profiles RESTART IDENTITY CASCADE; ALTER SEQUENCE trade_offer_sequence RESTART WITH 1`;

const createHarness = async (): Promise<Harness> => {
  await testPool.query(TRUNCATE_SQL);
  const repository = new CollectionRepository(testPool);
  const service = new StickerBotService(repository);

  return { repository, service };
};

test.after(async () => {
  await testPool.end();
});

const registerUser = async (
  service: StickerBotService,
  ownerId: string,
  username: string,
): Promise<void> => {
  await service.registerUser({
    ownerId,
    username,
    language: 'en',
  });
};

const createAlbum = async (
  repository: CollectionRepository,
  ownerId: string,
  name: string,
): Promise<CollectionSummary> => {
  const album = await repository.createAlbum(ownerId, ALBUM_SLUG, name);

  assert.ok(album);

  return album;
};

const registerUserWithAlbum = async (
  service: StickerBotService,
  repository: CollectionRepository,
  ownerId: string,
  username: string,
  albumName: string,
): Promise<CollectionSummary> => {
  await registerUser(service, ownerId, username);

  return createAlbum(repository, ownerId, albumName);
};

const stringifyMarkup = (markup: unknown): string => JSON.stringify(markup);

const findCallbackData = (markup: unknown, pattern: RegExp): string => {
  const callbackData: string[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.callback_data === 'string') {
      callbackData.push(record.callback_data);
    }

    Object.values(record).forEach(visit);
  };

  visit(markup);

  const match = callbackData.find((value) => pattern.test(value));

  assert.ok(
    match,
    `Expected callback matching ${pattern} in ${stringifyMarkup(markup)}`,
  );

  return match;
};

test('language selection gates messages until a language callback is handled', async () => {
  const { repository, service } = await createHarness();

  const blockedAdd = await service.handleMessage('add arg4', 'owner-a');

  assert.equal(blockedAdd.parsed.intent, 'addSticker');
  assert.equal(blockedAdd.reply, 'Choose your language.');
  assert.match(stringifyMarkup(blockedAdd.replyMarkup), /lang:en/);
  assert.equal(await repository.getProfile('owner-a'), undefined);

  const blockedStart = await service.handleMessage('/start', 'owner-a');

  assert.equal(blockedStart.parsed.intent, 'start');
  assert.equal(blockedStart.reply, 'Choose your language.');

  assert.equal(
    (await service.handleCallbackData('lang:unknown', 'owner-a')).reply,
    'Invalid action.',
  );

  const selected = await service.handleCallbackData('lang:en', 'owner-a');

  assert.match(selected.reply, /^Hi! I'll help you track your 2026 World Cup sticker album\./);
  assert.equal((await repository.getProfile('owner-a'))?.language, 'en');

  const albumRequired = await service.handleMessage('progress', 'owner-a');

  assert.equal(albumRequired.parsed.intent, 'progress');
  assert.match(albumRequired.reply, /^Hi! I'll help you track your 2026 World Cup sticker album\./);

  const anyRequired = await service.handleMessage('any1', 'owner-a');

  assert.equal(anyRequired.parsed.intent, 'anyNumber');
  assert.match(anyRequired.reply, /^Hi! I'll help you track your 2026 World Cup sticker album\./);

  const languageMenu = await service.handleMessage('language', 'owner-a');

  assert.equal(languageMenu.reply, 'Choose your language.');
  assert.match(stringifyMarkup(languageMenu.replyMarkup), /lang:es/);
});

test('start menu, album creation, selection, listing, and album callbacks use the repository state', async () => {
  const { repository, service } = await createHarness();

  assert.match((await service.handleCallbackData('lang:en', 'owner-a')).reply, /World Cup sticker album/);

  const start = await service.handleMessage('start', 'owner-a');

  assert.equal(start.parsed.intent, 'start');
  assert.match(start.reply, /^<b>Album menu<\/b>\nNo active album yet\./);
  assert.match(stringifyMarkup(start.replyMarkup), /album:create:panini-fifa-world-cup-2026/);

  const emptyList = await service.handleMessage('albums', 'owner-a');

  assert.equal(emptyList.parsed.intent, 'albumList');
  assert.match(emptyList.reply, /^<b>Albums<\/b>\nNo active album yet\./);
  assert.match(emptyList.reply, /You do not have albums yet\./);

  const customAlbum = await service.handleMessage('new album Road to 2026', 'owner-a');

  assert.match(customAlbum.reply, /^Album created and selected: Road to 2026\./);
  assert.equal((await repository.getActiveAlbum('owner-a'))?.name, 'Road to 2026');

  const createdFromCallback = await service.handleCallbackData(
    'album:create:panini-fifa-world-cup-2026',
    'owner-a',
  );

  assert.match(createdFromCallback.reply, /^Album created and selected: Panini FIFA World Cup 2026\./);
  assert.equal((await repository.getActiveAlbum('owner-a'))?.name, 'Panini FIFA World Cup 2026');
  assert.equal((await repository.listAlbums('owner-a')).length, 2);

  const list = await service.handleMessage('albums', 'owner-a');

  assert.match(list.reply, /^<b>Albums<\/b>\nActive: <b>Panini FIFA World Cup 2026<\/b>/);
  assert.match(list.reply, /Road to 2026/);
  assert.match(list.reply, /Panini FIFA World Cup 2026[\s\S]*active[\s\S]*owned/);
  assert.match(stringifyMarkup(list.replyMarkup), /album:select:/);

  const selectedByName = await service.handleMessage('select album Road', 'owner-a');

  assert.equal(selectedByName.reply, 'Active album selected: Road to 2026.');
  assert.equal((await repository.getActiveAlbum('owner-a'))?.name, 'Road to 2026');

  const paniniAlbum = (await repository.listAlbums('owner-a'))
    .find((album) => album.name === 'Panini FIFA World Cup 2026');

  assert.ok(paniniAlbum);

  const selectedByCallback = await service.handleCallbackData(`album:select:${paniniAlbum.id}`, 'owner-a');

  assert.equal(selectedByCallback.reply, 'Active album selected: Panini FIFA World Cup 2026.');
  assert.equal((await repository.getActiveAlbum('owner-a'))?.id, paniniAlbum.id);
  assert.equal((await service.handleCallbackData('album:select:not-found', 'owner-a')).reply, 'Album action not found.');
});

test('menu command shows the general navigation with friends and marketplace sections', async () => {
  const { service } = await createHarness();

  await service.handleCallbackData('lang:en', 'owner-a');

  const mainMenu = await service.handleMessage('menu', 'owner-a');

  assert.equal(mainMenu.parsed.intent, 'menu');
  assert.match(mainMenu.reply, /^<b>What do you want to do\?<\/b>\nNo active album yet\./);
  assert.match(stringifyMarkup(mainMenu.replyMarkup), /menu:cards/);
  assert.match(stringifyMarkup(mainMenu.replyMarkup), /menu:albums/);
  assert.match(stringifyMarkup(mainMenu.replyMarkup), /menu:friends/);
  assert.match(stringifyMarkup(mainMenu.replyMarkup), /menu:marketplace/);
  assert.match(stringifyMarkup(mainMenu.replyMarkup), /menu:help/);

  const cardsMenu = await service.handleCallbackData('menu:cards', 'owner-a');

  assert.match(cardsMenu.reply, /^<b>Cards<\/b>\nNo active album yet\./);
  assert.match(cardsMenu.reply, /<code>arg4<\/code> - check a card/);
  assert.match(cardsMenu.reply, /<code>add arg4<\/code> - add/);
  assert.match(cardsMenu.reply, /<code>rm arg4<\/code> - remove/);
  assert.match(stringifyMarkup(cardsMenu.replyMarkup), /menu:cards:progress/);
  assert.match(stringifyMarkup(cardsMenu.replyMarkup), /menu:cards:duplicates/);
  assert.match(stringifyMarkup(cardsMenu.replyMarkup), /menu:cards:add-remove/);
  assert.match(stringifyMarkup(cardsMenu.replyMarkup), /menu:cards:missing/);
  assert.match(stringifyMarkup(cardsMenu.replyMarkup), /menu:home/);

  const cardsBlockedProgress = await service.handleCallbackData('menu:cards:progress', 'owner-a');

  assert.match(cardsBlockedProgress.reply, /^Create or select an album first\./);
  assert.match(cardsBlockedProgress.reply, /<b>Cards<\/b>/);

  const friendsMenu = await service.handleCallbackData('menu:friends', 'owner-a');

  assert.equal(friendsMenu.reply, 'Friends\nYou do not have friends yet.');
  assert.match(stringifyMarkup(friendsMenu.replyMarkup), /menu:friends:duplicates/);
  assert.match(stringifyMarkup(friendsMenu.replyMarkup), /menu:friends:trades/);
  assert.match(stringifyMarkup(friendsMenu.replyMarkup), /menu:home/);

  const marketplaceMenu = await service.handleCallbackData('menu:marketplace', 'owner-a');

  assert.equal(marketplaceMenu.reply, 'Marketplace menu');
  assert.match(stringifyMarkup(marketplaceMenu.replyMarkup), /menu:marketplace:all/);
  assert.match(stringifyMarkup(marketplaceMenu.replyMarkup), /menu:marketplace:mine/);
  assert.match(stringifyMarkup(marketplaceMenu.replyMarkup), /menu:marketplace:trades/);
  assert.match(stringifyMarkup(marketplaceMenu.replyMarkup), /menu:marketplace:friends/);
});

test('add, remove, query, missing, duplicates, progress, and undo replies reflect inventory changes', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Collector Album');

  assert.equal((await service.handleMessage('arg4', 'owner-a')).reply, 'You do not have ARG 4.');
  assert.equal(
    (await service.handleMessage('rm arg4', 'owner-a')).reply,
    'You cannot remove ARG 4 because you do not have it.',
  );
  assert.equal(
    (await service.handleMessage('missing', 'owner-a')).reply,
    'Send a country to see missing stickers, for example: missing arg.',
  );
  assert.equal(
    (await service.handleMessage('arg21', 'owner-a')).reply,
    'ARG 21 does not exist in the catalog. ARG goes from 1 to 20.',
  );

  assert.equal((await service.handleMessage('add arg2', 'owner-a')).reply, 'ARG 2 added. You now have 1.');
  assert.equal(
    (await service.handleMessage('add arg2', 'owner-a')).reply,
    'ARG 2 added. You now have 2 (1 duplicate/s).',
  );
  assert.equal((await service.handleMessage('add arg4', 'owner-a')).reply, 'ARG 4 added. You now have 1.');
  assert.equal((await service.handleMessage('arg4', 'owner-a')).reply, 'You have ARG 4. Quantity: 1.');

  const country = await service.handleMessage('arg', 'owner-a');

  assert.match(country.reply, /^🇦🇷 <b>Argentina \(ARG\)<\/b>\n2\/20 \(10%\) · Duplicates: 1\n\n/);
  assert.match(country.reply, /ARG ⠀2 ✅ \(1\)\n/);
  assert.match(country.reply, /ARG ⠀4 ✅\n/);
  assert.match(country.reply, /ARG ⠀1 ❌\n/);

  const duplicates = await service.handleMessage('duplicates', 'owner-a');

  assert.equal(duplicates.parseMode, 'HTML');
  assert.equal(duplicates.reply, '<b>Duplicates:</b>\n\n🇦🇷 <b>ARG</b>:\nARG 2 (1)');
  const duplicatesMenu = await service.handleCallbackData('menu:cards:duplicates', 'owner-a');

  assert.equal(duplicatesMenu.parseMode, 'HTML');
  assert.equal(duplicatesMenu.reply, duplicates.reply);
  assert.match(
    (await service.handleMessage('duplicates arg', 'owner-a')).reply,
    /^🇦🇷 <b>Argentina \(ARG\)<\/b>\n2\/20 \(10%\)\n<b>Duplicates:<\/b>\nARG 2 \(1\)$/,
  );
  assert.equal(
    (await service.handleMessage('duplicates bra', 'owner-a')).reply,
    'You do not have duplicates from BRA.',
  );
  assert.match(
    (await service.handleMessage('missing arg', 'owner-a')).reply,
    /^🇦🇷 <b>Argentina \(ARG\)<\/b>\n2\/20 \(10%\)\nMissing \(18\): ARG 1, ARG 3, ARG 5/,
  );

  const progress = await service.handleMessage('progress', 'owner-a');

  assert.equal(progress.parseMode, 'HTML');
  assert.equal(progress.reply, [
    '<b>Overall progress</b>',
    'You have 2/960 unique stickers (0.2%).',
    'Duplicates: 1.',
    'Started countries: 1/48.',
    '',
    '<b>FWC / CC</b>',
    '🏆 <b>FWC</b>: 0/19 (0%)',
    '🥤 <b>CC</b>: 0/14 (0%)',
  ].join('\n'));
  const progressMenu = await service.handleCallbackData('menu:cards:progress', 'owner-a');

  assert.equal(progressMenu.parseMode, 'HTML');
  assert.equal(progressMenu.reply, progress.reply);

  assert.equal((await service.handleMessage('rm arg4', 'owner-a')).reply, 'ARG 4 removed. You now have 0.');
  assert.equal(await repository.getQuantity('owner-a', ARG4), 0);
  assert.equal((await service.handleMessage('arg4', 'owner-a')).reply, 'You do not have ARG 4.');

  assert.equal(
    (await service.handleMessage('undo', 'owner-a')).reply,
    'Undo applied: reverted the remove of ARG 4 - Cristian Romero. You now have 1.',
  );
  assert.equal(await repository.getQuantity('owner-a', ARG4), 1);
  assert.equal(
    (await service.handleMessage('undo', 'owner-a')).reply,
    'Undo applied: reverted the add of ARG 4 - Cristian Romero. You now have 0.',
  );
  assert.equal(await repository.getQuantity('owner-a', ARG4), 0);
  assert.equal(
    (await service.handleMessage('undo', 'owner-a')).reply,
    'Undo applied: reverted the add of ARG 2 - Emiliano Martinez. You now have 1.',
  );
  assert.equal(await repository.getQuantity('owner-a', ARG2), 1);
  assert.equal(
    (await service.handleMessage('undo', 'owner-a')).reply,
    'Undo applied: reverted the add of ARG 2 - Emiliano Martinez. You now have 0.',
  );
  assert.equal(await repository.getQuantity('owner-a', ARG2), 0);
  assert.equal((await service.handleMessage('undo', 'owner-a')).reply, 'There are no actions to undo.');
});

test('jpn stickers persist with the JPN user-facing code and invalid add text errors', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Collector Album');

  const invalidAdd = await service.handleMessage('add ejfewfiowhfo3', 'owner-a');

  assert.equal(invalidAdd.parsed.intent, 'unknown');
  assert.match(invalidAdd.reply, /^Send a sticker, for example: add arg4\./);

  assert.equal((await service.handleMessage('add jpn 10', 'owner-a')).reply, 'JPN 10 added. You now have 1.');
  assert.equal(await repository.getQuantity('owner-a', JPN10), 1);

  const country = await service.handleMessage('jpn', 'owner-a');

  assert.match(country.reply, /<b>Japan \(JPN\)<\/b>\n1\/20 \(5%\)/);
  assert.match(country.reply, /JPN 10/);
});

test('any-number lists only real countries and progress separates FWC and CC', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Collector Album');

  await repository.adjustQuantity('owner-a', ARG1, 1);
  await repository.adjustQuantity('owner-a', FWC9, 2);
  await repository.adjustQuantity('owner-a', CC1, 1);

  const any = await service.handleMessage('any1', 'owner-a');

  assert.equal(any.parsed.intent, 'anyNumber');
  assert.equal(any.parseMode, 'HTML');
  assert.match(any.reply, /🇦🇷 <b>ARG<\/b>: ✅/);
  assert.match(any.reply, /🇧🇷 <b>BRA<\/b>: ❌/);
  assert.doesNotMatch(any.reply, /\bFWC\b/);
  assert.doesNotMatch(any.reply, /\bCC\b/);

  const progress = await service.handleMessage('progress', 'owner-a');

  assert.equal(progress.parseMode, 'HTML');
  assert.match(progress.reply, /You have 1\/960 unique stickers \(0\.1%\)\./);
  assert.match(progress.reply, /Duplicates: 0\./);
  assert.match(progress.reply, /Started countries: 1\/48\./);
  assert.match(progress.reply, /🏆 <b>FWC<\/b>: 1\/19 \(5\.3%\) · Duplicates: 1/);
  assert.match(progress.reply, /🥤 <b>CC<\/b>: 1\/14 \(7\.1%\)/);
});

test('add accepts multiple stickers in one message', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Collector Album');

  const batch = await service.handleMessage('add jpn3, arg 5, fra 9, BRA3', 'owner-a');

  assert.equal(batch.parsed.intent, 'addStickers');
  assert.equal(batch.reply, [
    'JPN 3 added. You now have 1.',
    'ARG 5 added. You now have 1.',
    'FRA 9 added. You now have 1.',
    'BRA 3 added. You now have 1.',
  ].join('\n'));
  assert.equal(await repository.getQuantity('owner-a', JPN3), 1);
  assert.equal(await repository.getQuantity('owner-a', ARG5), 1);
  assert.equal(await repository.getQuantity('owner-a', FRA9), 1);
  assert.equal(await repository.getQuantity('owner-a', BRA3), 1);

  const spacedBatch = await service.handleMessage('add jpn3 arg 5 fra9 BRA3', 'owner-a');

  assert.equal(spacedBatch.parsed.intent, 'addStickers');
  assert.equal(await repository.getQuantity('owner-a', JPN3), 2);
  assert.equal(await repository.getQuantity('owner-a', ARG5), 2);
  assert.equal(await repository.getQuantity('owner-a', FRA9), 2);
  assert.equal(await repository.getQuantity('owner-a', BRA3), 2);
});

test('share flow sends outbound invitations and handles accept, decline, and error callbacks', async () => {
  const { repository, service } = await createHarness();

  const ownerAlbum = await registerUserWithAlbum(
    service,
    repository,
    'owner-a',
    'collector_a',
    'Alice Album',
  );

  await registerUserWithAlbum(service, repository, 'owner-b', 'collector_b', 'Bob Album');
  await registerUser(service, 'owner-c', 'collector_c');

  await repository.adjustQuantity('owner-a', ARG2, 1);
  await repository.adjustQuantity('owner-b', ARG4, 1);

  const shared = await service.handleMessage('share @collector_b', 'owner-a');

  assert.equal(shared.reply, 'Request sent to @collector_b to share the active album.');
  assert.equal(shared.outboundMessages?.length, 1);
  assert.equal(shared.outboundMessages?.[0]?.chatId, 'owner-b');
  assert.equal(shared.outboundMessages?.[0]?.text, '@collector_a wants to share an album with you.\n\nYes or No?');

  const acceptCallback = findCallbackData(shared.outboundMessages?.[0]?.replyMarkup, /^share:accept:/);

  assert.match(stringifyMarkup(shared.outboundMessages?.[0]?.replyMarkup), /share:decline:/);

  const accepted = await service.handleCallbackData(acceptCallback, 'owner-b');

  assert.equal(accepted.reply, 'Yes. You now share the same album.');
  assert.equal(accepted.outboundMessages?.[0]?.chatId, 'owner-a');
  assert.equal(
    accepted.outboundMessages?.[0]?.text,
    '@collector_b accepted sharing the album with you.',
  );
  assert.equal((await repository.getActiveAlbum('owner-b'))?.id, ownerAlbum.id);
  assert.equal((await repository.getActiveAlbum('owner-b'))?.memberCount, 2);
  assert.equal(await repository.getQuantity('owner-a', ARG4), 1);
  assert.equal(await repository.getQuantity('owner-b', ARG2), 1);

  assert.equal(
    (await service.handleCallbackData(acceptCallback, 'owner-b')).reply,
    'This request was already answered.',
  );
  assert.equal(
    (await service.handleMessage('share @collector_b', 'owner-a')).reply,
    'You already share the active album with @collector_b.',
  );
  assert.equal(
    (await service.handleMessage('share @collector_a', 'owner-a')).reply,
    'You cannot share the album with yourself.',
  );
  const unknownShareTarget = await service.handleMessage('share @unknown_user', 'owner-a');

  assert.match(unknownShareTarget.reply, /^I do not know @unknown_user\./);
  assert.match(unknownShareTarget.reply, /open the bot and send \/start first\./);

  const declinedRequest = await service.handleMessage('share @collector_c', 'owner-a');
  const declineCallback = findCallbackData(
    declinedRequest.outboundMessages?.[0]?.replyMarkup,
    /^share:decline:/,
  );
  const declined = await service.handleShareResponse(declineCallback, 'owner-c');

  assert.equal(declined.reply, 'No. Request declined.');
  assert.equal(declined.outboundMessages?.[0]?.chatId, 'owner-a');
  assert.equal(declined.outboundMessages?.[0]?.text, '@collector_c declined sharing the album.');
  assert.equal((await service.handleShareResponse('not-a-share-callback', 'owner-c')).reply, 'Invalid album sharing response.');
  assert.equal(
    (await service.handleCallbackData('share:accept:not-found', 'owner-c')).reply,
    'Shared album request not found.',
  );
});

test('album deletion requires confirmation before removing the album', async () => {
  const { repository, service } = await createHarness();

  const album = await registerUserWithAlbum(
    service,
    repository,
    'owner-a',
    'collector_a',
    'Disposable Album',
  );

  const prompt = await service.handleMessage('delete album Disposable', 'owner-a');

  assert.equal(prompt.reply, 'Delete album Disposable Album?');
  assert.equal((await repository.listAlbums('owner-a')).length, 1);

  const cancelCallback = findCallbackData(prompt.replyMarkup, /^album:delete:.*:cancel$/);

  assert.equal((await service.handleCallbackData(cancelCallback, 'owner-a')).reply, 'Cancelled.');
  assert.equal((await repository.listAlbums('owner-a')).length, 1);

  const promptAgain = await service.handleMessage('delete album Disposable', 'owner-a');
  const confirmCallback = findCallbackData(promptAgain.replyMarkup, new RegExp(`^album:delete:${album.id}:confirm$`));
  const deleted = await service.handleCallbackData(confirmCallback, 'owner-a');

  assert.equal(deleted.reply, 'Album deleted: Disposable Album.');
  assert.equal((await repository.listAlbums('owner-a')).length, 0);
});

test('friend requests unlock friend duplicates and friend-only marketplace, with removal confirmation', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Alice Album');
  await registerUserWithAlbum(service, repository, 'owner-b', 'collector_b', 'Bob Album');
  await registerUserWithAlbum(service, repository, 'owner-c', 'collector_c', 'Carol Album');

  await repository.adjustQuantity('owner-b', ARG2, 2);
  await repository.adjustQuantity('owner-b', ARG4, 1);
  await repository.adjustQuantity('owner-b', ARG5, 2);
  await repository.adjustQuantity('owner-c', BRA3, 1);

  assert.equal(
    (await service.handleMessage('friends', 'owner-a')).reply,
    'Friends\nYou do not have friends yet.',
  );
  assert.equal(
    (await service.handleMessage('dupes @collector_b arg5', 'owner-a')).reply,
    'You are not friends with @collector_b.',
  );

  const requested = await service.handleMessage('friends add @collector_b', 'owner-a');

  assert.equal(requested.reply, 'Friend request sent to @collector_b.');
  assert.equal(requested.outboundMessages?.[0]?.chatId, 'owner-b');
  assert.equal(requested.outboundMessages?.[0]?.text, '@collector_a wants to add you as a friend.\n\nYes or No?');

  const acceptCallback = findCallbackData(requested.outboundMessages?.[0]?.replyMarkup, /^friend:accept:/);
  const accepted = await service.handleCallbackData(acceptCallback, 'owner-b');

  assert.equal(accepted.reply, 'Yes. You are now friends.');
  assert.equal(accepted.outboundMessages?.[0]?.chatId, 'owner-a');
  assert.equal(accepted.outboundMessages?.[0]?.text, '@collector_b accepted your friend request.');
  assert.equal(await repository.areFriends('owner-a', 'owner-b'), true);
  assert.match((await service.handleMessage('friends', 'owner-a')).reply, /- @collector_b/);

  const friendDuplicates = await service.handleMessage('dupes @collector_b arg5', 'owner-a');

  assert.equal(friendDuplicates.parseMode, 'HTML');
  assert.equal(friendDuplicates.reply, '<b>@collector_b</b>\n\nARG 5 (1)');

  const friendsDuplicates = await service.handleMessage('friends -duplicates arg5', 'owner-a');

  assert.equal(friendsDuplicates.parseMode, 'HTML');
  assert.equal(friendsDuplicates.reply, '<b>Friends duplicates:</b>\n\n<b>@collector_b</b>\nARG 5 (1)');

  const friendsDuplicatesMenu = await service.handleCallbackData('menu:friends:duplicates', 'owner-a');

  assert.equal(friendsDuplicatesMenu.parseMode, 'HTML');
  assert.equal(
    friendsDuplicatesMenu.reply,
    '<b>Friends duplicates:</b>\n\n<b>@collector_b</b>\n🇦🇷 <b>ARG</b>:\nARG 2 (1)\nARG 5 (1)',
  );

  assert.equal(
    (await service.handleMessage('trade arg4 arg1', 'owner-b')).reply,
    'Trade posted: you give ARG 4 and want ARG 1.',
  );
  assert.equal(
    (await service.handleMessage('trade bra3 arg1', 'owner-c')).reply,
    'Trade posted: you give BRA 3 and want ARG 1.',
  );

  const friendMarketplace = await service.handleMessage('friends trade', 'owner-a');

  assert.match(friendMarketplace.reply, /^Friends marketplace:\n\n#T1 @collector_b gives ARG 4 for ARG 1/);
  assert.doesNotMatch(friendMarketplace.reply, /#T2\b/);

  const removePrompt = await service.handleMessage('friends rm @collector_b', 'owner-a');

  assert.equal(removePrompt.reply, 'Remove @collector_b from friends?');
  assert.equal(await repository.areFriends('owner-a', 'owner-b'), true);

  const removeCallback = findCallbackData(removePrompt.replyMarkup, /^friend:remove:collector_b:confirm$/);
  const removed = await service.handleCallbackData(removeCallback, 'owner-a');

  assert.equal(removed.reply, 'Removed @collector_b from friends.');
  assert.equal(await repository.areFriends('owner-a', 'owner-b'), false);
  assert.equal(
    (await service.handleMessage('dupes @collector_b arg5', 'owner-a')).reply,
    'You are not friends with @collector_b.',
  );
});

test('compare flow offers target album callbacks and renders duplicate-for-missing matches', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Alice Album');
  await registerUserWithAlbum(service, repository, 'owner-b', 'collector_b', 'Bob Album');
  await registerUser(service, 'owner-c', 'empty_user');

  await repository.adjustQuantity('owner-a', ARG1, 2);
  await repository.adjustQuantity('owner-a', BRA4, 2);
  await repository.adjustQuantity('owner-b', ARG10, 2);

  const chooseTarget = await service.handleMessage('compare @collector_b', 'owner-a');

  assert.equal(chooseTarget.reply, 'Choose which album from @collector_b to compare.');
  const allCountriesCallback = findCallbackData(chooseTarget.replyMarkup, /^compare:collector_b:1:all:0$/);

  const allCountries = await service.handleCallbackData(allCountriesCallback, 'owner-a');

  assert.equal(allCountries.reply, [
    'Compare Alice Album with Bob Album from @collector_b.',
    'Country: all.',
    '@collector_b can give you: ARG 10 (1).',
    'You can give @collector_b: ARG 1 (1), BRA 4 (1).',
  ].join('\n'));

  const chooseScopedWithNames = await service.handleMessage('compare arg @collector_b -names', 'owner-a');
  const argWithNamesCallback = findCallbackData(
    chooseScopedWithNames.replyMarkup,
    /^compare:collector_b:1:ARG:1$/,
  );
  const argWithNames = await service.handleCallbackData(argWithNamesCallback, 'owner-a');

  assert.equal(argWithNames.reply, [
    'Compare Alice Album with Bob Album from @collector_b.',
    'Country: ARG.',
    '@collector_b can give you: ARG 10 - Rodrigo De Paul (1).',
    'You can give @collector_b: ARG 1 (1).',
  ].join('\n'));

  assert.equal(
    (await service.handleMessage('compare @unknown_user', 'owner-a')).reply,
    'I do not know @unknown_user. That person must open the bot and send /start first.',
  );
  assert.equal(
    (await service.handleMessage('compare @collector_a', 'owner-a')).reply,
    'Choose another user to compare albums.',
  );
  assert.equal(
    (await service.handleMessage('compare @empty_user', 'owner-a')).reply,
    '@empty_user has no albums yet.',
  );
  assert.equal(
    (await service.handleCallbackData('compare:collector_b:99:all:0', 'owner-a')).reply,
    'I could not find that album.',
  );
});

test('help and unknown messages return guidance without requiring an active album', async () => {
  const { repository, service } = await createHarness();

  await service.handleCallbackData('lang:en', 'owner-a');

  const help = await service.handleMessage('help', 'owner-a');

  assert.equal(help.parsed.intent, 'help');
  assert.equal(help.parseMode, 'HTML');
  assert.match(help.reply, /^<b>Stickers<\/b>/);
  assert.match(help.reply, /\n\n<b>Albums<\/b>\n/);
  assert.match(help.reply, /<code>share @username<\/code>/);
  assert.match(help.reply, /<code>compare @username<\/code>/);
  assert.match(help.reply, /<code>friends add @username<\/code>/);
  assert.match(help.reply, /<code>friends -duplicates arg5<\/code>/);
  assert.match(help.reply, /<code>page arg<\/code>/);

  const page = await service.handleMessage('page arg', 'owner-a');

  assert.equal(page.parsed.intent, 'page');
  assert.equal(page.reply, 'Argentina (ARG) is on page 82.');

  assert.equal(
    (await service.handleMessage('page turquia', 'owner-a')).reply,
    'Türkiye (TUR) is on page 38.',
  );
  assert.equal(
    (await service.handleMessage('page atlantis', 'owner-a')).reply,
    'I do not recognize ATLANTIS.',
  );
  assert.equal(
    (await service.handleMessage('page', 'owner-a')).reply,
    'Send a country, for example: page arg.',
  );

  await createAlbum(repository, 'owner-a', 'Guidance Album');

  const unknown = await service.handleMessage('what is this', 'owner-a');

  assert.equal(unknown.parsed.intent, 'unknown');
  assert.equal(unknown.parseMode, 'HTML');
  assert.match(unknown.reply, /^I could not detect a country, number, or command\.\n\nType <code>help<\/code>/);

  const empty = await service.handleMessage('   ', 'owner-a');

  assert.equal(empty.parsed.intent, 'unknown');
  assert.equal(empty.parseMode, 'HTML');
  assert.match(empty.reply, /^Empty message\.\n\nType <code>help<\/code>/);
  assert.equal(
    (await service.handleCallbackData('totally:unknown', 'owner-a')).reply,
    'Invalid album sharing response.',
  );
});

test('trade marketplace smoke test posts and lists an active offer without exercising the full lifecycle', async () => {
  const { repository, service } = await createHarness();

  await registerUserWithAlbum(service, repository, 'owner-a', 'collector_a', 'Alice Album');
  await registerUserWithAlbum(service, repository, 'owner-b', 'collector_b', 'Bob Album');

  await repository.adjustQuantity('owner-a', ARG2, 1);

  const created = await service.handleMessage('trade arg2 arg4', 'owner-a');

  assert.equal(created.reply, 'Trade posted: you give ARG 2 and want ARG 4.');
  assert.equal((await repository.getTradeOffer('T1'))?.status, 'active');

  const mine = await service.handleMessage('trades', 'owner-a');

  assert.match(mine.reply, /^Your trades:\n\n#T1 \[active\] you give ARG 2 and want ARG 4/);
  assert.match(stringifyMarkup(mine.replyMarkup), /trade:cancel:T1/);

  const marketplace = await service.handleMessage('marketplace', 'owner-b');

  assert.match(marketplace.reply, /^Marketplace:\n\n#T1 @collector_a gives ARG 2 for ARG 4/);
  assert.match(stringifyMarkup(marketplace.replyMarkup), /trade:propose:T1/);
});
