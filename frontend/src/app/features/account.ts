import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, errorMessage } from '../core/api';
import { Session } from '../core/session';
import { LocaleSwitcher } from '../shell';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-auth-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, LocaleSwitcher, RouterLink, TranslocoPipe],
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div class="flex w-full max-w-md items-center justify-between">
        <span class="inline-flex items-center gap-3 font-display text-xl font-bold uppercase">
          <span class="inline-flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-yellow">
            <app-icon name="brand" [size]="24" />
          </span>
          Games/Randomized
        </span>
        <app-locale-switcher />
      </div>

      <form class="ui-panel flex w-full max-w-md flex-col gap-4 p-6" (ngSubmit)="submit()">
        <p class="ui-eyebrow">{{ 'auth.eyebrow' | transloco }}</p>
        <h1 class="font-display text-4xl leading-none font-bold uppercase">{{ 'auth.' + mode() + '.title' | transloco }}</h1>
        <p class="text-sm text-ink/70">{{ 'auth.' + mode() + '.subtitle' | transloco }}</p>

        <label class="flex flex-col gap-1 text-sm font-semibold">
          {{ 'auth.username' | transloco }}
          <input class="ui-field" name="username" autocomplete="username" required minlength="3" maxlength="30" [(ngModel)]="username" />
        </label>
        @if (mode() === 'register') {
          <label class="flex flex-col gap-1 text-sm font-semibold">
            {{ 'auth.email' | transloco }}
            <input class="ui-field" name="email" type="email" autocomplete="email" required [(ngModel)]="email" />
          </label>
        }
        <label class="flex flex-col gap-1 text-sm font-semibold">
          {{ 'auth.password' | transloco }}
          <input
            class="ui-field"
            name="password"
            type="password"
            required
            [attr.minlength]="mode() === 'register' ? 8 : null"
            maxlength="72"
            [autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
            [(ngModel)]="password"
          />
        </label>

        @if (error()) {
          <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="ui-button ui-button--primary mt-2" [disabled]="busy()">
          @if (busy()) {
            <span class="ui-spinner" aria-hidden="true"></span>
          }
          {{ 'auth.' + mode() + '.submit' | transloco }}
        </button>
        <a [routerLink]="mode() === 'login' ? '/register' : '/login'" class="text-center text-sm font-semibold text-violet underline underline-offset-4">
          {{ 'auth.' + mode() + '.switch' | transloco }}
        </a>
      </form>
    </div>
  `,
})
export class AuthPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  /** Bound from route data and query params (withComponentInputBinding). */
  readonly mode = input<'login' | 'register'>('login');
  readonly returnUrl = input<string>();

  protected username = '';
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'register') await this.session.register(this.username.trim(), this.email.trim(), this.password);
      else await this.session.login(this.username.trim(), this.password);
      const target = this.returnUrl();
      // Only same-app paths: never redirect to another origin.
      await this.router.navigateByUrl(target?.startsWith('/') && !target.startsWith('//') ? target : '/');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe],
  template: `
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <header>
        <p class="ui-eyebrow">{{ 'profile.eyebrow' | transloco }}</p>
        <h1 class="mt-2 font-display text-5xl leading-[0.9] font-bold uppercase">{{ 'profile.title' | transloco }}</h1>
        <p class="mt-4 font-bold">{{ session.user()?.username }}</p>
        <p class="font-mono text-sm text-ink/65">{{ session.user()?.email }}</p>
      </header>

      <form class="ui-panel flex flex-col gap-4 p-6" (ngSubmit)="submit()">
        <h2 class="font-display text-3xl font-bold uppercase">{{ 'profile.changePassword' | transloco }}</h2>
        <label class="flex flex-col gap-1 text-sm font-semibold">
          {{ 'profile.currentPassword' | transloco }}
          <input class="ui-field" type="password" name="current" autocomplete="current-password" required [(ngModel)]="current" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">
          {{ 'profile.newPassword' | transloco }}
          <input class="ui-field" type="password" name="next" autocomplete="new-password" required minlength="8" maxlength="72" [(ngModel)]="next" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">
          {{ 'profile.confirmPassword' | transloco }}
          <input class="ui-field" type="password" name="confirm" autocomplete="new-password" required [(ngModel)]="confirm" />
        </label>
        @if (error()) {
          <p class="border-2 border-danger bg-white p-3 text-sm font-semibold text-danger" role="alert">{{ error() }}</p>
        }
        @if (success()) {
          <p class="border-2 border-success bg-white p-3 text-sm font-semibold text-success" role="status">{{ 'profile.success' | transloco }}</p>
        }
        <button type="submit" class="ui-button ui-button--primary self-start" [disabled]="busy()">{{ 'profile.submit' | transloco }}</button>
      </form>
    </div>
  `,
})
export class Profile {
  protected readonly session = inject(Session);
  private readonly api = inject(Api);
  private readonly transloco = inject(TranslocoService);
  protected current = '';
  protected next = '';
  protected confirm = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);

  protected async submit(): Promise<void> {
    this.success.set(false);
    if (this.next !== this.confirm) {
      this.error.set(this.transloco.translate('profile.mismatch'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { token } = await this.api.changePassword(this.current, this.next);
      this.session.replaceToken(token);
      this.current = this.next = this.confirm = '';
      this.success.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p class="font-mono text-sm font-semibold text-violet">404</p>
      <h1 class="font-display text-6xl font-bold uppercase">{{ 'notFound.title' | transloco }}</h1>
      <p class="text-ink/70">{{ 'notFound.description' | transloco }}</p>
      <a routerLink="/" class="ui-button ui-button--primary">{{ 'notFound.back' | transloco }}</a>
    </div>
  `,
})
export class NotFound {}
