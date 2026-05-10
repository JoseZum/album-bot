import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadEnv } from '../../src/config/env';
import { postTelegramWebhook } from '../../src/controllers/telegram.controller';
import { stickerBotService } from '../../src/services/sticker-bot.service';
import { TelegramService } from '../../src/services/telegram.service';

const TOKEN_MISSING_REASON = 'TELEGRAM_BOT_TOKEN is not configured';

type EnvPatch = Record<string, string | undefined>;

const withEnv = async (patch: EnvPatch, run: () => Promise<void> | void): Promise<void> => {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);

    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const withFetch = async (
  fetchStub: typeof globalThis.fetch,
  run: () => Promise<void> | void,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const withPatchedMethods = async (
  target: object,
  patch: Record<string, unknown>,
  run: () => Promise<void> | void,
): Promise<void> => {
  const mutableTarget = target as Record<string, unknown>;
  const previous = new Map<string, { hadOwn: boolean; value: unknown }>();

  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, {
      hadOwn: Object.prototype.hasOwnProperty.call(mutableTarget, key),
      value: mutableTarget[key],
    });
    mutableTarget[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, original] of previous) {
      if (original.hadOwn) {
        mutableTarget[key] = original.value;
      } else {
        delete mutableTarget[key];
      }
    }
  }
};

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const createMockResponse = (): {
  statusCode: number;
  body: unknown;
  status: (statusCode: number) => ReturnType<typeof createMockResponse>;
  json: (payload: unknown) => ReturnType<typeof createMockResponse>;
} => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };

  return response;
};

test('TelegramService skips sendMessage and answerCallbackQuery when token is missing', async () => {
  const service = new TelegramService();
  const fetchStub = async (): Promise<Response> => {
    throw new Error('fetch should not be called without TELEGRAM_BOT_TOKEN');
  };

  await withEnv({ TELEGRAM_BOT_TOKEN: undefined }, async () => {
    await withFetch(fetchStub, async () => {
      assert.deepEqual(await service.sendMessage(12345, 'hello'), {
        sent: false,
        reason: TOKEN_MISSING_REASON,
      });
      assert.deepEqual(await service.answerCallbackQuery('callback-id'), {
        sent: false,
        reason: TOKEN_MISSING_REASON,
      });
    });
  });
});

test('TelegramService sends expected fetch payloads and returns Telegram JSON', async () => {
  const service = new TelegramService();
  const calls: Array<{
    url: string;
    method: string | undefined;
    headers: HeadersInit | undefined;
    body: unknown;
  }> = [];
  const sendPayload = { ok: true, result: { message_id: 7 } };
  const answerPayload = { ok: true, result: true };

  const fetchStub: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method,
      headers: init?.headers,
      body: JSON.parse(String(init?.body)),
    });

    return createJsonResponse(url.endsWith('/answerCallbackQuery') ? answerPayload : sendPayload);
  };

  await withEnv({ TELEGRAM_BOT_TOKEN: 'test-token' }, async () => {
    await withFetch(fetchStub, async () => {
      const replyMarkup = {
        inline_keyboard: [[{ text: 'Open', callback_data: 'open:1' }]],
      };

      assert.deepEqual(await service.sendMessage(12345, 'hello', { replyMarkup, parseMode: 'HTML' }), {
        sent: true,
        telegramResponse: sendPayload,
      });
      assert.deepEqual(await service.answerCallbackQuery('callback-id', 'Done'), {
        sent: true,
        telegramResponse: answerPayload,
      });
    });
  });

  assert.deepEqual(calls, [
    {
      url: 'https://api.telegram.org/bottest-token/sendMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        chat_id: 12345,
        text: 'hello',
        reply_markup: {
          inline_keyboard: [[{ text: 'Open', callback_data: 'open:1' }]],
        },
        parse_mode: 'HTML',
      },
    },
    {
      url: 'https://api.telegram.org/bottest-token/answerCallbackQuery',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        callback_query_id: 'callback-id',
        text: 'Done',
      },
    },
  ]);
});

test('TelegramService throws 502 errors with Telegram details when fetch is not OK', async () => {
  const service = new TelegramService();
  const errorPayload = {
    ok: false,
    description: 'Bad Request: chat not found',
  };
  const fetchStub: typeof globalThis.fetch = async () => createJsonResponse(errorPayload, 400);

  await withEnv({ TELEGRAM_BOT_TOKEN: 'test-token' }, async () => {
    await withFetch(fetchStub, async () => {
      await assert.rejects(
        () => service.sendMessage('missing-chat', 'hello'),
        (error: unknown) => {
          const typedError = error as { message?: string; statusCode?: number; details?: unknown };

          assert.match(typedError.message ?? '', /Telegram sendMessage failed with status 400/);
          assert.equal(typedError.statusCode, 502);
          assert.deepEqual(typedError.details, errorPayload);
          return true;
        },
      );

      await assert.rejects(
        () => service.answerCallbackQuery('callback-id'),
        (error: unknown) => {
          const typedError = error as { message?: string; statusCode?: number; details?: unknown };

          assert.match(typedError.message ?? '', /Telegram answerCallbackQuery failed with status 400/);
          assert.equal(typedError.statusCode, 502);
          assert.deepEqual(typedError.details, errorPayload);
          return true;
        },
      );
    });
  });
});

