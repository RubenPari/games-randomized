import type { Routes } from '@angular/router';

import { authGuard } from './core/session';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/account').then((m) => m.AuthPage), data: { mode: 'login' } },
  { path: 'register', loadComponent: () => import('./features/account').then((m) => m.AuthPage), data: { mode: 'register' } },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/discover/discover').then((m) => m.Discover) },
      { path: 'search', loadComponent: () => import('./features/browse').then((m) => m.Search) },
      { path: 'wishlist', loadComponent: () => import('./features/browse').then((m) => m.Collection), data: { kind: 'wishlist' } },
      { path: 'discovered', loadComponent: () => import('./features/browse').then((m) => m.Collection), data: { kind: 'discovered' } },
      { path: 'similar/:id', loadComponent: () => import('./features/browse').then((m) => m.Similar) },
      { path: 'developer/:id', loadComponent: () => import('./features/browse').then((m) => m.Developer) },
      { path: 'profile', loadComponent: () => import('./features/account').then((m) => m.Profile) },
    ],
  },
  { path: '**', loadComponent: () => import('./features/account').then((m) => m.NotFound) },
];
