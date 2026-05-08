export type AlbumTemplate = {
  slug: string;
  name: string;
};

export const AVAILABLE_ALBUM_TEMPLATES: AlbumTemplate[] = [
  {
    slug: 'panini-fifa-world-cup-2026',
    name: 'Panini FIFA World Cup 2026',
  },
];

const albumTemplatesBySlug = new Map(
  AVAILABLE_ALBUM_TEMPLATES.map((albumTemplate) => [albumTemplate.slug, albumTemplate]),
);

export const getAlbumTemplate = (slug: string): AlbumTemplate | undefined =>
  albumTemplatesBySlug.get(slug);
