import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { Api, type RawgGameDetail, type RawgMovie, type RawgScreenshot } from '../../core/api';
import { resizeImage, platformsOf, releaseYear } from '../../core/games';
import { DISLIKE_REASONS, type FeedbackReason, type FeedbackValue } from '../../core/recommendation';
import { SaveButton } from '../../shared/game-tile';
import { Icon } from '../../shared/icon';

const DESCRIPTION_PREVIEW = 420;

export interface FeedbackEvent {
  value: FeedbackValue;
  reason?: FeedbackReason;
}

@Component({
  selector: 'app-game-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink, SaveButton, TranslocoPipe],
  template: `
    @let g = game();
    <article class="overflow-hidden border-2 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]">
      <div class="grid md:grid-cols-12">
        <div class="border-ink md:col-span-6 md:border-r-2 md:bg-ink">
          <div class="aspect-video bg-ink/10">
            @if (activeImage(); as src) {
              <img [src]="src" [alt]="g.name" class="size-full object-cover" />
            }
          </div>
          @if (screenshots().length > 1) {
            <div class="grid grid-cols-4 gap-1 border-t-2 border-ink bg-ink p-1">
              @for (shot of screenshots().slice(0, 8); track shot.id) {
                <button
                  type="button"
                  class="aspect-video cursor-pointer overflow-hidden"
                  [attr.aria-label]="('card.screenshot' | transloco) + ' ' + ($index + 1)"
                  (click)="selectedShot.set(shot.image)"
                >
                  <img [src]="crop(shot.image)" alt="" loading="lazy" class="size-full object-cover" />
                </button>
              }
            </div>
          }
        </div>

        <div class="flex flex-col p-5 sm:p-7 md:col-span-6">
          <p class="ui-eyebrow">{{ 'home.resultStage' | transloco }}</p>
          <h2 class="mt-2 font-display text-4xl leading-none font-bold uppercase sm:text-5xl">{{ g.name }}</h2>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            @if (year(); as y) {
              <span class="ui-chip">{{ y }}</span>
            }
            <span class="ui-chip bg-yellow"><app-icon name="star" [size]="15" />{{ g.rating.toFixed(1) }}/5</span>
            @if (g.metacritic) {
              <span class="ui-chip">Metacritic {{ g.metacritic }}</span>
            }
            @if (g.playtime) {
              <span class="ui-chip">{{ 'card.playtime' | transloco: { hours: g.playtime } }}</span>
            }
            @for (genre of (g.genres ?? []).slice(0, 3); track genre.id) {
              <span class="ui-chip">{{ genre.name }}</span>
            }
          </div>

          @if (platforms().length) {
            <p class="mt-3 font-mono text-xs text-ink/70">{{ platforms() }}</p>
          }

          <div class="mt-4 flex flex-wrap items-start gap-2">
            <a [routerLink]="['/similar', g.id]" class="ui-button ui-button--secondary text-sm">
              <app-icon name="similar" [size]="18" />{{ 'similar.action' | transloco }}
            </a>
            <app-save-button [rawgId]="g.id" [detail]="g" />
            @if (trailer()) {
              <button
                type="button"
                class="ui-button ui-button--secondary text-sm"
                [attr.aria-expanded]="showTrailer()"
                (click)="showTrailer.set(!showTrailer())"
              >
                <app-icon name="play" [size]="18" />
                {{ (showTrailer() ? 'card.hideTrailer' : 'card.showTrailer') | transloco }}
              </button>
            }
          </div>

          <section class="mt-5 border-t-2 border-ink pt-5">
            <h3 class="ui-label">{{ 'recommendation.feedbackPrompt' | transloco }}</h3>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                class="ui-button"
                [class]="feedbackValue() === 'like' ? 'bg-success text-white' : 'ui-button--quiet'"
                [attr.aria-pressed]="feedbackValue() === 'like'"
                (click)="showReasons.set(false); feedback.emit({ value: 'like' })"
              >
                <app-icon name="thumbUp" />{{ 'recommendation.like' | transloco }}
              </button>
              <button
                type="button"
                class="ui-button"
                [class]="feedbackValue() === 'dislike' ? 'bg-coral text-ink' : 'ui-button--quiet'"
                [attr.aria-pressed]="feedbackValue() === 'dislike'"
                [attr.aria-expanded]="showReasons()"
                (click)="showReasons.set(true)"
              >
                <app-icon name="thumbDown" />{{ 'recommendation.dislike' | transloco }}
              </button>
            </div>
            @if (showReasons()) {
              <div class="mt-3 border-l-4 border-coral pl-3">
                <p class="mb-2 text-sm font-semibold">{{ 'recommendation.reasonPrompt' | transloco }}</p>
                <div class="flex flex-wrap gap-2">
                  @for (reason of reasons; track reason) {
                    <button
                      type="button"
                      class="ui-chip cursor-pointer hover:bg-coral"
                      (click)="feedback.emit({ value: 'dislike', reason })"
                    >
                      {{ 'recommendation.reason.' + reason | transloco }}
                    </button>
                  }
                </div>
              </div>
            }
          </section>

          @if (description(); as text) {
            <section class="mt-6 border-t-2 border-ink pt-5">
              <h3 class="ui-label">{{ 'card.about' | transloco }}</h3>
              <p class="mt-3 text-sm leading-7 whitespace-pre-line text-ink/75">
                {{ expanded() || !longDescription() ? text : text.slice(0, preview) + '…' }}
              </p>
              @if (longDescription()) {
                <button
                  type="button"
                  class="mt-3 cursor-pointer font-mono text-xs font-semibold text-violet uppercase underline decoration-2 underline-offset-4"
                  [attr.aria-expanded]="expanded()"
                  (click)="expanded.set(!expanded())"
                >
                  {{ (expanded() ? 'common.showLess' : 'common.showMore') | transloco }}
                </button>
              }
            </section>
          }

          @if (studios().length) {
            <section class="mt-6 border-t-2 border-ink pt-5">
              <h3 class="ui-label">{{ 'card.studios' | transloco }}</h3>
              <div class="mt-3 flex flex-wrap gap-2">
                @for (studio of studios(); track studio.key) {
                  @if (studio.developer) {
                    <a [routerLink]="['/developer', studio.id]" class="ui-chip hover:bg-yellow">
                      <app-icon name="building" [size]="14" />{{ studio.name }}
                    </a>
                  } @else {
                    <span class="ui-chip bg-paper">{{ studio.name }} · {{ 'card.publisher' | transloco }}</span>
                  }
                }
              </div>
            </section>
          }

          @if (aiExplanation()) {
            <section class="mt-6 border-2 border-violet bg-violet/5 p-4">
              <h3 class="ui-label text-violet">{{ 'recommendation.whyTitle' | transloco }}</h3>
              <p class="mt-2 text-sm leading-6 text-ink/85">{{ aiExplanation() }}</p>
            </section>
          } @else if (explanationKeys().length) {
            <section class="mt-6 border-2 border-ink bg-yellow p-4">
              <h3 class="ui-label">{{ 'recommendation.whyTitle' | transloco }}</h3>
              <ul class="mt-2 space-y-2 text-sm">
                @for (key of explanationKeys(); track key) {
                  <li class="flex gap-2"><span aria-hidden="true">—</span>{{ key | transloco }}</li>
                }
              </ul>
            </section>
          }
        </div>
      </div>

      @if (showTrailer() && trailer(); as movie) {
        <div class="border-t-2 border-ink bg-ink p-2">
          <video class="aspect-video w-full" controls autoplay [poster]="movie.preview" [src]="movie.data.max || movie.data['480']">
            {{ movie.name }}
          </video>
        </div>
      }
    </article>
  `,
})
export class GameCard {
  private readonly api = inject(Api);
  readonly game = input.required<RawgGameDetail>();
  readonly explanationKeys = input<string[]>([]);
  readonly aiExplanation = input<string | null>(null);
  readonly feedbackValue = input<FeedbackValue | null>(null);
  readonly feedback = output<FeedbackEvent>();

