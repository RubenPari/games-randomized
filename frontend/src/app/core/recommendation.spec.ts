import { describe, expect, it, vi } from 'vitest';

import type { RawgGame, RawgGameDetail, RawgPage } from './api';
import { resizeImage, toGamePayload } from './games';
import {
  buildProfile,
  feedbackRecord,
  pickRandomValidGame,
  totalPagesFor,
  type FeedbackRecord,
} from './recommendation';

const action = { id: 4, name: 'Action' };
const puzzle = { id: 7, name: 'Puzzle' };

function game(id: number, extra: Partial<RawgGameDetail> = {}): RawgGameDetail {
  return {
    id,
    slug: `game-${id}`,
    name: `Game ${id}`,
    released: '2015-05-19',
    background_image: 'https://media.rawg.io/media/games/a.jpg',
    rating: 4.2,
    ratings_count: 500,
    metacritic: 90,
    playtime: 12,
    genres: [action],
    description_raw: 'A description',
    ...extra,
  };
}

const page = (results: RawgGame[]): RawgPage<RawgGame> => ({ count: results.length, next: null, results });

describe('buildProfile', () => {
  it('ranks liked genres and excludes games disliked twice or already played', () => {
    const history: FeedbackRecord[] = [
      feedbackRecord(game(1), 'like'),
      feedbackRecord(game(2, { genres: [puzzle] }), 'dislike'),
      feedbackRecord(game(2, { genres: [puzzle] }), 'dislike'),
      feedbackRecord(game(3), 'dislike', 'already_played'),
      feedbackRecord(game(4), 'dislike', 'not_in_mood'),
    ];
    const profile = buildProfile(history);
    expect(profile.likedGenreIds).toEqual([4]);
    expect(profile.likedCount).toBe(1);
    expect(profile.excludedIds.sort()).toEqual([2, 3]);
    expect(profile.dislikedGenreIds).toContain(7);
  });
});

describe('pickRandomValidGame', () => {
  it('skips excluded, imageless and obscure games, and games without description', async () => {
    const results = [
      game(1),
      game(2, { background_image: null }),
      game(3, { ratings_count: 2 }),
      game(4),
      game(5),
    ];
    const fetchDetails = vi.fn(async (id: number) => (id === 4 ? game(4, { description_raw: ' ' }) : game(id)));
    const picked = await pickRandomValidGame({
      fetchPage: async () => page(results),
      fetchDetails,
      totalPages: 1,
      excludedIds: new Set([1]),
      minRatings: 10,
      random: () => 0.99, // last candidate first, then still the last
      maxAttempts: 2,
    });
    expect(picked.game.id).toBe(5);
    expect(picked.explanationKeys).toContain('recommendation.highRating');
  });

  it('shrinks the page range when a deep page fails', async () => {
    const fetchPage = vi.fn(async (p: number) => {
      if (p > 1) throw new Error('404');
      return page([game(9)]);
    });
    const picked = await pickRandomValidGame({
      fetchPage,
      fetchDetails: async (id) => game(id),
      totalPages: 200,
      random: () => 0.5,
    });
    expect(picked.game.id).toBe(9);
    expect(fetchPage).toHaveBeenLastCalledWith(1);
  });

  it('throws NO_RESULTS when nothing qualifies', async () => {
    await expect(
      pickRandomValidGame({
        fetchPage: async () => page([]),
        fetchDetails: async (id) => game(id),
        totalPages: 1,
      }),
    ).rejects.toThrow('NO_RESULTS');
  });
});

describe('helpers', () => {
  it('caps total pages', () => {
    expect(totalPagesFor(0)).toBe(1);
    expect(totalPagesFor(81)).toBe(3);
    expect(totalPagesFor(1_000_000)).toBe(250);
  });

  it('builds the backend payload with ints and clamped rating', () => {
    const payload = toGamePayload(
      game(3498, {
        rating: 5.4,
        playtime: 7.6,
        background_image: '',
        parent_platforms: [{ platform: { id: 1, name: 'PC' } }],
      }),
    );
    expect(payload).toMatchObject({
      rawgId: 3498,
      rating: 5,
      playtime: 8,
      backgroundImage: null,
      platforms: [{ id: 1, name: 'PC' }],
      genres: [action],
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        'backgroundImage', 'description', 'genres', 'metacritic', 'name', 'platforms',
        'playtime', 'rating', 'ratingsCount', 'rawgId', 'released', 'slug',
      ].sort(),
    );
  });

  it('resizes RAWG media urls to a width RAWG actually serves', () => {
    expect(resizeImage('https://media.rawg.io/media/games/a.jpg', 320)).toBe(
      'https://media.rawg.io/media/resize/420/-/games/a.jpg',
    );
    expect(resizeImage('https://media.rawg.io/media/games/a.jpg', 1280)).toBe(
      'https://media.rawg.io/media/resize/1280/-/games/a.jpg',
    );
    expect(resizeImage('https://media.rawg.io/media/games/a.jpg', 4000)).toBe('https://media.rawg.io/media/games/a.jpg');
    expect(resizeImage('https://media.rawg.io/media/crop/600/400/games/a.jpg')).toBe(
      'https://media.rawg.io/media/crop/600/400/games/a.jpg',
    );
    expect(resizeImage('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(resizeImage(null)).toBeNull();
  });
});
