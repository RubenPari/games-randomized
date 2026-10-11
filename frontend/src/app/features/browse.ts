import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { Api, errorMessage, type CollectionKind, type RawgDeveloper, type RawgGameDetail } from '../core/api';
import { Collections } from '../core/collections';
import { resizeImage, tileFromItem, tileFromRawg, type GameTile } from '../core/games';
import { GameTileCard, SaveButton } from '../shared/game-tile';
import { Icon } from '../shared/icon';

const PAGE = 'mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10';
const GRID = 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3';

/**
 * Runs `load` whenever the signals it reads change, exposing loading/error state.
 * Results from a superseded run are dropped.
 */
function loader<T>(load: () => Promise<T> | null) {
  const value = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<string | null>(null);
  effect((onCleanup) => {
    const pending = load();
    let stale = false;
    onCleanup(() => (stale = true));
    value.set(null);
    error.set(null);
    if (!pending) return;
    loading.set(true);
    pending.then(
      (v) => !stale && value.set(v),
      (e) => !stale && error.set(errorMessage(e)),
    ).finally(() => !stale && loading.set(false));
  });
  return { value, loading, error };
}

@Component({
  selector: 'app-collection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, GameTileCard, Icon, SaveButton, TranslocoPipe],
  template: `
    <div [class]="page">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="ui-eyebrow">{{ 'collection.' + kind() + '.eyebrow' | transloco }}</p>
          <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase">{{ 'collection.' + kind() + '.title' | transloco }}</h1>
          @if (items(); as list) {
            <p class="mt-3 font-mono text-xs">{{ 'collection.count' | transloco: { count: list.length } }}</p>
          }
        </div>
        <label class="w-full sm:max-w-xs">
          <span class="sr-only">{{ 'collection.filter' | transloco }}</span>
          <input class="ui-field" type="search" [placeholder]="'collection.filter' | transloco" [(ngModel)]="query" name="filter" />
        </label>
      </header>

      @if (error()) {
        <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">{{ error() }}</p>
      }
      @if (!items() && !error()) {
        <p role="status">{{ 'common.loading' | transloco }}</p>
      } @else if (items()?.length === 0) {
        <div class="ui-panel p-8 text-center text-ink/70">{{ 'collection.' + kind() + '.empty' | transloco }}</div>
      } @else {
        <div [class]="grid">
          @for (tile of visible(); track tile.id) {
            <app-game-tile [game]="tile">
              @if (kind() === 'discovered') {
                <app-save-button [rawgId]="tile.id" />
              }
              <button type="button" class="ui-button ui-button--quiet text-sm" (click)="remove(tile.id)">
                <app-icon name="trash" [size]="18" />{{ 'common.remove' | transloco }}
              </button>
            </app-game-tile>
          }
        </div>
      }
    </div>
  `,
})
export class Collection {
  private readonly collections = inject(Collections);
  readonly kind = input.required<CollectionKind>();
  protected readonly page = PAGE;
  protected readonly grid = GRID;
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal('');
  protected readonly items = computed(() => this.collections.items[this.kind()]());
  protected readonly visible = computed<GameTile[]>(() => {
    const q = this.filter().trim().toLowerCase();
    return (this.items() ?? []).filter((i) => !q || i.name.toLowerCase().includes(q)).map(tileFromItem);
  });

  protected get query(): string {
    return this.filter();
  }
  protected set query(value: string) {
    this.filter.set(value);
  }

  constructor() {
    effect(() => {
      this.error.set(null);
      this.collections.load(this.kind(), true).catch((e) => this.error.set(errorMessage(e)));
    });
  }

