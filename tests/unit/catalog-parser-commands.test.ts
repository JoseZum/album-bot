import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatSticker,
  getCatalogEntry,
  getCountryAliasesForParsing,
  isKnownSticker,
  normalizeForParsing,
  resolveCountry,
  sortStickers,
  stickerFromKey,
  stickerKey,
  type StickerRef,
} from '../../src/catalog/world-cup.catalog';
import { AddStickerCommand } from '../../src/commands/add-sticker-command';
import { RemoveStickerCommand } from '../../src/commands/remove-sticker-command';
import { parseStickerMessage } from '../../src/parsers/sticker-message.parser';
import { CollectionRepository } from '../../src/repositories/collection.repository';

const ALBUM_SLUG = 'panini-fifa-world-cup-2026';
const OWNER_ID = 'unit-owner';

const ARG4: StickerRef = { countryCode: 'ARG', number: 4 };
const ARG10: StickerRef = { countryCode: 'ARG', number: 10 };
const BRA3: StickerRef = { countryCode: 'BRA', number: 3 };
const BRA10: StickerRef = { countryCode: 'BRA', number: 10 };
const CRC7: StickerRef = { countryCode: 'CRC', number: 7 };
const FRA10: StickerRef = { countryCode: 'FRA', number: 10 };
const USA2: StickerRef = { countryCode: 'USA', number: 2 };

const createRepositoryHarness = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'album-bot-unit-catalog-parser-'));
  const repository = new CollectionRepository(path.join(directory, 'collection.json'));
  const album = repository.createAlbum(OWNER_ID, ALBUM_SLUG, 'Unit test album');

  assert.ok(album);

  return {
    repository,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
};

test('catalog normalizes parser input consistently', () => {
  assert.equal(normalizeForParsing('  México.Costa_Rica  '), 'mexico costa rica');
  assert.equal(normalizeForParsing('Ángel   Di_María'), 'angel di maria');
  assert.equal(normalizeForParsing('Países.Bajos'), 'paises bajos');
});

test('catalog exposes country aliases ordered for parsing and resolves aliases', () => {
  const aliases = getCountryAliasesForParsing();
  const costaRicaAlias = aliases.find((entry) => entry.normalizedAlias === 'costa rica');
  const crcAlias = aliases.find((entry) => entry.normalizedAlias === 'crc');

  assert.ok(costaRicaAlias);
  assert.ok(crcAlias);
  assert.equal(costaRicaAlias.country.code, 'CRC');
  assert.equal(crcAlias.country.name, 'Costa Rica');
  assert.equal(resolveCountry('  Países   Bajos ')?.code, 'NED');
  assert.equal(resolveCountry('EEUU')?.code, 'USA');
  assert.equal(resolveCountry('not a country'), undefined);
});

test('catalog converts sticker keys and validates known stickers', () => {
  assert.equal(stickerKey({ countryCode: 'arg', number: 10 }), 'ARG-10');
  assert.deepEqual(stickerFromKey('ARG-10'), ARG10);
  assert.deepEqual(stickerFromKey('USA-002'), USA2);
  assert.equal(stickerFromKey('arg-10'), null);
  assert.equal(stickerFromKey('ARG 10'), null);
  assert.equal(isKnownSticker(ARG10), true);
  assert.equal(isKnownSticker({ countryCode: 'ARG', number: 20 }), true);
  assert.equal(isKnownSticker({ countryCode: 'ARG', number: 21 }), false);
  assert.equal(isKnownSticker({ countryCode: 'XXX', number: 1 }), false);
});

test('catalog sorts stickers without mutating input', () => {
  const input = [
    { countryCode: 'BRA', number: 3 },
    { countryCode: 'ARG', number: 10 },
    { countryCode: 'ARG', number: 2 },
  ];

  assert.deepEqual(sortStickers(input), [
    { countryCode: 'ARG', number: 2 },
    { countryCode: 'ARG', number: 10 },
    { countryCode: 'BRA', number: 3 },
  ]);
  assert.deepEqual(input, [
    { countryCode: 'BRA', number: 3 },
    { countryCode: 'ARG', number: 10 },
    { countryCode: 'ARG', number: 2 },
  ]);
});

test('catalog formats stickers with optional player names', () => {
  assert.equal(formatSticker({ countryCode: 'arg', number: 10 }), 'ARG 10');
  assert.equal(formatSticker(ARG10, { includeName: true }), 'ARG 10 - Lionel Messi');
  assert.equal(formatSticker(BRA10, { includeName: true }), 'BRA 10 - Neymar Jr');
  assert.equal(formatSticker(CRC7, { includeName: true }), 'CRC 7');
  assert.equal(getCatalogEntry('fra')?.names[10], 'Kylian Mbappe');
});

test('parser detects add and remove sticker intents with names flag', () => {
  assert.deepEqual(parseStickerMessage('/add ARG-10 names'), {
    intent: 'addSticker',
    sticker: ARG10,
    showNames: true,
  });
  assert.deepEqual(parseStickerMessage('rm costa rica 7'), {
    intent: 'removeSticker',
    sticker: CRC7,
    showNames: false,
  });
});

