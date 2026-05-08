import { normalizeForParsing } from './world-cup.catalog';

export type AlbumPageEntry = {
  code: string;
  name: string;
  page: number;
  aliases: string[];
};

const createAlbumPage = (
  code: string,
  name: string,
  page: number,
  aliases: string[] = [],
): AlbumPageEntry => ({
  code,
  name,
  page,
  aliases: [code, name, ...aliases],
});

const normalizeAlbumPageAlias = (value: string): string =>
  normalizeForParsing(value)
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const ALBUM_PAGES: AlbumPageEntry[] = [
  createAlbumPage('MEX', 'Mexico', 8, ['mexico', 'mex']),
  createAlbumPage('RSA', 'South Africa', 10, ['south africa', 'sudafrica', 'rsa', 'zaf']),
  createAlbumPage('KOR', 'Korea Republic', 12, ['south korea', 'korea', 'corea', 'corea del sur']),
  createAlbumPage('CZE', 'Czechia', 14, ['czech republic', 'republica checa']),

  createAlbumPage('CAN', 'Canada', 16),
  createAlbumPage('BIH', 'Bosnia-Herzegovina', 18, ['bosnia', 'bosnia herzegovina', 'bosnia and herzegovina']),
  createAlbumPage('QAT', 'Qatar', 20),
  createAlbumPage('SUI', 'Switzerland', 22, ['suiza']),

  createAlbumPage('BRA', 'Brazil', 24, ['brasil']),
  createAlbumPage('MAR', 'Morocco', 26, ['marruecos']),
  createAlbumPage('HAI', 'Haiti', 28, ['haiti']),
  createAlbumPage('SCO', 'Scotland', 30, ['escocia']),

  createAlbumPage('USA', 'USA', 32, ['united states', 'estados unidos', 'eeuu', 'us']),
  createAlbumPage('PAR', 'Paraguay', 34),
  createAlbumPage('AUS', 'Australia', 36),
  createAlbumPage('TUR', 'Türkiye', 38, ['turkiye', 'turkey', 'turquia']),

  createAlbumPage('GER', 'Germany', 40, ['alemania']),
  createAlbumPage('CUW', 'Curaçao', 42, ['curacao', 'curazao']),
  createAlbumPage('CIV', 'Côte d’Ivoire', 44, ['cote d ivoire', 'cote divoire', 'ivory coast', 'costa de marfil']),
  createAlbumPage('ECU', 'Ecuador', 46),

  createAlbumPage('NED', 'Netherlands', 48, ['paises bajos', 'holanda']),
  createAlbumPage('JPN', 'Japan', 50, ['japon', 'japan', 'jpn']),
  createAlbumPage('SWE', 'Sweden', 52, ['suecia']),
  createAlbumPage('TUN', 'Tunisia', 54, ['tunez']),

  createAlbumPage('BEL', 'Belgium', 58, ['belgica']),
  createAlbumPage('EGY', 'Egypt', 60, ['egipto']),
  createAlbumPage('IRN', 'IR Iran', 62, ['iran', 'ir iran']),
  createAlbumPage('NZL', 'New Zealand', 64, ['nueva zelanda']),

  createAlbumPage('ESP', 'Spain', 66, ['espana']),
  createAlbumPage('CPV', 'Cabo Verde', 68, ['cape verde', 'cabo verde', 'cape green']),
  createAlbumPage('KSA', 'Saudi Arabia', 70, ['saudi arabia', 'arabia saudita', 'arabia']),
  createAlbumPage('URU', 'Uruguay', 72),

  createAlbumPage('FRA', 'France', 74, ['francia']),
  createAlbumPage('SEN', 'Senegal', 76),
  createAlbumPage('IRQ', 'Iraq', 78, ['irak']),
  createAlbumPage('NOR', 'Norway', 80, ['noruega']),

  createAlbumPage('ARG', 'Argentina', 82, ['arg']),
  createAlbumPage('ALG', 'Algeria', 84, ['argelia']),
  createAlbumPage('AUT', 'Austria', 86),
  createAlbumPage('JOR', 'Jordan', 88, ['jordania']),

  createAlbumPage('POR', 'Portugal', 90),
  createAlbumPage('COD', 'Congo DR', 92, ['congo', 'dr congo', 'congo dr', 'rd congo']),
  createAlbumPage('UZB', 'Uzbekistan', 94, ['uzbekistan']),
  createAlbumPage('COL', 'Colombia', 96),

  createAlbumPage('ENG', 'England', 98, ['inglaterra']),
  createAlbumPage('CRO', 'Croatia', 100, ['croacia']),
  createAlbumPage('GHA', 'Ghana', 102),
  createAlbumPage('PAN', 'Panama', 104),
];

const pagesByAlias = new Map(
  ALBUM_PAGES.flatMap((entry) =>
    entry.aliases.map((alias) => [normalizeAlbumPageAlias(alias), entry] as const),
  ),
);

export const resolveAlbumPage = (value: string): AlbumPageEntry | undefined =>
  pagesByAlias.get(normalizeAlbumPageAlias(value));
