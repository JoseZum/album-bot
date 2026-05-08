import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

type TestServer = {
  baseUrl: string;
  dataFilePath: string;
};

type JsonResponse = {
  response: Response;
  body: unknown;
};

const withHttpServer = async (run: (server: TestServer) => Promise<void>): Promise<void> => {
  const previousCollectionDataPath = process.env.COLLECTION_DATA_PATH;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-http-'));
  const dataFilePath = path.join(directory, 'collection.json');
  let server: Server | undefined;

  process.env.COLLECTION_DATA_PATH = dataFilePath;

  try {
    const { default: app } = await import('../../src/app');

    server = app.listen(0);
    await once(server, 'listening');

    const address = server.address() as AddressInfo;

    await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      dataFilePath,
    });
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

    if (previousCollectionDataPath === undefined) {
      delete process.env.COLLECTION_DATA_PATH;
    } else {
      process.env.COLLECTION_DATA_PATH = previousCollectionDataPath;
    }

    fs.rmSync(directory, { recursive: true, force: true });
  }
};

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

const readStoredData = (dataFilePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(dataFilePath, 'utf8')) as Record<string, unknown>;

const seedEnglishProfile = async (
  dataFilePath: string,
  ownerId: string,
  username: string,
): Promise<void> => {
  const { CollectionRepository } = await import('../../src/repositories/collection.repository');
  const repository = new CollectionRepository(dataFilePath);

  repository.registerProfile({
    ownerId,
    username,
    language: 'en',
  });
};

test('POST /api/bot/message rejects missing text', async () => withHttpServer(async ({ baseUrl }) => {
  const { response, body } = await postBotMessage(baseUrl, {
    ownerId: 'missing-text-owner',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    message: 'text is required',
  });
}));

test('POST /api/bot/message registers user and returns language selection then start flow', async () => withHttpServer(async ({
  baseUrl,
  dataFilePath,
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

  const storedAfterRegistration = readStoredData(dataFilePath);
  const profiles = asRecord(storedAfterRegistration.profiles);
  const profile = asRecord(profiles[ownerId]);

  assert.equal(profile.ownerId, ownerId);
  assert.equal(profile.username, 'http_user');
  assert.equal(profile.displayName, '@http_user');
  assert.equal(profile.language, undefined);

  await seedEnglishProfile(dataFilePath, ownerId, 'HTTP_User');

  const started = await postBotMessage(baseUrl, {
    ownerId,
    username: 'HTTP_User',
    firstName: 'Http',
    text: '/start',
  });

  assert.equal(started.response.status, 200);

  const startedData = responseData(started.body);
  assert.match(String(startedData.reply), /^Album menu/);
  assert.match(String(startedData.reply), /No active album yet/);
  assert.match(JSON.stringify(startedData.replyMarkup), /album:create:panini-fifa-world-cup-2026/);
}));

test('POST /api/bot/message can create and select albums through messages', async () => withHttpServer(async ({
  baseUrl,
  dataFilePath,
}) => {
  const ownerId = 'album-flow-owner';

  await seedEnglishProfile(dataFilePath, ownerId, 'album_http');

  const firstAlbum = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: 'new album Road to 2026',
  });

  assert.equal(firstAlbum.response.status, 200);
  assert.equal(responseData(firstAlbum.body).reply, 'Album created and selected: Road to 2026.');
  assert.equal(asRecord(responseData(firstAlbum.body).parsed).intent, 'albumCreate');

  const secondAlbum = await postBotMessage(baseUrl, {
    ownerId,
    username: 'album_http',
    text: 'new album Swap Duplicates',
  });

  assert.equal(secondAlbum.response.status, 200);
  assert.equal(responseData(secondAlbum.body).reply, 'Album created and selected: Swap Duplicates.');

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

  assert.match(startReply, /Active album: Road to 2026\./);
  assert.match(startReply, /1\. Road to 2026/);
  assert.match(startReply, /2\. Swap Duplicates/);

  const storedData = readStoredData(dataFilePath);
  const ownerCollections = asRecord(storedData.ownerCollections);
  const collections = asRecord(storedData.collections);
  const activeCollectionId = String(ownerCollections[ownerId]);
  const activeCollection = asRecord(collections[activeCollectionId]);

  assert.equal(activeCollection.name, 'Road to 2026');
}));

test('unknown routes return JSON 404 response', async () => withHttpServer(async ({ baseUrl }) => {
  const { response, body } = await requestJson(baseUrl, '/api/not-a-route');

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    message: 'Route not found',
  });
}));

test('error middleware returns JSON when request parsing fails before a route handler', async () => withHttpServer(async ({
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
