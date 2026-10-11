import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  Injectable,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, errorMessage, type NamedRef, type QueryParams, type RawgGameDetail } from '../../core/api';
import { Collections } from '../../core/collections';
import { toGamePayload } from '../../core/games';
import {
  buildExplainRequest,
  buildProfile,
  feedbackFor,
  feedbackRecord,
  loadFeedback,
  PAGE_SIZE,
  pickRandomValidGame,
  saveFeedback,
  totalPagesFor,
  type FeedbackRecord,
} from '../../core/recommendation';
import { Session } from '../../core/session';
import { Icon } from '../../shared/icon';
import { GameCard, type FeedbackEvent } from './game-card';

const CURRENT_YEAR = new Date().getFullYear();
export const MIN_YEAR = 1980;

export interface Filters {
  genreIds: number[];
  platformIds: number[];
  yearFrom: number;
  yearTo: number;
  metacriticMin: number;
  minRatings: number;
}

export const DEFAULT_FILTERS: Filters = {
  genreIds: [],
  platformIds: [],
  yearFrom: MIN_YEAR,
  yearTo: CURRENT_YEAR,
  metacriticMin: 0,
  minRatings: 20,
};

export function filtersToParams(f: Filters): QueryParams {
  const from = Math.min(f.yearFrom, f.yearTo);
  const to = Math.max(f.yearFrom, f.yearTo);
  return {
    page_size: PAGE_SIZE,
    exclude_additions: 'true',
    genres: f.genreIds.join(',') || undefined,
    parent_platforms: f.platformIds.join(',') || undefined,
    dates: from > MIN_YEAR || to < CURRENT_YEAR ? `${from}-01-01,${to}-12-31` : undefined,
    metacritic: f.metacriticMin > 0 ? `${f.metacriticMin},100` : undefined,
  };
}

/** Root-scoped so the current pick and filters survive navigating away and back. */
@Injectable({ providedIn: 'root' })
export class DiscoverStore {
  private readonly api = inject(Api);
  private readonly session = inject(Session);
  private readonly collections = inject(Collections);
  private readonly transloco = inject(TranslocoService);

  readonly filters = signal<Filters>(DEFAULT_FILTERS);
  readonly genres = signal<NamedRef[]>([]);
  readonly platforms = signal<NamedRef[]>([]);
  readonly game = signal<RawgGameDetail | null>(null);
  readonly explanationKeys = signal<string[]>([]);
  readonly aiExplanation = signal<string | null>(null);
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  private readonly history = signal<FeedbackRecord[]>([]);
  private historyOwner: string | null = null;

  readonly feedbackValue = computed(() => {
    const g = this.game();
    return g ? feedbackFor(this.history(), g.id) : null;
  });

  init(): void {
    const userId = this.session.user()?.id ?? null;
    if (this.historyOwner !== userId) {
      this.historyOwner = userId;
      this.history.set(loadFeedback(userId));
      this.game.set(null);
    }
    if (!this.genres().length) this.api.genres().then((r) => this.genres.set(r.results), () => undefined);
    if (!this.platforms().length) this.api.platforms().then((r) => this.platforms.set(r.results), () => undefined);
  }

  async generate(): Promise<void> {
    if (this.generating()) return;
    this.generating.set(true);
    this.error.set(null);
    this.aiExplanation.set(null);
    try {
      await Promise.all([this.collections.load('wishlist'), this.collections.load('discovered')]);
      const params = filtersToParams(this.filters());
      const first = await this.api.games({ ...params, page: 1 });
      const profile = buildProfile(this.history());
      const excludedIds = new Set([
        ...this.collections.wishlistIds(),
        ...this.collections.discoveredIds(),
        ...profile.excludedIds,
      ]);
      const picked = await pickRandomValidGame({
        fetchPage: (page) => (page === 1 ? Promise.resolve(first) : this.api.games({ ...params, page })),
        fetchDetails: (id) => this.api.game(id),
        totalPages: totalPagesFor(first.count),
        excludedIds,
        minRatings: this.filters().minRatings,
        profile,
      });
      this.game.set(picked.game);
      this.explanationKeys.set(picked.explanationKeys);
      this.collections.add('discovered', toGamePayload(picked.game)).catch(() => undefined);
      this.explain(picked.game);
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message === 'NO_RESULTS'
          ? this.transloco.translate('home.noResults')
          : errorMessage(error),
      );
    } finally {
      this.generating.set(false);
    }
  }

  submitFeedback({ value, reason }: FeedbackEvent): void {
    const g = this.game();
    if (!g) return;
    this.history.set(saveFeedback(this.historyOwner, feedbackRecord(g, value, reason)));
  }

  private explain(game: RawgGameDetail): void {
    this.api.explain(buildExplainRequest(this.history(), game)).then(
      (r) => this.game()?.id === game.id && this.aiExplanation.set(r.explanation || null),
      () => undefined,
    );
  }
}

