import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { Collections } from './core/collections';
import { Locale } from './core/i18n';
import { Session } from './core/session';
import { Icon, type IconName } from './shared/icon';

const DESTINATIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'nav.discover', icon: 'discover' },
  { to: '/search', label: 'nav.search', icon: 'search' },
  { to: '/wishlist', label: 'nav.wishlist', icon: 'wishlist' },
  { to: '/discovered', label: 'nav.discovered', icon: 'seen' },
  { to: '/profile', label: 'nav.profile', icon: 'profile' },
];

@Component({
  selector: 'app-locale-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="flex gap-1" role="group" [attr.aria-label]="'locale.label' | transloco">
      @for (lang of langs; track lang) {
        <button
          type="button"
          class="ui-chip cursor-pointer"
          [class.bg-yellow]="locale.current() === lang"
          [attr.aria-pressed]="locale.current() === lang"
          (click)="locale.set(lang)"
        >
          {{ lang }}
        </button>
      }
    </div>
  `,
})
export class LocaleSwitcher {
  protected readonly locale = inject(Locale);
  protected readonly langs = ['en', 'it'] as const;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, LocaleSwitcher, NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <a href="#main-content" class="fixed top-3 left-4 z-[70] -translate-y-24 bg-yellow px-4 py-2 font-bold focus:translate-y-0">
      {{ 'nav.skip' | transloco }}
    </a>

    <ng-template #brand>
      <a routerLink="/" class="inline-flex items-center gap-3" aria-label="Games/Randomized">
        <span class="inline-flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-yellow">
          <app-icon name="brand" [size]="24" />
        </span>
        <span class="font-display text-xl leading-none font-bold tracking-wide uppercase">Games/<br />Randomized</span>
      </a>
    </ng-template>

    <aside class="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r-2 border-ink bg-paper p-5 lg:flex">
      <ng-container [ngTemplateOutlet]="brand" />
      <nav class="mt-12 flex flex-col gap-2" [attr.aria-label]="'nav.primary' | transloco">
        @for (d of destinations; track d.to) {
          <a
            [routerLink]="d.to"
            routerLinkActive="bg-yellow"
            [routerLinkActiveOptions]="{ exact: d.to === '/' }"
            class="flex items-center gap-3 border-2 border-transparent px-3 py-3 text-sm font-bold hover:border-ink hover:bg-white"
          >
            <app-icon [name]="d.icon" />{{ d.label | transloco }}
          </a>
        }
      </nav>
      <div class="mt-auto border-t-2 border-ink pt-5">
        <app-locale-switcher />
        <div class="mt-5 min-w-0">
          <p class="truncate text-sm font-bold">{{ session.user()?.username }}</p>
          <p class="truncate font-mono text-[0.65rem] text-ink/65">{{ session.user()?.email }}</p>
        </div>
        <button type="button" class="ui-button ui-button--quiet mt-4 w-full justify-start" (click)="logout()">
          <app-icon name="logout" />{{ 'nav.logout' | transloco }}
        </button>
      </div>
    </aside>

    <header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-ink bg-paper px-4 lg:hidden">
      <ng-container [ngTemplateOutlet]="brand" />
      <app-locale-switcher />
    </header>

    <main id="main-content" class="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:ml-[232px] lg:pb-0">
      <router-outlet />
      <footer class="px-4 pb-6 font-mono text-[0.65rem] text-ink/60 sm:px-6 lg:px-10">
        {{ 'footer.attribution' | transloco }}
        <a href="https://rawg.io" target="_blank" rel="noopener" class="underline">RAWG</a>
      </footer>
    </main>

    <nav
      class="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4.5rem+env(safe-area-inset-bottom))] border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      [attr.aria-label]="'nav.primary' | transloco"
    >
      @for (d of destinations; track d.to) {
        <a
          [routerLink]="d.to"
          routerLinkActive="bg-yellow"
          [routerLinkActiveOptions]="{ exact: d.to === '/' }"
          class="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.65rem] font-bold"
        >
          <app-icon [name]="d.icon" [size]="22" /><span class="truncate">{{ d.label | transloco }}</span>
        </a>
      }
    </nav>
  `,
})
export class Shell {
  protected readonly session = inject(Session);
  private readonly collections = inject(Collections);
  private readonly router = inject(Router);
  protected readonly destinations = DESTINATIONS;

  protected logout(): void {
    this.session.clear();
    this.collections.clear();
    void this.router.navigate(['/login']);
  }
}
