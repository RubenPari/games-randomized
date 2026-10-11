import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { Api, errorMessage, type RawgGameDetail } from '../core/api';
import { Collections } from '../core/collections';
import { cropImage, releaseYear, toGamePayload, type GameTile } from '../core/games';
import { Icon } from './icon';

/** Toggles a game in the wishlist; fetches details first when only the id is known. */
@Component({
  selector: 'app-save-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, TranslocoPipe],
  template: `
    <button
      type="button"
      class="ui-button text-sm"
      [class.ui-button--primary]="!saved()"
      [class.ui-button--quiet]="saved()"
      [attr.aria-pressed]="saved()"
      [disabled]="busy()"
      (click)="toggle()"
    >
      @if (busy()) {
        <span class="ui-spinner" aria-hidden="true"></span>
      } @else {
        <app-icon [name]="saved() ? 'check' : 'wishlist'" [size]="18" />
      }
      {{ (saved() ? 'save.saved' : 'save.add') | transloco }}
    </button>
    @if (error()) {
      <p class="mt-1 text-xs font-semibold text-danger" role="alert">{{ error() }}</p>
    }
  `,
})
export class SaveButton {
  private readonly api = inject(Api);
  private readonly collections = inject(Collections);
  readonly rawgId = input.required<number>();
  readonly detail = input<RawgGameDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = computed(() => this.collections.wishlistIds().has(this.rawgId()));

  constructor() {
    this.collections.load('wishlist').catch(() => undefined);
  }

  protected async toggle(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.saved()) {
        await this.collections.remove('wishlist', this.rawgId());
      } else {
        const detail = this.detail() ?? (await this.api.game(this.rawgId()));
        await this.collections.add('wishlist', toGamePayload(detail));
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-game-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink, TranslocoPipe],
  template: `
    @let g = game();
    <article class="flex h-full flex-col overflow-hidden border-2 border-ink bg-white shadow-[4px_4px_0_var(--color-ink)]">
      <div class="aspect-video bg-ink/10">
        @if (image(); as src) {
          <img [src]="src" [alt]="g.name" loading="lazy" class="size-full object-cover" />
        }
      </div>
      <div class="flex flex-1 flex-col gap-3 p-4">
        <h3 class="font-display text-2xl leading-none font-bold uppercase">{{ g.name }}</h3>
        <div class="flex flex-wrap gap-1.5">
          @if (year(); as y) {
            <span class="ui-chip">{{ y }}</span>
          }
          @if (g.rating) {
            <span class="ui-chip bg-yellow"><app-icon name="star" [size]="13" />{{ g.rating.toFixed(1) }}/5</span>
          }
          @if (g.metacritic) {
            <span class="ui-chip">MC {{ g.metacritic }}</span>
          }
          @for (genre of g.genres.slice(0, 2); track genre.id) {
            <span class="ui-chip">{{ genre.name }}</span>
          }
        </div>
        <div class="mt-auto flex flex-wrap items-start gap-2 pt-2">
          <a [routerLink]="['/similar', g.id]" class="ui-button ui-button--secondary text-sm">
            <app-icon name="similar" [size]="18" />{{ 'similar.action' | transloco }}
          </a>
          <ng-content />
        </div>
      </div>
    </article>
  `,
})
export class GameTileCard {
  readonly game = input.required<GameTile>();
  protected readonly image = computed(() => cropImage(this.game().image, 640, 360));
  protected readonly year = computed(() => releaseYear(this.game().released));
}