@Component({
  selector: 'app-discover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, GameCard, Icon, TranslocoPipe],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header class="max-w-3xl">
        <p class="ui-eyebrow">{{ 'home.eyebrow' | transloco }}</p>
        <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase sm:text-6xl">
          {{ 'home.title' | transloco }}
        </h1>
        <p class="mt-4 max-w-2xl text-base leading-7 text-ink/70">{{ 'home.description' | transloco }}</p>
      </header>

      <section class="ui-panel flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div class="flex flex-1 flex-wrap gap-2" [attr.aria-label]="'filters.active' | transloco">
          @for (label of activeFilters(); track label) {
            <span class="ui-chip">{{ label }}</span>
          } @empty {
            <span class="text-sm text-ink/65">{{ 'filters.none' | transloco }}</span>
          }
        </div>
        <button type="button" class="ui-button ui-button--secondary" aria-haspopup="dialog" (click)="openFilters()">
          <app-icon name="filter" />{{ 'filters.open' | transloco }}
        </button>
      </section>

      <section [attr.aria-label]="'home.resultStage' | transloco" class="flex min-h-[24rem]">
        @if (store.generating()) {
          <div class="ui-panel grid min-h-[28rem] w-full animate-pulse overflow-hidden md:grid-cols-2" role="status" aria-busy="true">
            <span class="sr-only">{{ 'home.generating' | transloco }}</span>
            <div class="min-h-64 bg-ink/15" aria-hidden="true"></div>
            <div class="space-y-5 p-7" aria-hidden="true">
              <div class="h-12 w-4/5 bg-ink/15"></div>
              <div class="h-7 w-2/5 bg-ink/15"></div>
              <div class="h-24 w-full bg-ink/10"></div>
            </div>
          </div>
        } @else if (store.game(); as game) {
          <div class="frame-enter w-full">
            <app-game-card
              [game]="game"
              [explanationKeys]="store.explanationKeys()"
              [aiExplanation]="store.aiExplanation()"
              [feedbackValue]="store.feedbackValue()"
              (feedback)="store.submitFeedback($event)"
            />
          </div>
        } @else {
          <div class="ui-panel flex min-h-[28rem] w-full flex-col items-center justify-center p-8 text-center">
            <app-icon name="brand" [size]="88" />
            <h2 class="mt-6 font-display text-4xl font-bold uppercase">{{ 'home.emptyTitle' | transloco }}</h2>
            <p class="mt-3 max-w-md text-sm leading-6 text-ink/65">{{ 'home.emptyDescription' | transloco }}</p>
          </div>
        }
      </section>

      <section
        class="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-3 border-y-2 border-ink bg-paper px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex-row lg:items-start lg:border-0 lg:bg-transparent lg:p-0"
      >
        @if (store.error(); as error) {
          <div class="flex items-start gap-3 border-2 border-danger bg-white p-3 text-sm text-danger lg:max-w-2xl" role="alert">
            <app-icon name="alert" />
            <div>
              <p class="font-bold">{{ 'common.error' | transloco }}</p>
              <p>{{ error }}</p>
            </div>
          </div>
        }
        <button
          type="button"
          class="ui-button ui-button--primary min-h-14 w-full px-8 text-base lg:ml-auto lg:w-auto"
          [disabled]="store.generating()"
          (click)="store.generate()"
        >
          @if (store.generating()) {
            <span class="ui-spinner" aria-hidden="true"></span>{{ 'home.generating' | transloco }}
          } @else {
            <app-icon name="dice" />{{ 'home.generate' | transloco }}
          }
        </button>
      </section>
    </div>

    <dialog
      #filtersDialog
      class="m-auto w-[min(40rem,calc(100%-2rem))] border-2 border-ink bg-paper p-0 text-ink shadow-[8px_8px_0_var(--color-ink)] backdrop:bg-ink/50"
      [attr.aria-label]="'filters.title' | transloco"
      (close)="applyDraft()"
    >
      <form method="dialog" class="flex max-h-[85vh] flex-col">
        <header class="flex items-center justify-between border-b-2 border-ink p-4">
          <h2 class="font-display text-3xl font-bold uppercase">{{ 'filters.title' | transloco }}</h2>
          <button type="submit" value="cancel" class="ui-button ui-button--quiet px-3" [attr.aria-label]="'common.close' | transloco">
            <app-icon name="close" />
          </button>
        </header>

        <div class="flex flex-col gap-6 overflow-y-auto p-4">
          <fieldset>
            <legend class="ui-label">{{ 'filters.genres' | transloco }}</legend>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (genre of store.genres(); track genre.id) {
                <button
                  type="button"
                  class="ui-chip cursor-pointer"
                  [class.bg-yellow]="draft().genreIds.includes(genre.id)"
                  [attr.aria-pressed]="draft().genreIds.includes(genre.id)"
                  (click)="toggle('genreIds', genre.id)"
                >
                  {{ genre.name }}
                </button>
              }
            </div>
          </fieldset>

          <fieldset>
            <legend class="ui-label">{{ 'filters.platforms' | transloco }}</legend>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (platform of store.platforms(); track platform.id) {
                <button
                  type="button"
                  class="ui-chip cursor-pointer"
                  [class.bg-yellow]="draft().platformIds.includes(platform.id)"
                  [attr.aria-pressed]="draft().platformIds.includes(platform.id)"
                  (click)="toggle('platformIds', platform.id)"
                >
                  {{ platform.name }}
                </button>
              }
            </div>
          </fieldset>

          <fieldset class="grid grid-cols-2 gap-3">
            <legend class="ui-label mb-3">{{ 'filters.years' | transloco }}</legend>
            <label class="text-sm font-semibold">
              {{ 'filters.from' | transloco }}
              <input class="ui-field mt-1" type="number" [min]="minYear" [max]="maxYear" [ngModel]="draft().yearFrom" (ngModelChange)="set('yearFrom', $event)" name="yearFrom" />
            </label>
            <label class="text-sm font-semibold">
              {{ 'filters.to' | transloco }}
              <input class="ui-field mt-1" type="number" [min]="minYear" [max]="maxYear" [ngModel]="draft().yearTo" (ngModelChange)="set('yearTo', $event)" name="yearTo" />
            </label>
          </fieldset>

          <label class="flex flex-col gap-2">
            <span class="ui-label">{{ 'filters.metacritic' | transloco: { value: draft().metacriticMin } }}</span>
            <input type="range" min="0" max="95" step="5" class="accent-violet" [ngModel]="draft().metacriticMin" (ngModelChange)="set('metacriticMin', $event)" name="metacritic" />
          </label>

          <label class="flex flex-col gap-2">
            <span class="ui-label">{{ 'filters.minRatings' | transloco: { value: draft().minRatings } }}</span>
            <input type="range" min="0" max="500" step="10" class="accent-violet" [ngModel]="draft().minRatings" (ngModelChange)="set('minRatings', $event)" name="minRatings" />
          </label>
        </div>

        <footer class="flex justify-between gap-2 border-t-2 border-ink p-4">
          <button type="button" class="ui-button ui-button--quiet" (click)="draft.set(defaults)">
            {{ 'filters.reset' | transloco }}
          </button>
          <button type="submit" value="apply" class="ui-button ui-button--primary">{{ 'filters.apply' | transloco }}</button>
        </footer>
      </form>
    </dialog>
  `,
})
export class Discover {
  protected readonly store = inject(DiscoverStore);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('filtersDialog');

  protected readonly defaults = DEFAULT_FILTERS;
  protected readonly minYear = MIN_YEAR;
  protected readonly maxYear = CURRENT_YEAR;
  protected readonly draft = signal<Filters>(DEFAULT_FILTERS);

  protected readonly activeFilters = computed(() => {
    const f = this.store.filters();
    const name = (list: NamedRef[], id: number) => list.find((x) => x.id === id)?.name ?? `#${id}`;
    const labels = [
      ...f.genreIds.map((id) => name(this.store.genres(), id)),
      ...f.platformIds.map((id) => name(this.store.platforms(), id)),
    ];
    if (f.yearFrom > MIN_YEAR || f.yearTo < CURRENT_YEAR) labels.push(`${f.yearFrom}–${f.yearTo}`);
    if (f.metacriticMin > 0) labels.push(`Metacritic ≥ ${f.metacriticMin}`);
    if (f.minRatings > 0) labels.push(this.transloco.translate('filters.ratingsChip', { value: f.minRatings }));
    return labels;
  });

  constructor() {
    this.store.init();
  }

  protected openFilters(): void {
    this.draft.set(this.store.filters());
    const dialog = this.dialog().nativeElement;
    dialog.returnValue = '';
    dialog.showModal();
  }

  /** Native <dialog> closes on submit, Esc or the close button; only "apply" keeps the draft. */
  protected applyDraft(): void {
    if (this.dialog().nativeElement.returnValue !== 'apply') return;
    const d = this.draft();
    const clampYear = (y: number) => Math.min(Math.max(Math.round(Number(y) || MIN_YEAR), MIN_YEAR), CURRENT_YEAR);
    this.store.filters.set({ ...d, yearFrom: clampYear(d.yearFrom), yearTo: clampYear(d.yearTo) });
  }

  protected toggle(key: 'genreIds' | 'platformIds', id: number): void {
    this.draft.update((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }));
  }

  protected set(key: 'yearFrom' | 'yearTo' | 'metacriticMin' | 'minRatings', value: number): void {
    this.draft.update((d) => ({ ...d, [key]: Number(value) }));
  }
}
