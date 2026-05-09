import {
  resolveAlbumPage,
  type AlbumPageEntry,
} from '../catalog/album-pages.catalog';
import {
  getCountryAliasesForParsing,
  normalizeForParsing,
  resolveCountry,
  type CountryCatalogEntry,
  type StickerRef,
} from '../catalog/world-cup.catalog';
import {
  type MarketplaceSearch,
  type TradeSelector,
} from '../trades/trade.types';

export type ParsedBotMessage =
  | { intent: 'querySticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'queryCountry'; countryCode: string; showNames: boolean }
  | { intent: 'addSticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'addStickers'; stickers: StickerRef[]; invalidInputs: string[]; showNames: boolean }
  | { intent: 'removeSticker'; sticker: StickerRef; showNames: boolean }
  | { intent: 'tradeCreate'; give: TradeSelector; want: TradeSelector; showNames: boolean }
  | { intent: 'tradeListMine'; showNames: boolean }
  | { intent: 'tradeCancel'; tradeId: string; showNames: boolean }
  | { intent: 'marketplaceSearch'; search: MarketplaceSearch; showNames: boolean }
  | { intent: 'missing'; countryCode?: string; showNames: boolean }
  | { intent: 'duplicates'; countryCode?: string; sticker?: StickerRef; targetUsername?: string; showNames: boolean }
  | { intent: 'anyNumber'; number: number; showNames: boolean }
  | { intent: 'friendsList'; showNames: boolean }
  | { intent: 'friendAdd'; targetUsername: string; showNames: boolean }
  | { intent: 'friendRemove'; targetUsername: string; showNames: boolean }
  | { intent: 'friendsDuplicates'; countryCode?: string; sticker?: StickerRef; showNames: boolean }
  | { intent: 'progress'; showNames: boolean }
  | { intent: 'page'; country?: AlbumPageEntry; countryInput?: string; showNames: boolean }
  | { intent: 'share'; targetUsername: string; showNames: boolean }
  | { intent: 'compare'; targetUsername: string; countryCode?: string; showNames: boolean }
  | { intent: 'albumList'; showNames: boolean }
  | { intent: 'albumCreate'; albumName: string; showNames: boolean }
  | { intent: 'albumSelect'; selector: string; showNames: boolean }
  | { intent: 'albumRename'; albumName: string; selector?: string; showNames: boolean }
  | { intent: 'albumDelete'; selector?: string; showNames: boolean }
  | { intent: 'albumLeave'; showNames: boolean }
  | { intent: 'start'; showNames: boolean }
  | { intent: 'menu'; showNames: boolean }
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
  | 'page'
  | 'start'
  | 'menu'
  | 'language'
  | 'undo'
  | 'help';

const ADD_ALIASES = new Set(['add']);
const REMOVE_ALIASES = new Set(['remove', 'rm']);
const MISSING_ALIASES = new Set(['missing']);
const DUPLICATES_ALIASES = new Set(['duplicates', 'dups', 'dupes']);
const PROGRESS_ALIASES = new Set(['progress', 'stats']);
const PAGE_ALIASES = new Set(['page', 'pagina']);
const START_ALIASES = new Set(['start']);
const MENU_ALIASES = new Set(['menu']);
const LANGUAGE_ALIASES = new Set(['language', 'lang']);
const UNDO_ALIASES = new Set(['undo']);
const HELP_ALIASES = new Set(['help']);
const MARKETPLACE_ALIASES = new Set(['marketplace']);
const TRADES_ALIASES = new Set(['trades']);
const FRIENDS_ALIASES = new Set(['friends', 'amigos']);

const ALBUM_CREATE_ALIASES = new Set(['new', 'create']);
const ALBUM_SELECT_ALIASES = new Set(['use', 'select', 'switch']);
const ALBUM_RENAME_ALIASES = new Set(['rename']);
const ALBUM_DELETE_ALIASES = new Set(['delete', 'remove', 'rm']);
const ALBUM_LEAVE_ALIASES = new Set(['leave']);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripNameFlag = (text: string): { text: string; showNames: boolean } => {
  const nameFlagPattern = /(^|\s)(-name|-names|--name|--names|names?)(?=\s|$)/gi;
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

  if (PAGE_ALIASES.has(firstToken)) {
    return { intent: 'page', remainder };
  }

  if (START_ALIASES.has(firstToken)) {
    return { intent: 'start', remainder };
  }

  if (MENU_ALIASES.has(firstToken)) {
    return { intent: 'menu', remainder };
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

type TradeOperandMatch = {
  selector: TradeSelector;
  nextIndex: number;
};

const parseStickerRefFromTokens = (
  tokens: string[],
  startIndex: number,
): { sticker: StickerRef; nextIndex: number } | null => {
  for (let endIndex = startIndex + 1; endIndex <= tokens.length; endIndex += 1) {
    const sticker = parseStickerRef(tokens.slice(startIndex, endIndex).join(' '));

    if (sticker) {
      return {
        sticker,
        nextIndex: endIndex,
      };
    }
  }

  return null;
};

const parseStickerSequence = (input: string): StickerRef[] | null => {
  const cleaned = normalizeForParsing(input)
    .replace(/[#:]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const stickers: StickerRef[] = [];
  let index = 0;

  while (index < tokens.length) {
    const match = parseStickerRefFromTokens(tokens, index);

    if (!match) {
      return null;
    }

    stickers.push(match.sticker);
    index = match.nextIndex;
  }

  return stickers.length > 1 ? stickers : null;
};

const parseStickerRefList = (
  input: string,
): { stickers: StickerRef[]; invalidInputs: string[] } | null => {
  const chunks = input
    .split(/[,\n;]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return null;
  }

  const stickers: StickerRef[] = [];
  const invalidInputs: string[] = [];

  for (const chunk of chunks) {
    const sticker = parseStickerRef(chunk);

    if (sticker) {
      stickers.push(sticker);
      continue;
    }

    const sequence = parseStickerSequence(chunk);

    if (sequence) {
      stickers.push(...sequence);
      continue;
    }

    invalidInputs.push(chunk);
  }

  return chunks.length > 1 || stickers.length > 1 || invalidInputs.length > 0
    ? { stickers, invalidInputs }
    : null;
};

const parseDuplicateScope = (
  input: string,
): { countryCode?: string; sticker?: StickerRef } | null => {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    return {};
  }

  const sticker = parseStickerRef(normalizedInput);

  if (sticker) {
    return { sticker };
  }

  const country = parseCountry(normalizedInput);

  if (country) {
    return { countryCode: country.code };
  }

  return null;
};

const parseTradeOperandMatches = (
  tokens: string[],
  startIndex: number,
): TradeOperandMatch[] => {
  const token = tokens[startIndex];

  if (!token) {
    return [];
  }

  if (token === '-duplicate' || token === '-missing') {
    const kind = token === '-duplicate' ? 'duplicate' : 'missing';
    const matches: TradeOperandMatch[] = [
      {
        selector: { kind },
        nextIndex: startIndex + 1,
      },
    ];

    for (let endIndex = startIndex + 2; endIndex <= tokens.length; endIndex += 1) {
      const country = parseCountry(tokens.slice(startIndex + 1, endIndex).join(' '));

      if (country) {
        matches.push({
          selector: {
            kind,
            countryCode: country.code,
          },
          nextIndex: endIndex,
        });
      }
    }

    return matches;
  }

  const stickerMatch = parseStickerRefFromTokens(tokens, startIndex);

  return stickerMatch
    ? [
      {
        selector: {
          kind: 'sticker',
          sticker: stickerMatch.sticker,
        },
        nextIndex: stickerMatch.nextIndex,
      },
    ]
    : [];
};

const normalizeTradeId = (rawTradeId: string): string | null => {
  const cleaned = rawTradeId.trim().replace(/^#/, '').toUpperCase();

  if (!cleaned) {
    return null;
  }

  if (/^T\d+$/.test(cleaned)) {
    return cleaned;
  }

  if (/^\d+$/.test(cleaned)) {
    return `T${cleaned}`;
  }

  return null;
};

const parseTradeCommand = (
  text: string,
  showNames: boolean,
): ParsedBotMessage | null => {
  const normalizedText = normalizeForParsing(text);
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0]?.replace(/^\/+/, '');

  if (firstToken === 'trade') {
    const remainderTokens = tokens.slice(1);

    if (remainderTokens.length === 0) {
      return {
        intent: 'unknown',
        reason: 'Trade format: trade <give> <want>.',
        showNames,
      };
    }

    if (remainderTokens[0] === 'cancel') {
      const tradeId = normalizeTradeId(remainderTokens[1] ?? '');

      return tradeId
        ? { intent: 'tradeCancel', tradeId, showNames }
        : {
          intent: 'unknown',
          reason: 'Trade id required. Example: trade cancel T1.',
          showNames,
        };
    }

    for (const giveMatch of parseTradeOperandMatches(remainderTokens, 0)) {
      for (const wantMatch of parseTradeOperandMatches(remainderTokens, giveMatch.nextIndex)) {
        if (
          wantMatch.nextIndex === remainderTokens.length
          && giveMatch.selector.kind !== 'missing'
          && wantMatch.selector.kind !== 'duplicate'
        ) {
          return {
            intent: 'tradeCreate',
            give: giveMatch.selector,
            want: wantMatch.selector,
            showNames,
          };
        }
      }
    }

    return {
      intent: 'unknown',
      reason: 'Trade format: trade <give> <want>.',
      showNames,
    };
  }

  if (TRADES_ALIASES.has(firstToken ?? '')) {
    return { intent: 'tradeListMine', showNames };
  }

  if (MARKETPLACE_ALIASES.has(firstToken ?? '')) {
    const remainder = stripLeadingWords(text, 1);
    return parseMarketplaceSearch(remainder, showNames);
  }

  return null;
};

const parseMarketplaceSearch = (
  remainder: string,
  showNames: boolean,
  options: { friendsOnly?: boolean } = {},
): ParsedBotMessage => {
  const normalizedRemainder = remainder.trim();
  const friendshipScope = options.friendsOnly ? { friendsOnly: true } : {};

  if (!normalizedRemainder) {
    return {
      intent: 'marketplaceSearch',
      search: friendshipScope,
      showNames,
    };
  }

  if (/^-mine$/i.test(normalizedRemainder)) {
    return {
      intent: 'marketplaceSearch',
      search: { mineOnly: true, ...friendshipScope },
      showNames,
    };
  }

  const usernameMatch = /^@([a-z0-9_]{5,32})$/i.exec(normalizedRemainder);

  if (usernameMatch) {
    return {
      intent: 'marketplaceSearch',
      search: {
        ownerUsername: usernameMatch[1].toLowerCase(),
        ...friendshipScope,
      },
      showNames,
    };
  }

  const directionalStickerMatch = /^-(give|need)\s+(.+)$/i.exec(normalizedRemainder);

  if (directionalStickerMatch) {
    const sticker = parseStickerRef(directionalStickerMatch[2]);

    if (sticker) {
      return {
        intent: 'marketplaceSearch',
        search: {
          ...(directionalStickerMatch[1].toLowerCase() === 'give'
            ? { giveSticker: sticker }
            : { needSticker: sticker }),
          ...friendshipScope,
        },
        showNames,
      };
    }
  }

  return {
    intent: 'unknown',
    reason: 'Marketplace filter must be @username, -mine, -give arg4, or -need arg4.',
    showNames,
  };
};

const parseFriendsCommand = (
  text: string,
  showNames: boolean,
): ParsedBotMessage | null => {
  const normalizedText = normalizeForParsing(text);
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0]?.replace(/^\/+/, '');
  const secondToken = tokens[1];

  if (!FRIENDS_ALIASES.has(firstToken ?? '')) {
    return null;
  }

  if (!secondToken) {
    return { intent: 'friendsList', showNames };
  }

  const remainder = stripLeadingWords(text, 2);

  if (secondToken === 'add') {
    const usernameMatch = /^@([a-z0-9_]{5,32})$/i.exec(remainder);

    return usernameMatch
      ? { intent: 'friendAdd', targetUsername: usernameMatch[1].toLowerCase(), showNames }
      : { intent: 'unknown', reason: 'Friend username required. Example: friends add @username.', showNames };
  }

  if (secondToken === 'rm' || secondToken === 'remove' || secondToken === 'delete') {
    const usernameMatch = /^@([a-z0-9_]{5,32})$/i.exec(remainder);

    return usernameMatch
      ? { intent: 'friendRemove', targetUsername: usernameMatch[1].toLowerCase(), showNames }
      : { intent: 'unknown', reason: 'Friend username required. Example: friends rm @username.', showNames };
  }

  if (secondToken === '-duplicates' || secondToken === 'duplicates' || secondToken === 'dups' || secondToken === 'dupes') {
    const scope = parseDuplicateScope(remainder);

    return scope
      ? { intent: 'friendsDuplicates', ...scope, showNames }
      : { intent: 'unknown', reason: 'Friend duplicates filter must be a country or sticker, for example: friends -duplicates arg5.', showNames };
  }

  if (secondToken === 'trade' || secondToken === 'marketplace') {
    return parseMarketplaceSearch(remainder, showNames, { friendsOnly: true });
  }

  return { intent: 'unknown', reason: 'Friend command not found.', showNames };
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

  if (firstToken === 'albums') {
    return { intent: 'albumList', showNames };
  }

  if (firstToken === 'album') {
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

  const secondIsAlbum = secondToken === 'album';

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
  const anyNumberMatch = /^\/?any\s*(\d{1,3})$/i.exec(text);

  if (anyNumberMatch) {
    return {
      intent: 'anyNumber',
      number: Number(anyNumberMatch[1]),
      showNames,
    };
  }

  const duplicatesUserMatch = /^\/?(?:duplicates|dups|dupes)\s+@([a-z0-9_]{5,32})(?:\s+(.+))?$/i.exec(text);

  if (duplicatesUserMatch) {
    const scope = parseDuplicateScope(duplicatesUserMatch[2] ?? '');

    return scope
      ? {
        intent: 'duplicates',
        targetUsername: duplicatesUserMatch[1].toLowerCase(),
        ...scope,
        showNames,
      }
      : {
        intent: 'unknown',
        reason: 'Duplicates filter must be a country or sticker, for example: duplicates @username arg5.',
        showNames,
      };
  }

  const shareMatch = /^\/?share\s+@([a-z0-9_]{5,32})$/i.exec(text);

  if (shareMatch) {
    return {
      intent: 'share',
      targetUsername: shareMatch[1].toLowerCase(),
      showNames,
    };
  }

  const compareMatch = /^\/?compare(?:\s+(.+?))?\s+@([a-z0-9_]{5,32})$/i.exec(text);

  if (compareMatch) {
    const countryInput = compareMatch[1]?.trim();
    const country = countryInput ? parseCountry(countryInput) : null;

    if (countryInput && !country) {
      return {
        intent: 'unknown',
        reason: 'Unknown compare country.',
        showNames,
      };
    }

    return {
      intent: 'compare',
      targetUsername: compareMatch[2].toLowerCase(),
      countryCode: country?.code,
      showNames,
    };
  }

  const friendsCommand = parseFriendsCommand(text, showNames);

  if (friendsCommand) {
    return friendsCommand;
  }

  const albumCommand = parseAlbumCommand(text, showNames);

  if (albumCommand) {
    return albumCommand;
  }

  const tradeCommand = parseTradeCommand(text, showNames);

  if (tradeCommand) {
    return tradeCommand;
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
    || intent === 'menu'
    || intent === 'language'
  ) {
    return { intent, showNames };
  }

  if (intent === 'page') {
    return {
      intent: 'page',
      country: remainder ? resolveAlbumPage(remainder) : undefined,
      countryInput: remainder || undefined,
      showNames,
    };
  }

  if (intent === 'addSticker' || intent === 'removeSticker') {
    const sticker = parseStickerRef(remainder);

    if (!sticker) {
      if (intent === 'addSticker') {
        const stickerList = parseStickerRefList(remainder);

        if (stickerList && stickerList.stickers.length > 0) {
          return { intent: 'addStickers', ...stickerList, showNames };
        }
      }

      return {
        intent: 'unknown',
        reason: 'Indica una estampa, por ejemplo: add arg4.',
        showNames,
      };
    }

    return { intent, sticker, showNames };
  }

  if (intent === 'missing') {
    const country = parseCountry(remainder);

    return {
      intent,
      countryCode: country?.code,
      showNames,
    };
  }

  if (intent === 'duplicates') {
    const scope = parseDuplicateScope(remainder);

    return scope
      ? { intent, ...scope, showNames }
      : { intent, countryCode: undefined, showNames };
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
