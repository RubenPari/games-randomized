import { computed, inject, Injectable, signal } from '@angular/core';

import { Api, type CollectionItem, type CollectionKind, type GamePayload } from './api';

/** Client cache of the user's two saved lists; cleared on logout. */
@Injectable({ providedIn: 'root' })
export class Collections {
  private readonly api = inject(Api);
  readonly items = {
    wishlist: signal<CollectionItem[] | null>(null),
    discovered: signal<CollectionItem[] | null>(null),
  };
  readonly wishlistIds = computed(() => new Set((this.items.wishlist() ?? []).map((i) => i.rawgId)));
  readonly discoveredIds = computed(() => new Set((this.items.discovered() ?? []).map((i) => i.rawgId)));

  async load(kind: CollectionKind, force = false): Promise<void> {
    if (!force && this.items[kind]()) return;
    this.items[kind].set(await this.api.list(kind));
  }

  async add(kind: CollectionKind, payload: GamePayload): Promise<void> {
    const item = await this.api.add(kind, payload);
    this.items[kind].update((list) => (list ? [item, ...list.filter((i) => i.rawgId !== item.rawgId)] : list));
  }

  async remove(kind: CollectionKind, rawgId: number): Promise<void> {
    await this.api.remove(kind, rawgId);
    this.items[kind].update((list) => list?.filter((i) => i.rawgId !== rawgId) ?? null);
  }

  clear(): void {
    this.items.wishlist.set(null);
    this.items.discovered.set(null);
  }
}
