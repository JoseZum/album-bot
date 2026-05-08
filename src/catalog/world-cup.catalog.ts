export type StickerRef = {
  countryCode: string;
  number: number;
};

export type CountryCatalogEntry = {
  code: string;
  name: string;
  aliases: string[];
  totalStickers: number;
  names: Record<number, string>;
};

export type CountryAliasMatch = {
  alias: string;
  normalizedAlias: string;
  country: CountryCatalogEntry;
};

const DEFAULT_TOTAL_STICKERS = 20;

const createCountry = (
  code: string,
  name: string,
  aliases: string[],
  names: Record<number, string> = {},
): CountryCatalogEntry => ({
  code,
  name,
  aliases: [code, name, ...aliases],
  totalStickers: DEFAULT_TOTAL_STICKERS,
  names,
});

export const normalizeForParsing = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const WORLD_CUP_CATALOG: CountryCatalogEntry[] = [
  createCountry('ARG', 'Argentina', ['arg'], {
    1: 'Emiliano Martinez',
    9: 'Julian Alvarez',
    10: 'Lionel Messi',
    11: 'Angel Di Maria',
  }),
  createCountry('AUS', 'Australia', ['australia']),
  createCountry('BEL', 'Belgium', ['belgica', 'belgium', 'bel']),
  createCountry('BRA', 'Brazil', ['brasil', 'brazil', 'bra'], {
    10: 'Neymar Jr',
    20: 'Vinicius Junior',
  }),
  createCountry('CAN', 'Canada', ['canada', 'can']),
  createCountry('CMR', 'Cameroon', ['camerun', 'cameroon', 'cmr']),
  createCountry('CRC', 'Costa Rica', ['costa rica', 'costarica', 'crc']),
  createCountry('CRO', 'Croatia', ['croacia', 'croatia', 'cro']),
  createCountry('DEN', 'Denmark', ['dinamarca', 'denmark', 'den']),
  createCountry('ECU', 'Ecuador', ['ecuador', 'ecu']),
  createCountry('ENG', 'England', ['inglaterra', 'england', 'eng']),
  createCountry('ESP', 'Spain', ['espana', 'spain', 'esp'], {
    10: 'Pedri',
  }),
  createCountry('FRA', 'France', ['francia', 'france', 'fra'], {
    10: 'Kylian Mbappe',
  }),
  createCountry('GER', 'Germany', ['alemania', 'germany', 'ger']),
  createCountry('GHA', 'Ghana', ['ghana', 'gha']),
  createCountry('IRN', 'Iran', ['iran', 'irn']),
  createCountry('JPN', 'Japan', ['japon', 'japan', 'jpn']),
  createCountry('KOR', 'South Korea', ['corea', 'corea del sur', 'south korea', 'korea', 'kor']),
  createCountry('KSA', 'Saudi Arabia', ['arabia', 'arabia saudita', 'saudi arabia', 'ksa']),
  createCountry('MAR', 'Morocco', ['marruecos', 'morocco', 'mar']),
  createCountry('MEX', 'Mexico', ['mexico', 'mex']),
  createCountry('NED', 'Netherlands', ['paises bajos', 'holanda', 'netherlands', 'ned']),
  createCountry('POL', 'Poland', ['polonia', 'poland', 'pol']),
  createCountry('POR', 'Portugal', ['portugal', 'por'], {
    7: 'Cristiano Ronaldo',
  }),
  createCountry('QAT', 'Qatar', ['qatar', 'qat']),
  createCountry('SEN', 'Senegal', ['senegal', 'sen']),
  createCountry('SRB', 'Serbia', ['serbia', 'srb']),
  createCountry('SUI', 'Switzerland', ['suiza', 'switzerland', 'sui']),
  createCountry('TUN', 'Tunisia', ['tunez', 'tunisia', 'tun']),
  createCountry('URU', 'Uruguay', ['uruguay', 'uru']),
  createCountry('USA', 'United States', ['estados unidos', 'usa', 'eeuu', 'us', 'united states']),
  createCountry('WAL', 'Wales', ['gales', 'wales', 'wal']),
];

const countriesByCode = new Map(
  WORLD_CUP_CATALOG.map((country) => [country.code, country]),
);

const countryAliases: CountryAliasMatch[] = WORLD_CUP_CATALOG.flatMap((country) =>
  country.aliases.map((alias) => ({
    alias,
    normalizedAlias: normalizeForParsing(alias),
    country,
  })),
).sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

const countriesByAlias = new Map(
  countryAliases.map((entry) => [entry.normalizedAlias, entry.country]),
);

export const getCountryAliasesForParsing = (): CountryAliasMatch[] => countryAliases;

export const getCatalogEntry = (countryCode: string): CountryCatalogEntry | undefined =>
  countriesByCode.get(countryCode.toUpperCase());

export const resolveCountry = (value: string): CountryCatalogEntry | undefined =>
  countriesByAlias.get(normalizeForParsing(value));

export const getStickerName = (sticker: StickerRef): string | undefined =>
  getCatalogEntry(sticker.countryCode)?.names[sticker.number];

export const stickerKey = (sticker: StickerRef): string =>
  `${sticker.countryCode.toUpperCase()}-${sticker.number}`;

export const stickerFromKey = (key: string): StickerRef | null => {
  const match = /^([A-Z]{3})-(\d{1,3})$/.exec(key);

  if (!match) {
    return null;
  }

  return {
    countryCode: match[1],
    number: Number(match[2]),
  };
};

export const isKnownSticker = (sticker: StickerRef): boolean => {
  const country = getCatalogEntry(sticker.countryCode);

  return Boolean(country && sticker.number >= 1 && sticker.number <= country.totalStickers);
};

export const getAllStickerRefs = (countryCode: string): StickerRef[] => {
  const country = getCatalogEntry(countryCode);

  if (!country) {
    return [];
  }

  return Array.from({ length: country.totalStickers }, (_, index) => ({
    countryCode: country.code,
    number: index + 1,
  }));
};

export const formatSticker = (
  sticker: StickerRef,
  options: { includeName?: boolean } = {},
): string => {
  const normalizedSticker = {
    countryCode: sticker.countryCode.toUpperCase(),
    number: sticker.number,
  };
  const base = `${normalizedSticker.countryCode} ${normalizedSticker.number}`;
  const name = options.includeName ? getStickerName(normalizedSticker) : undefined;

  return name ? `${base} - ${name}` : base;
};

export const sortStickers = (stickers: StickerRef[]): StickerRef[] =>
  [...stickers].sort((left, right) => {
    const countryComparison = left.countryCode.localeCompare(right.countryCode);

    if (countryComparison !== 0) {
      return countryComparison;
    }

    return left.number - right.number;
  });

export const getCatalogTotal = (): number =>
  WORLD_CUP_CATALOG.reduce((total, country) => total + country.totalStickers, 0);
