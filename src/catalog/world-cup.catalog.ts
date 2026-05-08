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
  total = DEFAULT_TOTAL_STICKERS,
): CountryCatalogEntry => ({
  code,
  name,
  aliases: [code, name, ...aliases],
  totalStickers: total,
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
  createCountry('ALG', 'Algeria', ['argelia', 'algeria', 'alg']),
  createCountry('AUT', 'Austria', ['austria', 'aut']),
  createCountry('BIH', 'Bosnia-Herzegovina', ['bosnia', 'bosnia herzegovina', 'bih']),
  createCountry('COD', 'Congo DR', ['congo', 'dr congo', 'congo dr', 'rd congo', 'cod']),
  createCountry('COL', 'Colombia', ['colombia', 'col']),
  createCountry('CPV', 'Cabo Verde', ['cabo verde', 'cape verde', 'cpv']),
  createCountry('CIV', 'Côte d\'Ivoire', ['costa de marfil', 'ivory coast', 'cote divoire', 'civ']),
  createCountry('CRO', 'Croatia', ['croacia', 'croatia', 'cro']),
  createCountry('CUW', 'Curaçao', ['curacao', 'curazao', 'cuw']),
  createCountry('CZE', 'Czechia', ['chequia', 'czech republic', 'republica checa', 'cze']),
  createCountry('ECU', 'Ecuador', ['ecuador', 'ecu']),
  createCountry('EGY', 'Egypt', ['egipto', 'egypt', 'egy']),
  createCountry('ENG', 'England', ['inglaterra', 'england', 'eng']),
  createCountry('ESP', 'Spain', ['espana', 'spain', 'esp'], {
    10: 'Pedri',
  }),
  createCountry('FRA', 'France', ['francia', 'france', 'fra'], {
    10: 'Kylian Mbappe',
  }),
  createCountry('GER', 'Germany', ['alemania', 'germany', 'ger']),
  createCountry('GHA', 'Ghana', ['ghana', 'gha']),
  createCountry('HAI', 'Haiti', ['haiti', 'hai']),
  createCountry('IRN', 'Iran', ['iran', 'irn']),
  createCountry('IRQ', 'Iraq', ['irak', 'iraq', 'irq']),
  createCountry('JOR', 'Jordan', ['jordania', 'jordan', 'jor']),
  createCountry('JPN', 'Japan', ['japon', 'japan', 'jpn']),
  createCountry('KOR', 'South Korea', ['corea', 'corea del sur', 'south korea', 'korea', 'kor']),
  createCountry('KSA', 'Saudi Arabia', ['arabia', 'arabia saudita', 'saudi arabia', 'ksa']),
  createCountry('MAR', 'Morocco', ['marruecos', 'morocco', 'mar']),
  createCountry('MEX', 'Mexico', ['mexico', 'mex']),
  createCountry('NED', 'Netherlands', ['paises bajos', 'holanda', 'netherlands', 'ned']),
  createCountry('NOR', 'Norway', ['noruega', 'norway', 'nor']),
  createCountry('NZL', 'New Zealand', ['nueva zelanda', 'new zealand', 'nzl']),
  createCountry('PAN', 'Panama', ['panama', 'pan']),
  createCountry('PAR', 'Paraguay', ['paraguay', 'par']),
  createCountry('POR', 'Portugal', ['portugal', 'por'], {
    7: 'Cristiano Ronaldo',
  }),
  createCountry('QAT', 'Qatar', ['qatar', 'qat']),
  createCountry('RSA', 'South Africa', ['sudafrica', 'south africa', 'rsa']),
  createCountry('SCO', 'Scotland', ['escocia', 'scotland', 'sco']),
  createCountry('SEN', 'Senegal', ['senegal', 'sen']),
  createCountry('SUI', 'Switzerland', ['suiza', 'switzerland', 'sui']),
  createCountry('SWE', 'Sweden', ['suecia', 'sweden', 'swe']),
  createCountry('TUN', 'Tunisia', ['tunez', 'tunisia', 'tun']),
  createCountry('TUR', 'Türkiye', ['turquia', 'turkiye', 'turkey', 'tur']),
  createCountry('URU', 'Uruguay', ['uruguay', 'uru']),
  createCountry('USA', 'United States', ['estados unidos', 'usa', 'eeuu', 'us', 'united states']),
  createCountry('UZB', 'Uzbekistan', ['uzbekistan', 'uzb']),
  createCountry('FWC', 'FIFA World Cup', ['fwc', 'world cup', 'fifa world cup'], {
    9: 'Italia 1934',
    10: 'Brazil 1950',
    11: 'Switzerland 1954',
    12: 'Chile 1962',
    13: 'Germany 1974',
    14: 'Mexico 1986',
    15: 'United States 1994',
    16: 'South Korea/Japan 2002',
    17: 'Germany 2006',
    18: 'Brazil 2014',
    19: 'Qatar 2022',
  }, 19),
  createCountry('CC', 'Coca Cola', ['cc', 'coca cola', 'cocacola'], {
    1: 'Lamine Yamal',
    2: 'Joshua Kimmich',
    3: 'Harry Kane',
    4: 'Santiago Gimenez',
    5: 'Josko Gvardiol',
    6: 'Federico Valverde',
    7: 'Jefferson Lerma',
    8: 'Enner Valencia',
    9: 'Gabriel Magalhaes',
    10: 'Virgil van Dijk',
    11: 'Alphonso Davies',
    12: 'Emiliano Martinez',
    13: 'Raul Jimenez',
    14: 'Lautaro Martinez',
  }, 14),
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

const COUNTRY_FLAGS: Record<string, string> = {
  ALG: '🇩🇿', ARG: '🇦🇷', AUS: '🇦🇺', AUT: '🇦🇹',
  BEL: '🇧🇪', BIH: '🇧🇦', BRA: '🇧🇷',
  CAN: '🇨🇦', CIV: '🇨🇮', CMR: '🇨🇲', COD: '🇨🇩',
  COL: '🇨🇴', CPV: '🇨🇻', CRC: '🇨🇷', CRO: '🇭🇷',
  CUW: '🇨🇼', CZE: '🇨🇿',
  DEN: '🇩🇰',
  ECU: '🇪🇨', EGY: '🇪🇬', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ESP: '🇪🇸',
  FRA: '🇫🇷',
  GER: '🇩🇪', GHA: '🇬🇭',
  HAI: '🇭🇹',
  IRN: '🇮🇷', IRQ: '🇮🇶',
  JOR: '🇯🇴', JPN: '🇯🇵',
  KOR: '🇰🇷', KSA: '🇸🇦',
  MAR: '🇲🇦', MEX: '🇲🇽',
  NED: '🇳🇱', NOR: '🇳🇴', NZL: '🇳🇿',
  PAN: '🇵🇦', PAR: '🇵🇾', POL: '🇵🇱', POR: '🇵🇹',
  QAT: '🇶🇦',
  RSA: '🇿🇦',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', SEN: '🇸🇳', SRB: '🇷🇸', SUI: '🇨🇭', SWE: '🇸🇪',
  TUN: '🇹🇳', TUR: '🇹🇷',
  URU: '🇺🇾', USA: '🇺🇸', UZB: '🇺🇿',
  WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  FWC: '🏆', CC: '🥤', WP: '📔',
};

export const getCountryFlag = (countryCode: string): string =>
  COUNTRY_FLAGS[countryCode.toUpperCase()] ?? '🌍';
