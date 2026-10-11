import type { CollectionItem, GamePayload, NamedRef, RawgGame, RawgGameDetail } from './api';

/** Minimal shape every grid tile renders, whether it comes from RAWG or from a saved collection. */
export interface GameTile {
  id: number;
  name: string;
  image: string | null;
  released: string | null;
  rating: number | null;
  metacritic: number | null;
  genres: NamedRef[];
}

/** RAWG serves resized images when "crop/W/H/" is inserted after "/media/". */
export function cropImage(url: string | null | undefined, width = 640, height = 360): string | null {
  if (!url) return null;
  if (!url.startsWith('https://media.rawg.io/media/') || url.includes('/media/crop/')) return url;
  return url.replace('https://media.rawg.io/media/', `https://media.rawg.io/media/crop/${width}/${height}/`);
}

export function releaseYear(released: string | null | undefined): number | null {
  const year = released ? Number(released.slice(0, 4)) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

export function platformsOf(game: RawgGame): NamedRef[] {
  return (game.parent_platforms ?? []).map(({ platform }) => ({ id: platform.id, name: platform.name }));
}

const nullIfEmpty = (value: string | null | undefined): string | null => (value ? value : null);
const intOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

/** Builds the exact body the backend validates (camelCase, integers where it expects ints). */
export function toGamePayload(game: RawgGameDetail): GamePayload {
  return {
    rawgId: game.id,
    slug: game.slug ?? '',
    name: game.name,
    description: nullIfEmpty(game.description_raw?.slice(0, 20000)),
    backgroundImage: nullIfEmpty(game.background_image),
    released: nullIfEmpty(game.released),
    rating: typeof game.rating === 'number' ? Math.min(Math.max(game.rating, 0), 5) : null,
    ratingsCount: intOrNull(game.ratings_count),
    metacritic: intOrNull(game.metacritic),
    playtime: intOrNull(game.playtime),
    genres: (game.genres ?? []).map(({ id, name }) => ({ id, name })),
    platforms: platformsOf(game),
  };
}

export function tileFromRawg(game: RawgGame): GameTile {
  return {
    id: game.id,
    name: game.name,
    image: game.background_image,
    released: game.released,
    rating: game.rating ?? null,
    metacritic: game.metacritic,
    genres: game.genres ?? [],
  };
}

export function tileFromItem(item: CollectionItem): GameTile {
  return {
    id: item.rawgId,
    name: item.name,
    image: item.backgroundImage,
    released: item.released,
    rating: item.rating,
    metacritic: item.metacritic,
    genres: item.genres,
  };
}
