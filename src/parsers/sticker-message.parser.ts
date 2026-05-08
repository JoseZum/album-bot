import {
  getCountryAliasesForParsing,
  normalizeForParsing,
  resolveCountry,
  type CountryCatalogEntry,
  type StickerRef,
} from '../catalog/world-cup.catalog';

export type ParsedBotMessage =
  | { intent: 'querySticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'queryCountry'; countryCode: string; showNames: boolean }
  | { intent: 'addSticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'removeSticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'missing'; countryCode?: string; showNames: boolean }
  | { intent: 'duplicates'; countryCode?: string; showNames: boolean }
  | { intent: 'progress'; showNames: boolean }
  | { intent: 'share'; targetUsername: string; showNames: boolean }
  | { intent: 'albumList'; showNames: boolean }
  | { intent: 'albumCreate'; albumName: string; showNames: boolean }
  | { intent: 'albumSelect'; selector: string; showNames: boolean }
  | { intent: 'albumRename'; albumName: string; selector?: string; showNames: boolean }
  | { intent: 'albumDelete'; selector?: string; showNames: boolean }
  | { intent: 'albumLeave'; showNames: boolean }
  | { intent: 'start'; showNames: boolean }
  | { intent: 'language'; showNames: boolean }
  | { intent: 'undo'; showNames: boolean }
  | { intent: 'help'; showNames: boolean }
  | { intent: 'unknown'; reason: string; showNames: boolean };

type LeadingIntent =
  | 'addSticker'
  | 'removeSticker'
  | 'missing'
  | 'duplicates'
  | 'progress'
  | 'start'
  | 'language'
  | 'undo'
  | 'help';

const ADD_ALIASES = new Set(['add', 'agregar', 'agrega', 'anadir', 'sumar', 'suma', 'tengo']);
const REMOVE_ALIASES = new Set(['remove', 'rm', 'remover', 'eliminar', 'elimina', 'quitar', 'quita', 'borrar']);
const MISSING_ALIASES = new Set(['missing', 'faltantes', 'faltante', 'falta']);
const DUPLICATES_ALIASES = new Set(['duplicates', 'duplicadas', 'duplicados', 'dups', 'repetidas', 'repetidos']);
const PROGRESS_ALIASES = new Set(['progress', 'progreso', 'avance', 'stats', 'estadisticas']);
const START_ALIASES = new Set(['start', 'menu', 'album', 'albums', 'albumes']);
const LANGUAGE_ALIASES = new Set(['language', 'lang', 'idioma']);
const UNDO_ALIASES = new Set(['undo', 'deshacer']);
const HELP_ALIASES = new Set(['help', 'ayuda']);

const ALBUM_CREATE_ALIASES = new Set(['new', 'create', 'nuevo', 'nueva', 'crear', 'crea']);
const ALBUM_SELECT_ALIASES = new Set(['use', 'select', 'switch', 'usar', 'usa', 'seleccionar', 'selecciona', 'cambiar']);
const ALBUM_RENAME_ALIASES = new Set(['rename', 'renombrar', 'renombra']);
const ALBUM_DELETE_ALIASES = new Set(['delete', 'remove', 'rm', 'eliminar', 'elimina', 'borrar', 'borra']);
const ALBUM_LEAVE_ALIASES = new Set(['leave', 'salir', 'sal']);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripNameFlag = (text: string): { text: string; showNames: boolean } => {
  const nameFlagPattern = /(^|\s)(-name|-names|--name|--names|nombres?|names?)(?=\s|$)/gi;
  const showNames = nameFlagPattern.test(text);

  return {
    text: text.replace(nameFlagPattern, ' ').replace(/\s+/g, ' ').trim(),
    showNames,
  };
};

const extractLeadingIntent = (
  normalizedText: string,
): { intent?: LeadingIntent; remainder: string } => {
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0]?.replace(/^\/+/, '');

  if (!firstToken) {
    return { remainder: '' };
  }

  const remainder = tokens.slice(1).join(' ');

  if (ADD_ALIASES.has(firstToken)) {
    return { intent: 'addSticker', remainder };
  }

  if (REMOVE_ALIASES.has(firstToken)) {
    return { intent: 'removeSticker', remainder };
  }

  if (MISSING_ALIASES.has(firstToken)) {
    return { intent: 'missing', remainder };
  }

  if (DUPLICATES_ALIASES.has(firstToken)) {
    return { intent: 'duplicates', remainder };
  }

  if (PROGRESS_ALIASES.has(firstToken)) {
    return { intent: 'progress', remainder };
  }

  if (START_ALIASES.has(firstToken)) {
    return { intent: 'start', remainder };
  }

  if (LANGUAGE_ALIASES.has(firstToken)) {
    return { intent: 'language', remainder };
  }

  if (UNDO_ALIASES.has(firstToken)) {
    return { intent: 'undo', remainder };
  }

  if (HELP_ALIASES.has(firstToken)) {
    return { intent: 'help', remainder };
  }

  return { remainder: normalizedText };
};

const buildAliasPattern = (normalizedAlias: string): string =>
  normalizedAlias
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('\\s*');

