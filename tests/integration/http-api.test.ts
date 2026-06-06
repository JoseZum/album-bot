import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { PgDb } from '../../src/db/pg.adapter';

import { CollectionRepository } from '../../src/repositories/collection.repository';

const testDb = PgDb.fromConfig({ connectionString: 'postgres://album_bot:album_bot_password@localhost:5433/album_bot' });

const TRUNCATE_SQL = `
  TRUNCATE user_album_events, user_album_items, trade_offers,
    collector_active_albums, user_album_members, album_share_requests,
    collector_friends, friend_requests,
    user_albums, collector_profiles RESTART IDENTITY CASCADE;
  ALTER SEQUENCE trade_offer_sequence RESTART WITH 1
`;

type TestServer = {
  baseUrl: string;
};

type JsonResponse = {
  response: Response;
  body: unknown;
};

const withHttpServer = async (run: (server: TestServer) => Promise<void>): Promise<void> => {
  let server: Server | undefined;

  await testDb.query(TRUNCATE_SQL);

  try {
    const { default: app } = await import('../../src/app');

    server = app.listen(0);
    await once(server, 'listening');

    const address = server.address() as AddressInfo;

    await run({ baseUrl: `http://127.0.0.1:${address.port}` });
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  }
};

const serialTest = (name: string, fn: () => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const requestJson = async (
  baseUrl: string,
  routePath: string,
  options: RequestInit = {},
): Promise<JsonResponse> => {
  const response = await fetch(`${baseUrl}${routePath}`, options);
  const body = await response.json();

  return { response, body };
};

const postJson = (
  baseUrl: string,
  routePath: string,
  body: unknown,
): Promise<JsonResponse> =>
  requestJson(baseUrl, routePath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const postBotMessage = (
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<JsonResponse> =>
  postJson(baseUrl, '/api/bot/message', body);

const asRecord = (value: unknown): Record<string, unknown> => {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);

  return value as Record<string, unknown>;
};

const responseData = (body: unknown): Record<string, unknown> => {
  const envelope = asRecord(body);

  return asRecord(envelope.data);
};

const seedEnglishProfile = async (
  ownerId: string,
  username: string,
): Promise<void> => {
  const repository = new CollectionRepository(testDb);

  await repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });
};

serialTest('POST /api/bot/message rejects missing text', async () => withHttpServer(async ({ baseUrl }) => {
  const { response, body } = await postBotMessage(baseUrl, {
    ownerId: 'missing-text-owner',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    message: 'text is required',
  });
}));

serialTest('POST /api/bot/message registers user and returns language selection then start flow', async () => withHttpServer(async ({
  baseUrl,
}) => {
  const ownerId = 'language-flow-owner';
  const first = await postBotMessage(baseUrl, {
    ownerId,
    username: 'HTTP_User',
    firstName: 'Http',
    text: '/start',
  });

  assert.equal(first.response.status, 200);
  assert.equal(asRecord(first.body).success, true);

  const firstData = responseData(first.body);
  assert.equal(firstData.reply, 'Choose your language.');
  assert.equal(asRecord(firstData.parsed).intent, 'start');
  assert.match(JSON.stringify(firstData.replyMarkup), /lang:en/);

  const profileResult = await testDb.query(
    'SELECT * FROM collector_profiles WHERE telegram_chat_id = $1',
    [ownerId],
  );
  const profile = profileResult.rows[0];

  assert.equal(profile.telegram_chat_id, ownerId);
  assert.equal(profile.telegram_username, 'http_user');
  assert.equal(profile.display_name, '@http_user');
  assert.equal(profile.language_code, null);

  await seedEnglishProfile(ownerId, 'HTTP_User');

  const started = await postBotMessage(baseUrl, {
    ownerId,
    username: 'HTTP_User',
    firstName: 'Http',
    text: '/start',
  });

  assert.equal(started.response.status, 200);

  const startedData = responseData(started.body);
  assert.match(String(startedData.reply), /^<b>Album menu<\/b>/);
  assert.match(String(startedData.reply), /No active album yet/);
  assert.match(JSON.stringify(startedData.replyMarkup), /album:create:panini-fifa-world-cup-2026/);
}));

serialTest('POST /api/bot/message can create and select albums through messages', async () => withHttpServer(async ({
  baseUrl,
}) => {
  const ownerId = 'album-flow-owner';

  await seedEnglishProfile(ownerId, 'album_http');

  const firstAlbum = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: 'new album Road to 2026',
  });

  assert.equal(firstAlbum.response.status, 200);
  assert.match(String(responseData(firstAlbum.body).reply), /^Album created and selected: Road to 2026\./);
  assert.equal(asRecord(responseData(firstAlbum.body).parsed).intent, 'albumCreate');

  const secondAlbum = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: 'new album Swap Duplicates',
  });

  assert.equal(secondAlbum.response.status, 200);
  assert.match(String(responseData(secondAlbum.body).reply), /^Album created and selected: Swap Duplicates\./);

  const selected = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: 'use album Road to 2026',
  });

  assert.equal(selected.response.status, 200);
  assert.equal(responseData(selected.body).reply, 'Active album selected: Road to 2026.');
  assert.equal(asRecord(responseData(selected.body).parsed).intent, 'albumSelect');

  const startMenu = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: '/start',
  });
  const startReply = String(responseData(startMenu.body).reply);

  assert.match(startReply, /Active: <b>Road to 2026<\/b>/);
  assert.match(startReply, /Road to 2026/);
  assert.match(startReply, /Swap Duplicates/);

  const activeAlbumResult = await testDb.query(
    `SELECT ua.name
     FROM collector_active_albums caa
     JOIN collector_profiles cp ON cp.id = caa.collector_id
     JOIN user_albums ua ON ua.id = caa.user_album_id
     WHERE cp.telegram_chat_id = $1`,
    [ownerId],
  );

  assert.equal(activeAlbumResult.rows[0].name, 'Road to 2026');
}));

serialTest('unknown routes return JSON 404 response', async () => withHttpServer(async ({ baseUrl }) => {
  const { response, body } = await requestJson(baseUrl, '/api/not-a-route');

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    message: 'Route not found',
  });
}));

serialTest('error middleware returns JSON when request parsing fails before a route handler', async () => withHttpServer(async ({
  baseUrl,
}) => {
  const { response, body } = await requestJson(baseUrl, '/api/bot/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{"text":',
  });
  const envelope = asRecord(body);

  assert.equal(response.status, 400);
  assert.equal(envelope.success, false);
  assert.match(String(envelope.message), /JSON|Unexpected|Expected/i);
}));
