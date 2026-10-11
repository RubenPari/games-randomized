import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { Api, type LoginResponse, type User } from './api';

const TOKEN_KEY = 'games-randomized-token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the session lasts for this tab only.
  }
}

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  readonly token = signal<string | null>(readToken());
  readonly user = signal<User | null>(null);

  async login(username: string, password: string): Promise<void> {
    this.start(await this.api.login(username, password));
  }

  async register(username: string, email: string, password: string): Promise<void> {
    this.start(await this.api.register(username, email, password));
  }

  /** Resolves the user behind a stored token; false when there is none or it is no longer valid. */
  async ensureUser(): Promise<boolean> {
    if (!this.token()) return false;
    if (this.user()) return true;
    try {
      this.user.set(await this.api.me());
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  clear(): void {
    writeToken(null);
    this.token.set(null);
    this.user.set(null);
  }

  private start({ token, user }: LoginResponse): void {
    writeToken(token);
    this.token.set(token);
    this.user.set(user);
  }
}

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register'];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  const router = inject(Router);
  const token = session.token();
  const isApi = request.url.startsWith('/api/');
  const authed = token && isApi ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authed).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && isApi && !PUBLIC_PATHS.includes(request.url)) {
        session.clear();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router); // before await: injection context ends at the first await
  if (await session.ensureUser()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