const parseStickerRef = (input: string): StickerRef | null => {
  const cleaned = normalizeForParsing(input)
    .replace(/[#:]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  for (const alias of getCountryAliasesForParsing()) {
    const aliasPattern = buildAliasPattern(alias.normalizedAlias);
    const match = new RegExp(`^${aliasPattern}\\s*(\\d{1,3})$`).exec(cleaned);

    if (match) {
      return {
        countryCode: alias.country.code,
        number: Number(match[1]),
      };
    }
  }

  return null;
};

const parseCountry = (input: string): CountryCatalogEntry | null => {
  const cleaned = normalizeForParsing(input)
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? resolveCountry(cleaned) ?? null : null;
};

const stripLeadingWords = (input: string, count: number): string =>
  input.trim().split(/\s+/).slice(count).join(' ').trim();

const parseAlbumRename = (
  remainder: string,
  showNames: boolean,
): ParsedBotMessage => {
  const namedRenameMatch = /^(.+?)\s+(?:to|a)\s+(.+)$/i.exec(remainder);

  if (namedRenameMatch) {
    return {
      intent: 'albumRename',
      selector: namedRenameMatch[1].trim(),
      albumName: namedRenameMatch[2].trim(),
      showNames,
    };
  }

  return {
    intent: 'albumRename',
    albumName: remainder,
    showNames,
  };
};

const parseAlbumCommand = (
  text: string,
  showNames: boolean,
): ParsedBotMessage | null => {
  const normalizedText = normalizeForParsing(text);
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0]?.replace(/^\/+/, '');
  const secondToken = tokens[1];

  if (!firstToken) {
    return null;
  }

  if (firstToken === 'albums' || firstToken === 'albumes') {
    return { intent: 'albumList', showNames };
  }

  if (firstToken === 'album' || firstToken === 'albumes') {
    if (!secondToken) {
      return { intent: 'start', showNames };
    }

    const remainder = stripLeadingWords(text, 2);

    if (ALBUM_CREATE_ALIASES.has(secondToken)) {
      return remainder
        ? { intent: 'albumCreate', albumName: remainder, showNames }
        : { intent: 'unknown', reason: 'Album name required.', showNames };
    }

    if (ALBUM_SELECT_ALIASES.has(secondToken)) {
      return remainder
        ? { intent: 'albumSelect', selector: remainder, showNames }
        : { intent: 'unknown', reason: 'Album selector required.', showNames };
    }

    if (ALBUM_RENAME_ALIASES.has(secondToken)) {
      return remainder
        ? parseAlbumRename(remainder, showNames)
        : { intent: 'unknown', reason: 'Album name required.', showNames };
    }

    if (ALBUM_DELETE_ALIASES.has(secondToken)) {
      return {
        intent: 'albumDelete',
        selector: remainder || undefined,
        showNames,
      };
    }

    if (ALBUM_LEAVE_ALIASES.has(secondToken)) {
      return { intent: 'albumLeave', showNames };
    }

    return null;
  }

  const secondIsAlbum = secondToken === 'album' || secondToken === 'albumes';

  if (secondIsAlbum && ALBUM_CREATE_ALIASES.has(firstToken)) {
    const albumName = stripLeadingWords(text, 2);

    return albumName
      ? { intent: 'albumCreate', albumName, showNames }
      : { intent: 'unknown', reason: 'Album name required.', showNames };
  }

  if (secondIsAlbum && ALBUM_SELECT_ALIASES.has(firstToken)) {
    const selector = stripLeadingWords(text, 2);

    return selector
      ? { intent: 'albumSelect', selector, showNames }
      : { intent: 'unknown', reason: 'Album selector required.', showNames };
  }

  if (secondIsAlbum && ALBUM_RENAME_ALIASES.has(firstToken)) {
    const albumName = stripLeadingWords(text, 2);

    return albumName
      ? parseAlbumRename(albumName, showNames)
      : { intent: 'unknown', reason: 'Album name required.', showNames };
  }

  if (secondIsAlbum && ALBUM_DELETE_ALIASES.has(firstToken)) {
    return {
      intent: 'albumDelete',
      selector: stripLeadingWords(text, 2) || undefined,
      showNames,
    };
  }

  if (secondIsAlbum && ALBUM_LEAVE_ALIASES.has(firstToken)) {
    return { intent: 'albumLeave', showNames };
  }

  return null;
};

export const parseStickerMessage = (rawText: string): ParsedBotMessage => {
  const originalText = rawText.trim();
  const { text, showNames } = stripNameFlag(originalText);
  const shareMatch = /^\/?share\s+@([a-z0-9_]{5,32})$/i.exec(text);

  if (shareMatch) {
    return {
      intent: 'share',
      targetUsername: shareMatch[1].toLowerCase(),
      showNames,
    };
  }

  const albumCommand = parseAlbumCommand(text, showNames);

  if (albumCommand) {
    return albumCommand;
  }

  const normalizedText = normalizeForParsing(text);

  if (!normalizedText) {
    return {
      intent: 'unknown',
      reason: 'Mensaje vacio.',
      showNames,
    };
  }

  const { intent, remainder } = extractLeadingIntent(normalizedText);

  if (
    intent === 'undo'
    || intent === 'progress'
    || intent === 'help'
    || intent === 'start'
    || intent === 'language'
  ) {
    return { intent, showNames };
  }

  if (intent === 'addSticker' || intent === 'removeSticker') {
    const sticker = parseStickerRef(remainder);

    if (!sticker) {
      return {
        intent: 'unknown',
        reason: 'Indica una estampa, por ejemplo: add arg4.',
        showNames,
      };
    }

    return { intent, sticker, showNames };
  }

  if (intent === 'missing' || intent === 'duplicates') {
    const country = parseCountry(remainder);

    return {
      intent,
      countryCode: country?.code,
      showNames,
    };
  }

  const sticker = parseStickerRef(remainder);

  if (sticker) {
    return {
      intent: 'querySticker',
      sticker,
      showNames,
    };
  }

  const country = parseCountry(remainder);

  if (country) {
    return {
      intent: 'queryCountry',
      countryCode: country.code,
      showNames,
    };
  }

  return {
    intent: 'unknown',
    reason: 'No pude detectar pais, numero o comando.',
    showNames,
  };
};