test('loadEnv parses .env values without overwriting existing environment values', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-env-'));
  const previousCwd = process.cwd();
  const envPath = path.join(tempDirectory, '.env');

  fs.writeFileSync(
    envPath,
    [
      '# ignored comment',
      'TELEGRAM_BOT_TOKEN="from-env-file"',
      "SINGLE_QUOTED='single quoted value'",
      'EXISTING_VALUE=from-env-file',
      'VALUE_WITH_EQUALS=left=right',
      'EMPTY_VALUE=',
      'INVALID_LINE_WITHOUT_SEPARATOR',
      '',
    ].join('\n'),
    'utf8',
  );

  await withEnv(
    {
      TELEGRAM_BOT_TOKEN: undefined,
      SINGLE_QUOTED: undefined,
      EXISTING_VALUE: 'already-present',
      VALUE_WITH_EQUALS: undefined,
      EMPTY_VALUE: undefined,
    },
    () => {
      try {
        process.chdir(tempDirectory);
        loadEnv();

        assert.equal(process.env.TELEGRAM_BOT_TOKEN, 'from-env-file');
        assert.equal(process.env.SINGLE_QUOTED, 'single quoted value');
        assert.equal(process.env.EXISTING_VALUE, 'already-present');
        assert.equal(process.env.VALUE_WITH_EQUALS, 'left=right');
        assert.equal(process.env.EMPTY_VALUE, '');
        assert.equal(process.env.INVALID_LINE_WITHOUT_SEPARATOR, undefined);
      } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempDirectory, { recursive: true, force: true });
      }
    },
  );
});

test('Telegram webhook controller handles message updates without a token', async () => {
  const registeredProfiles: unknown[] = [];
  const handledMessages: unknown[] = [];
  const fetchStub = async (): Promise<Response> => {
    throw new Error('fetch should not be called without TELEGRAM_BOT_TOKEN');
  };

  await withEnv({ TELEGRAM_BOT_TOKEN: undefined }, async () => {
    await withFetch(fetchStub, async () => {
      await withPatchedMethods(
        stickerBotService,
        {
          registerUser: (profile: unknown) => {
            registeredProfiles.push(profile);
          },
          handleMessage: (text: string, ownerId: string) => {
            handledMessages.push({ text, ownerId });

            return {
              parsed: { intent: 'help' },
              reply: 'message reply',
              replyMarkup: {
                inline_keyboard: [[{ text: 'Next', callback_data: 'next' }]],
              },
            };
          },
        },
        async () => {
          const response = createMockResponse();
          let nextError: unknown;

          await postTelegramWebhook(
            {
              body: {
                message: {
                  text: '/start',
                  chat: { id: 12345 },
                  from: {
                    username: 'tester',
                    first_name: 'Test',
                    last_name: 'User',
                  },
                },
              },
            } as never,
            response as never,
            ((error: unknown) => {
              nextError = error;
            }) as never,
          );

          await new Promise<void>((resolve) => setImmediate(resolve));

          assert.equal(nextError, undefined);
          assert.equal(response.statusCode, 200);
          assert.deepEqual(response.body, { ok: true });
          assert.deepEqual(registeredProfiles, [
            {
              ownerId: '12345',
              username: 'tester',
              firstName: 'Test',
              lastName: 'User',
            },
          ]);
          assert.deepEqual(handledMessages, [{ text: '/start', ownerId: '12345' }]);
        },
      );
    });
  });
});

test('Telegram webhook controller handles callback updates without a token', async () => {
  const registeredProfiles: unknown[] = [];
  const handledCallbacks: unknown[] = [];
  const fetchStub = async (): Promise<Response> => {
    throw new Error('fetch should not be called without TELEGRAM_BOT_TOKEN');
  };

  await withEnv({ TELEGRAM_BOT_TOKEN: undefined }, async () => {
    await withFetch(fetchStub, async () => {
      await withPatchedMethods(
        stickerBotService,
        {
          registerUser: (profile: unknown) => {
            registeredProfiles.push(profile);
          },
          handleCallbackData: (callbackData: string, ownerId: string) => {
            handledCallbacks.push({ callbackData, ownerId });

            return {
              reply: 'callback reply',
              replyMarkup: {
                inline_keyboard: [[{ text: 'Confirm', callback_data: 'confirm' }]],
              },
              outboundMessages: [
                {
                  chatId: '67890',
                  text: 'outbound reply',
                  replyMarkup: {
                    inline_keyboard: [[{ text: 'Done', callback_data: 'done' }]],
                  },
                },
              ],
            };
          },
        },
        async () => {
          const response = createMockResponse();
          let nextError: unknown;

          await postTelegramWebhook(
            {
              body: {
                callback_query: {
                  id: 'callback-id',
                  data: 'trade:accept:T1',
                  from: {
                    id: 54321,
                    username: 'callback_tester',
                    first_name: 'Callback',
                    last_name: 'User',
                  },
                  message: {
                    chat: { id: 12345 },
                  },
                },
              },
            } as never,
            response as never,
            ((error: unknown) => {
              nextError = error;
            }) as never,
          );

          await new Promise<void>((resolve) => setImmediate(resolve));

          assert.equal(nextError, undefined);
          assert.equal(response.statusCode, 200);
          assert.deepEqual(response.body, { ok: true });
          assert.deepEqual(registeredProfiles, [
            {
              ownerId: '12345',
              username: 'callback_tester',
              firstName: 'Callback',
              lastName: 'User',
            },
          ]);
          assert.deepEqual(handledCallbacks, [{ callbackData: 'trade:accept:T1', ownerId: '12345' }]);
        },
      );
    });
  });
});
