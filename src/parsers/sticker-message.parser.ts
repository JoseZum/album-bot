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
  | { intent: 'undo'; showNames: boolean }
  | { intent: 'help'; showNames: boolean }
  | { intent: 'unknown'; reason: string; showNames: boolean };

type LeadingIntent =
  | 'addSticker'
  | 'removeSticker'
  | 'missing'
  | 'duplicates'
  | 'progress'
  | 'undo'
  | 'help';

const ADD_ALIASES = new Set(['add', 'agregar', 'agrega', 'anadir', 'sumar', 'suma', 'tengo']);
const REMOVE_ALIASES = new Set(['remove', 'rm', 'remover', 'eliminar', 'elimina', 'quitar', 'quita', 'borrar']);
const MISSING_ALIASES = new Set(['missing', 'faltantes', 'faltante', 'falta']);
const DUPLICATES_ALIASES = new Set(['duplicates', 'duplicadas', 'duplicados', 'dups', 'repetidas', 'repetidos']);
const PROGRESS_ALIASES = new Set(['progress', 'progreso', 'avance', 'stats', 'estadisticas']);
const UNDO_ALIASES = new Set(['undo', 'deshacer']);
const HELP_ALIASES = new Set(['help', 'ayuda', 'start']);

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

export const parseStickerMessage = (rawText: string): ParsedBotMessage => {
  const originalText = rawText.trim();
  const { text, showNames } = stripNameFlag(originalText);
  const normalizedText = normalizeForParsing(text);

  if (!normalizedText) {
    return {
      intent: 'unknown',
      reason: 'Mensaje vacio.',
      showNames,
    };
  }

  const { intent, remainder } = extractLeadingIntent(normalizedText);

  if (intent === 'undo' || intent === 'progress' || intent === 'help') {
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
