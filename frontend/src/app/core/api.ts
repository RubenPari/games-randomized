import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface NamedRef {
  id: number;
  name: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

/** Game as returned by RAWG list endpoints (snake_case, passed through by the backend proxy). */
export interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released: string | null;
  background_image: string | null;
  rating: number;
  ratings_count: number;
  metacritic: number | null;
  playtime: number;
  genres?: NamedRef[];
  parent_platforms?: { platform: NamedRef }[];
  tags?: (NamedRef & { language?: string })[];
  short_screenshots?: { id: number; image: string }[];
}

export interface RawgGameDetail extends RawgGame {
  description_raw?: string;
  developers?: NamedRef[];
  publishers?: NamedRef[];
  website?: string;
}

export interface RawgPage<T> {
  count: number;
  next: string | null;
  results: T[];
}

export interface RawgMovie {
  id: number;
  name: string;
  preview: string;
  data: { '480'?: string; max?: string };
}

export interface RawgScreenshot {
  id: number;
  image: string;
}

export interface RawgDeveloper {
  id: number;
  name: string;
  slug: string;
  image_background: string | null;
  games_count: number;
  description?: string;
}

export type CollectionKind = 'wishlist' | 'discovered';

/** Body accepted by POST /api/wishlist and /api/discovered. */
export interface GamePayload {
  rawgId: number;
  slug: string;
  name: string;
  description: string | null;
  backgroundImage: string | null;
  released: string | null;
  rating: number | null;
  ratingsCount: number | null;
  metacritic: number | null;
  playtime: number | null;
  genres: NamedRef[];
  platforms: NamedRef[];
}

export interface CollectionItem extends GamePayload {
  id: string;
  createdAt: string;
}

export interface ExplainRequest {
  userProfile: {
    likedGenres: NamedRef[];
    dislikedGenres: NamedRef[];
    likedGames: { name: string; genres: string[]; reason?: string }[];
    dislikedGames: { name: string; genres: string[]; reason?: string }[];
    likedCount: number;
  };
  candidate: {
    name: string;
    description: string;
    genres: string[];
    platforms: string[];
    rating: number;
    ratingsCount: number;
    metacritic?: number;
    releaseYear?: number;
    playtime?: number;
  };
}

export interface ExplainResponse {
  explanation: string;
  matchScore: number;
}

export type QueryParams = Record<string, string | number | undefined>;

function clean(params: QueryParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') out[key] = String(value);
  }
  return out;
}

/** Message from the backend `{ statusCode, message, error }` body, or a generic fallback. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof HttpErrorResponse) {
    const message = (error.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
    if (error.status === 0) return 'Network error';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(path: string, params: QueryParams = {}): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api${path}`, { params: clean(params) }));
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api${path}`, body));
  }

  // Auth
  login(username: string, password: string) {
    return this.post<LoginResponse>('/auth/login', { username, password });
  }
  register(username: string, email: string, password: string) {
    return this.post<LoginResponse>('/auth/register', { username, email, password });
  }
  me() {
    return this.get<User>('/auth/me');
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.post<{ message: string; token: string }>('/auth/change-password', { currentPassword, newPassword });
  }

  // Collections
  list(kind: CollectionKind) {
    return this.get<CollectionItem[]>(`/${kind}`);
  }
  add(kind: CollectionKind, payload: GamePayload) {
    return this.post<CollectionItem>(`/${kind}`, payload);
  }
  remove(kind: CollectionKind, rawgId: number) {
    return firstValueFrom(this.http.delete<{ message: string }>(`/api/${kind}/${rawgId}`));
  }

  // RAWG (proxied, key stays on the server)
  games(params: QueryParams) {
    return this.get<RawgPage<RawgGame>>('/games', params);
  }
  game(id: number) {
    return this.get<RawgGameDetail>(`/games/${id}`);
  }
  screenshots(id: number) {
    return this.get<RawgPage<RawgScreenshot>>(`/games/${id}/screenshots`);
  }
  movies(id: number) {
    return this.get<RawgPage<RawgMovie>>(`/games/${id}/movies`);
  }
  genres() {
    return this.get<RawgPage<NamedRef>>('/genres');
  }
  platforms() {
    return this.get<RawgPage<NamedRef>>('/platforms');
  }
  developers(search: string) {
    return this.get<RawgPage<RawgDeveloper>>('/developers', { search, page_size: 20 });
  }
  developer(id: number) {
    return this.get<RawgDeveloper>(`/developers/${id}`);
  }

  // AI
  explain(body: ExplainRequest) {
    return this.post<ExplainResponse>('/recommend/explain', body);
  }
}