  protected remove(rawgId: number): void {
    this.collections.remove(this.kind(), rawgId).catch((e) => this.error.set(errorMessage(e)));
  }
}

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, GameTileCard, Icon, RouterLink, SaveButton, TranslocoPipe],
  template: `
    <div [class]="page">
      <header>
        <p class="ui-eyebrow">{{ 'search.eyebrow' | transloco }}</p>
        <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase">{{ 'search.title' | transloco }}</h1>
      </header>

      <form class="ui-panel flex flex-col gap-3 p-4 sm:flex-row" role="search" (ngSubmit)="submit()">
        <label class="flex-1">
          <span class="sr-only">{{ 'search.placeholder' | transloco }}</span>
          <input class="ui-field" type="search" name="q" [placeholder]="'search.placeholder' | transloco" [(ngModel)]="draft" />
        </label>
        <button type="submit" class="ui-button ui-button--primary"><app-icon name="search" />{{ 'search.submit' | transloco }}</button>
      </form>

      @if (term().length < 2) {
        <p class="text-sm text-ink/65">{{ 'search.hint' | transloco }}</p>
      } @else {
        @if (games.error() || developers.error()) {
          <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">
            {{ games.error() || developers.error() }}
          </p>
        }
        @if (studios().length) {
          <section>
            <h2 class="ui-label">{{ 'search.developers' | transloco }}</h2>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (d of studios(); track d.id) {
                <a [routerLink]="['/developer', d.id]" class="ui-chip hover:bg-yellow">
                  <app-icon name="building" [size]="14" />{{ d.name }} · {{ d.games_count }}
                </a>
              }
            </div>
          </section>
        }
        <section>
          <h2 class="ui-label">{{ 'search.games' | transloco }}</h2>
          @if (games.loading()) {
            <p class="mt-3" role="status">{{ 'common.loading' | transloco }}</p>
          } @else if (gameTiles().length === 0) {
            <p class="mt-3 text-sm text-ink/65">{{ 'search.empty' | transloco }}</p>
          } @else {
            <div [class]="grid + ' mt-3'">
              @for (tile of gameTiles(); track tile.id) {
                <app-game-tile [game]="tile"><app-save-button [rawgId]="tile.id" /></app-game-tile>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class Search {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  /** Search term lives in the URL (?q=) so results survive reloads and back navigation. */
  readonly q = input<string>('');
  protected readonly page = PAGE;
  protected readonly grid = GRID;
  protected draft = '';
  protected readonly term = computed(() => (this.q() ?? '').trim());

  protected readonly games = loader(() =>
    this.term().length < 2 ? null : this.api.games({ search: this.term(), search_precise: 'true', page_size: 24 }),
  );
  protected readonly developers = loader(() => (this.term().length < 2 ? null : this.api.developers(this.term())));
  protected readonly gameTiles = computed(() => (this.games.value()?.results ?? []).map(tileFromRawg));
  // RAWG ignores `search` on /developers for some keys; filtering by name keeps results honest.
  protected readonly studios = computed<RawgDeveloper[]>(() => {
    const t = this.term().toLowerCase();
    return (this.developers.value()?.results ?? []).filter((d) => d.name.toLowerCase().includes(t));
  });

  constructor() {
    effect(() => (this.draft = this.q() ?? ''));
  }

  protected submit(): void {
    void this.router.navigate([], { queryParams: { q: this.draft.trim() || null } });
  }
}

@Component({
  selector: 'app-similar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameTileCard, SaveButton, TranslocoPipe],
  template: `
    <div [class]="page">
      <header>
        <p class="ui-eyebrow">{{ 'similar.eyebrow' | transloco }}</p>
        <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase">
          {{ 'similar.title' | transloco: { name: data.value()?.source?.name ?? '…' } }}
        </h1>
      </header>
      @if (data.error()) {
        <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">{{ data.error() }}</p>
      } @else if (data.loading()) {
        <p role="status">{{ 'common.loading' | transloco }}</p>
      } @else if (tiles().length === 0) {
        <div class="ui-panel p-8 text-center text-ink/70">{{ 'similar.empty' | transloco }}</div>
      } @else {
        <div [class]="grid">
          @for (tile of tiles(); track tile.id) {
            <app-game-tile [game]="tile"><app-save-button [rawgId]="tile.id" /></app-game-tile>
          }
        </div>
      }
    </div>
  `,
})
export class Similar {
  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly page = PAGE;
  protected readonly grid = GRID;

  protected readonly data = loader(() => this.load(this.id()));
  protected readonly tiles = computed(() => (this.data.value()?.games ?? []).map(tileFromRawg));

  /** RAWG's "suggested" endpoint is paid; same genres + top English tags is a good free proxy. */
  private async load(id: number) {
    const source: RawgGameDetail = await this.api.game(id);
    const genres = (source.genres ?? []).map((g) => g.id).join(',');
    const tags = (source.tags ?? [])
      .filter((t) => !t.language || t.language === 'eng')
      .slice(0, 4)
      .map((t) => t.id)
      .join(',');
    const base = { genres, page_size: 25, ordering: '-rating', exclude_additions: 'true' };
    let page = await this.api.games({ ...base, tags: tags || undefined });
    if (page.results.length < 4 && tags) page = await this.api.games(base);
    return { source, games: page.results.filter((g) => g.id !== id).slice(0, 24) };
  }
}

@Component({
  selector: 'app-developer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameTileCard, SaveButton, TranslocoPipe],
  template: `
    <div [class]="page">
      @if (data.error()) {
        <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">{{ data.error() }}</p>
      } @else if (data.value(); as d) {
        <header class="ui-panel grid overflow-hidden md:grid-cols-[18rem_1fr]">
          <div class="aspect-video bg-ink/10 md:aspect-auto">
            @if (banner(); as src) {
              <img [src]="src" [alt]="d.developer.name" class="size-full object-cover" />
            }
          </div>
          <div class="p-6">
            <p class="ui-eyebrow">{{ 'developer.eyebrow' | transloco }}</p>
            <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase">{{ d.developer.name }}</h1>
            <p class="mt-3 font-mono text-xs">{{ 'developer.games' | transloco: { count: d.developer.games_count } }}</p>
            @if (d.developer.description) {
              <!-- RAWG sends HTML here; Angular's sanitizer strips anything executable. -->
              <div class="mt-4 max-w-3xl text-sm leading-7 text-ink/75 [&_p]:mt-2" [innerHTML]="d.developer.description"></div>
            }
          </div>
        </header>
        <div [class]="grid">
          @for (tile of tiles(); track tile.id) {
            <app-game-tile [game]="tile"><app-save-button [rawgId]="tile.id" /></app-game-tile>
          }
        </div>
      } @else {
        <p role="status">{{ 'common.loading' | transloco }}</p>
      }
    </div>
  `,
})
export class Developer {
  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly page = PAGE;
  protected readonly grid = GRID;

  protected readonly data = loader(async () => {
    const id = this.id();
    const [developer, games] = await Promise.all([
      this.api.developer(id),
      this.api.games({ developers: id, ordering: '-rating', page_size: 24 }),
    ]);
    return { developer, games: games.results };
  });
  protected readonly tiles = computed(() => (this.data.value()?.games ?? []).map(tileFromRawg));
  protected readonly banner = computed(() => resizeImage(this.data.value()?.developer.image_background, 1280));
}