test('parser detects sticker and country queries', () => {
  assert.deepEqual(parseStickerMessage('brasil #10'), {
    intent: 'querySticker',
    sticker: BRA10,
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('Países Bajos --names'), {
    intent: 'queryCountry',
    countryCode: 'NED',
    showNames: true,
  });
});

test('parser detects missing and duplicate queries with optional country scope', () => {
  assert.deepEqual(parseStickerMessage('/missing'), {
    intent: 'missing',
    countryCode: undefined,
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('missing eeuu names'), {
    intent: 'missing',
    countryCode: 'USA',
    showNames: true,
  });
  assert.deepEqual(parseStickerMessage('dups Argentina'), {
    intent: 'duplicates',
    countryCode: 'ARG',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('duplicates made up country'), {
    intent: 'duplicates',
    countryCode: undefined,
    showNames: false,
  });
});

test('parser detects progress, start, language, undo, and help commands', () => {
  assert.deepEqual(parseStickerMessage('/progress'), {
    intent: 'progress',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('stats --names'), {
    intent: 'progress',
    showNames: true,
  });
  assert.deepEqual(parseStickerMessage('album'), {
    intent: 'start',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('/language'), {
    intent: 'language',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('undo'), {
    intent: 'undo',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('help'), {
    intent: 'help',
    showNames: false,
  });
});

test('parser detects share and compare commands', () => {
  assert.deepEqual(parseStickerMessage('/share @Collector_123'), {
    intent: 'share',
    targetUsername: 'collector_123',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('compare Brazil @Friend_123 --names'), {
    intent: 'compare',
    targetUsername: 'friend_123',
    countryCode: 'BRA',
    showNames: true,
  });
  assert.deepEqual(parseStickerMessage('compare @Friend_123'), {
    intent: 'compare',
    targetUsername: 'friend_123',
    countryCode: undefined,
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('compare Atlantis @Friend_123'), {
    intent: 'unknown',
    reason: 'Unknown compare country.',
    showNames: false,
  });
});

test('parser detects album management commands', () => {
  assert.deepEqual(parseStickerMessage('albums names'), {
    intent: 'albumList',
    showNames: true,
  });
  assert.deepEqual(parseStickerMessage('album create Qatar Run'), {
    intent: 'albumCreate',
    albumName: 'Qatar Run',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('use album Qatar Run'), {
    intent: 'albumSelect',
    selector: 'Qatar Run',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('album rename Qatar Run to World Cup 2026'), {
    intent: 'albumRename',
    selector: 'Qatar Run',
    albumName: 'World Cup 2026',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('delete album Qatar Run'), {
    intent: 'albumDelete',
    selector: 'Qatar Run',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('album leave'), {
    intent: 'albumLeave',
    showNames: false,
  });
});

test('parser reports invalid sticker commands and unknown input', () => {
  assert.deepEqual(parseStickerMessage('add not-a-sticker'), {
    intent: 'unknown',
    reason: 'Indica una estampa, por ejemplo: add arg4.',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage(''), {
    intent: 'unknown',
    reason: 'Mensaje vacio.',
    showNames: false,
  });
  assert.deepEqual(parseStickerMessage('hello collector'), {
    intent: 'unknown',
    reason: 'No pude detectar pais, numero o comando.',
    showNames: false,
  });
});

test('AddStickerCommand increments quantity and undo reverses it', () => {
  const { repository, cleanup } = createRepositoryHarness();

  try {
    const command = new AddStickerCommand(repository, OWNER_ID, BRA3);

    assert.deepEqual(command.execute(), {
      action: 'add',
      sticker: BRA3,
      previousQuantity: 0,
      currentQuantity: 1,
      changed: true,
    });
    assert.equal(repository.getQuantity(OWNER_ID, BRA3), 1);
    assert.deepEqual(command.execute(), {
      action: 'add',
      sticker: BRA3,
      previousQuantity: 1,
      currentQuantity: 2,
      changed: true,
    });
    assert.equal(repository.getQuantity(OWNER_ID, BRA3), 2);
    assert.deepEqual(command.undo(), {
      action: 'remove',
      sticker: BRA3,
      previousQuantity: 2,
      currentQuantity: 1,
      changed: true,
    });
    assert.equal(repository.getQuantity(OWNER_ID, BRA3), 1);
  } finally {
    cleanup();
  }
});

test('RemoveStickerCommand decrements quantity, clamps at zero, and undo restores', () => {
  const { repository, cleanup } = createRepositoryHarness();

  try {
    repository.adjustQuantity(OWNER_ID, FRA10, 1);

    const command = new RemoveStickerCommand(repository, OWNER_ID, FRA10);

    assert.deepEqual(command.execute(), {
      action: 'remove',
      sticker: FRA10,
      previousQuantity: 1,
      currentQuantity: 0,
      changed: true,
    });
    assert.equal(repository.getQuantity(OWNER_ID, FRA10), 0);
    assert.deepEqual(command.execute(), {
      action: 'remove',
      sticker: FRA10,
      previousQuantity: 0,
      currentQuantity: 0,
      changed: false,
    });
    assert.equal(repository.getQuantity(OWNER_ID, FRA10), 0);
    assert.deepEqual(command.undo(), {
      action: 'add',
      sticker: FRA10,
      previousQuantity: 0,
      currentQuantity: 1,
      changed: true,
    });
    assert.equal(repository.getQuantity(OWNER_ID, FRA10), 1);
  } finally {
    cleanup();
  }
});
