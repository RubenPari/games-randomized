import type { ExplainRequest, NamedRef, RawgGame, RawgGameDetail, RawgPage } from './api';
import { platformsOf, releaseYear } from './games';

// --- Feedback history (localStorage, per user) ---------------------------------------------

export type FeedbackValue = 'like' | 'dislike';
export type FeedbackReason = 'not_in_mood' | 'wrong_genre' | 'already_played' | 'too_long' | 'wrong_platform';
export const DISLIKE_REASONS: FeedbackReason[] = [
  'not_in_mood',
  'wrong_genre',
  'already_played',
  'too_long',
  'wrong_platform',
];

export interface FeedbackRecord {
  rawgId: number;
  name: string;
  genres: NamedRef[];
  value: FeedbackValue;
  reason?: FeedbackReason;
  createdAt: string;
}

const STORAGE_PREFIX = 'games-randomized-feedback-v1';
const HISTORY_LIMIT = 400;
const SMART_EXCLUSION_THRESHOLD = 2;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadFeedback(userId: string | null | undefined): FeedbackRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(`${STORAGE_PREFIX}:${userId ?? 'guest'}`) ?? '[]');
    return Array.isArray(parsed) ? (parsed as FeedbackRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveFeedback(userId: string | null | undefined, record: FeedbackRecord): FeedbackRecord[] {
  const next = [record, ...loadFeedback(userId)].slice(0, HISTORY_LIMIT);
  try {
    storage()?.setItem(`${STORAGE_PREFIX}:${userId ?? 'guest'}`, JSON.stringify(next));
  } catch {
    // Storage full or blocked: feedback still applies for this session.
  }
  return next;
}

export function feedbackRecord(
  game: RawgGame,
  value: FeedbackValue,
  reason?: FeedbackReason,
): FeedbackRecord {
  return {
    rawgId: game.id,
    name: game.name,
    genres: (game.genres ?? []).map(({ id, name }) => ({ id, name })),
    value,
    reason,
    createdAt: new Date().toISOString(),
  };
}

/** Latest feedback wins: history is newest-first. */
export function feedbackFor(history: FeedbackRecord[], rawgId: number): FeedbackValue | null {
  return history.find((item) => item.rawgId === rawgId)?.value ?? null;
}

export interface RecommendationProfile {
  likedGenreIds: number[];
  dislikedGenreIds: number[];
  /** Games disliked twice, or marked "already played", never come back. */
  excludedIds: number[];
  likedCount: number;
}

function topIds(counts: Map<number, number>, limit = 6): number[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function buildProfile(history: FeedbackRecord[]): RecommendationProfile {
  const liked = new Map<number, number>();
  const disliked = new Map<number, number>();
  const dislikedGames = new Map<number, number>();
  let likedCount = 0;

  for (const item of history) {
    const target = item.value === 'like' ? liked : disliked;
    for (const genre of item.genres) target.set(genre.id, (target.get(genre.id) ?? 0) + 1);
    if (item.value === 'like') {
      likedCount += 1;
      continue;
    }
    const count = (dislikedGames.get(item.rawgId) ?? 0) + 1;
    dislikedGames.set(item.rawgId, item.reason === 'already_played' ? Math.max(count, SMART_EXCLUSION_THRESHOLD) : count);
  }

  return {
    likedGenreIds: topIds(liked),
    dislikedGenreIds: topIds(disliked),
    excludedIds: [...dislikedGames.entries()].filter(([, n]) => n >= SMART_EXCLUSION_THRESHOLD).map(([id]) => id),
    likedCount,
  };
}

// --- Random pick ---------------------------------------------------------------------------

export const PAGE_SIZE = 40;
/** RAWG stops paginating deep result sets; never ask for a page past this. */
export const MAX_RANDOM_PAGE = 250;

export function totalPagesFor(count: number): number {
  return Math.min(Math.max(1, Math.ceil(count / PAGE_SIZE)), MAX_RANDOM_PAGE);
}

interface PickOptions {
  fetchPage: (page: number) => Promise<RawgPage<RawgGame>>;
  fetchDetails: (id: number) => Promise<RawgGameDetail>;
  totalPages: number;
  excludedIds?: ReadonlySet<number>;
  minRatings?: number;
  profile?: RecommendationProfile;
  maxAttempts?: number;
  random?: () => number;
}

export interface PickResult {
  game: RawgGameDetail;
  explanationKeys: string[];
}

export function scoreGame(game: Pick<RawgGame, 'rating' | 'genres'>, profile?: RecommendationProfile): number {
  const ratingScore = Math.max(0.2, (game.rating ?? 0) / 4);
  if (!profile) return ratingScore;
  const ids = (game.genres ?? []).map((g) => g.id);
  const likedOverlap = ids.filter((id) => profile.likedGenreIds.includes(id)).length;
  const dislikedOverlap = ids.filter((id) => profile.dislikedGenreIds.includes(id)).length;
  return Math.max(0.1, ratingScore + likedOverlap * 0.7 - dislikedOverlap * 0.5);
}

function pickWeighted<T extends { score: number }>(items: T[], random: () => number): T {
  let draw = random() * items.reduce((sum, item) => sum + item.score, 0);
  for (const item of items) {
    draw -= item.score;
    if (draw <= 0) return item;
  }
  return items[items.length - 1];
}

export function explanationKeys(game: RawgGameDetail, profile?: RecommendationProfile): string[] {
  const keys: string[] = [];
  if ((game.rating ?? 0) >= 4) keys.push('recommendation.highRating');
  if ((game.metacritic ?? 0) >= 85) keys.push('recommendation.criticallyAcclaimed');
  if (profile?.likedGenreIds.length && (game.genres ?? []).some((g) => profile.likedGenreIds.includes(g.id))) {
    keys.push('recommendation.matchesPreferredGenres');
  }
  if ((profile?.likedCount ?? 0) > 0) keys.push('recommendation.personalizedFromFeedback');
  keys.push('recommendation.freshPick');
  return keys.slice(0, 3);
}

const hasDescription = (game: RawgGameDetail) => Boolean(game.description_raw?.trim());

export async function pickRandomValidGame({
  fetchPage,
  fetchDetails,
  totalPages,
  excludedIds = new Set(),
  minRatings = 0,
  profile,
  maxAttempts = 5,
  random = Math.random,
}: PickOptions): Promise<PickResult> {
  let pages = Math.max(1, totalPages);
  let attempts = 0;
  while (attempts < maxAttempts) {
    const page = Math.floor(random() * pages) + 1;
    let data: RawgPage<RawgGame>;
    try {
      data = await fetchPage(page);
    } catch (error) {
      // Deep pages can 404 even when `count` says they exist: halve the range and retry.
      // Terminates because the range shrinks until page 1, whose failure is rethrown.
      if (page === 1) throw error;
      pages = Math.max(1, Math.floor(page / 2));
      continue;
    }
    attempts += 1;
    const candidates = (data.results ?? [])
      .filter((g) => !excludedIds.has(g.id) && g.background_image && (g.ratings_count ?? 0) >= minRatings)
      .map((g) => ({ ...g, score: scoreGame(g, profile) }));
    if (candidates.length === 0) continue;

    const details = await fetchDetails(pickWeighted(candidates, random).id);
    if (hasDescription(details) && !excludedIds.has(details.id)) {
      return { game: details, explanationKeys: explanationKeys(details, profile) };
    }
  }
  throw new Error('NO_RESULTS');
}

// --- AI explanation request ----------------------------------------------------------------

export function buildExplainRequest(history: FeedbackRecord[], game: RawgGameDetail): ExplainRequest {
  const profile = buildProfile(history);
  const genreNames = new Map<number, string>();
  for (const item of history) for (const g of item.genres) genreNames.set(g.id, g.name);
  const named = (ids: number[]) => ids.map((id) => ({ id, name: genreNames.get(id) ?? String(id) }));
  const asGame = (item: FeedbackRecord) => ({
    name: item.name,
    genres: item.genres.map((g) => g.name),
    ...(item.reason ? { reason: item.reason } : {}),
  });
  const year = releaseYear(game.released);

  return {
    userProfile: {
      likedGenres: named(profile.likedGenreIds),
      dislikedGenres: named(profile.dislikedGenreIds),
      likedGames: history.filter((h) => h.value === 'like').slice(0, 5).map(asGame),
      dislikedGames: history.filter((h) => h.value === 'dislike').slice(0, 5).map(asGame),
      likedCount: profile.likedCount,
    },
    candidate: {
      name: game.name,
      description: (game.description_raw ?? '').slice(0, 2000),
      genres: (game.genres ?? []).map((g) => g.name),
      platforms: platformsOf(game).map((p) => p.name),
      rating: Math.min(Math.max(game.rating ?? 0, 0), 5),
      ratingsCount: game.ratings_count ?? 0,
      ...(game.metacritic ? { metacritic: game.metacritic } : {}),
      ...(year ? { releaseYear: year } : {}),
      ...(game.playtime ? { playtime: Math.round(game.playtime) } : {}),
    },
  };
}