  protected readonly reasons = DISLIKE_REASONS;
  protected readonly preview = DESCRIPTION_PREVIEW;
  protected readonly screenshots = signal<RawgScreenshot[]>([]);
  protected readonly trailer = signal<RawgMovie | null>(null);
  protected readonly selectedShot = signal<string | null>(null);
  protected readonly showTrailer = signal(false);
  protected readonly showReasons = signal(false);
  protected readonly expanded = signal(false);

  protected readonly year = computed(() => releaseYear(this.game().released));
  protected readonly platforms = computed(() => platformsOf(this.game()).map((p) => p.name).join(' · '));
  // description_raw keeps RAWG's markdown headings ("###Plot"); drop the hashes, keep the text.
  protected readonly description = computed(() => (this.game().description_raw ?? '').replace(/^#+\s*/gm, '').trim());
  protected readonly longDescription = computed(() => this.description().length > DESCRIPTION_PREVIEW);
  protected readonly activeImage = computed(() =>
    resizeImage(this.selectedShot() ?? this.game().background_image, 1280),
  );
  protected readonly studios = computed(() => [
    ...(this.game().developers ?? []).map((d) => ({ ...d, key: `d${d.id}`, developer: true })),
    ...(this.game().publishers ?? [])
      .filter((p) => !(this.game().developers ?? []).some((d) => d.name === p.name))
      .map((p) => ({ ...p, key: `p${p.id}`, developer: false })),
  ]);

  constructor() {
    effect((onCleanup) => {
      const id = this.game().id;
      let stale = false;
      onCleanup(() => (stale = true));
      this.screenshots.set([]);
      this.trailer.set(null);
      this.selectedShot.set(null);
      this.showTrailer.set(false);
      this.expanded.set(false);
      this.showReasons.set(false);
      // Media is decoration: failures just leave it out.
      this.api.screenshots(id).then((r) => !stale && this.screenshots.set(r.results), () => undefined);
      this.api.movies(id).then((r) => !stale && this.trailer.set(r.results[0] ?? null), () => undefined);
    });
  }

  protected crop(url: string): string | null {
    return resizeImage(url, 320);
  }
}
