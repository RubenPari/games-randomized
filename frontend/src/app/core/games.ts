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

// RAWG only serves a few sizes; others redirect to api.rawg.io and 404. CSS object-cover does the cropping.
const RESIZE_WIDTHS = [200, 420, 640, 1280];

/** Smallest RAWG-supported "resize/W/-/" variant at least `width` wide (original if wider than all). */
export function resizeImage(url: string | null | undefined, width = 640): string | null {
  if (!url) return null;
  const prefix = 'https://media.rawg.io/media/';
  const size = RESIZE_WIDTHS.find((w) => w >= width);
  if (!size || !url.startsWith(prefix) || /\/media\/(crop|resize)\//.test(url)) return url;
  return url.replace(prefix, `${prefix}resize/${size}/-/`);
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
