import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of, type Observable } from 'rxjs';

export const EN = {
  'nav.discover': 'Discover',
  'nav.search': 'Search',
  'nav.wishlist': 'Wishlist',
  'nav.discovered': 'Discovered',
  'nav.profile': 'Profile',
  'nav.logout': 'Log out',
  'nav.skip': 'Skip to content',
  'nav.primary': 'Primary navigation',
  'locale.label': 'Language',
  'footer.attribution': 'Game data and images provided by',

  'common.error': 'Something went wrong',
  'common.close': 'Close',
  'common.showMore': 'Show more',
  'common.showLess': 'Show less',
  'common.remove': 'Remove',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',

  'home.eyebrow': 'Random game generator',
  'home.title': 'Your next game, by chance',
  'home.description':
    'Set your filters, roll the dice and get one game worth your evening. Rate the picks and the next ones get smarter.',
  'home.resultStage': 'Tonight you could play',
  'home.generating': 'Rolling…',
  'home.generate': 'Roll a game',
  'home.emptyTitle': 'Ready when you are',
  'home.emptyDescription': 'Press the button to draw a random game that matches your filters.',
  'home.noResults': 'No game found. Try loosening the filters.',

  'filters.active': 'Active filters',
  'filters.none': 'No filters: anything goes.',
  'filters.open': 'Filters',
  'filters.title': 'Filters',
  'filters.genres': 'Genres',
  'filters.platforms': 'Platforms',
  'filters.years': 'Release years',
  'filters.from': 'From',
  'filters.to': 'To',
  'filters.metacritic': 'Minimum Metacritic: {{value}}',
  'filters.minRatings': 'Minimum player ratings: {{value}}',
  'filters.ratingsChip': '≥ {{value}} ratings',
  'filters.reset': 'Reset',
  'filters.apply': 'Apply',

  'card.screenshot': 'Show screenshot',
  'card.playtime': '~{{hours}} h',
  'card.showTrailer': 'Watch trailer',
  'card.hideTrailer': 'Hide trailer',
  'card.about': 'About',
  'card.studios': 'Studios',
  'card.publisher': 'publisher',

  'save.add': 'Wishlist',
  'save.saved': 'In wishlist',

  'similar.action': 'Similar',
  'similar.eyebrow': 'Same genres and tags',
  'similar.title': 'Games like {{name}}',
  'similar.empty': 'No similar games found.',

  'recommendation.feedbackPrompt': 'Good pick?',
  'recommendation.like': 'I like it',
  'recommendation.dislike': 'Not for me',
  'recommendation.reasonPrompt': 'Why not?',
  'recommendation.reason.not_in_mood': 'Not in the mood',
  'recommendation.reason.wrong_genre': 'Wrong genre',
  'recommendation.reason.already_played': 'Already played',
  'recommendation.reason.too_long': 'Too long',
  'recommendation.reason.wrong_platform': 'Not on my platform',
  'recommendation.whyTitle': 'Why this game',
  'recommendation.highRating': 'Players rate it highly.',
  'recommendation.criticallyAcclaimed': 'Critics loved it.',
  'recommendation.matchesPreferredGenres': 'It matches genres you liked.',
  'recommendation.personalizedFromFeedback': 'Tuned on your previous ratings.',
  'recommendation.freshPick': 'A game you have not seen here before.',

  'auth.eyebrow': 'Games/Randomized account',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.login.title': 'Welcome back',
  'auth.login.subtitle': 'Log in to keep your wishlist and history.',
  'auth.login.submit': 'Log in',
  'auth.login.switch': 'No account yet? Register',
  'auth.register.title': 'Create an account',
  'auth.register.subtitle': 'Usernames use letters, numbers and underscores. Passwords need 8+ characters.',
  'auth.register.submit': 'Register',
  'auth.register.switch': 'Already registered? Log in',

  'profile.eyebrow': 'Account',
  'profile.title': 'Profile',
  'profile.changePassword': 'Change password',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.submit': 'Update password',
  'profile.success': 'Password updated.',
  'profile.mismatch': 'The new passwords do not match.',

  'collection.wishlist.eyebrow': 'Saved for later',
  'collection.wishlist.title': 'Wishlist',
  'collection.wishlist.empty': 'Nothing saved yet. Roll a game and add it to your wishlist.',
  'collection.discovered.eyebrow': 'Every game you rolled',
  'collection.discovered.title': 'Discovered',
  'collection.discovered.empty': 'No discoveries yet. Roll your first game.',
  'collection.count': '{{count}} games',
  'collection.filter': 'Filter by name',

  'search.eyebrow': 'Find a specific game',
  'search.title': 'Search',
  'search.placeholder': 'Game or studio name',
  'search.submit': 'Search',
  'search.games': 'Games',
  'search.developers': 'Studios',
  'search.empty': 'No results.',
  'search.hint': 'Type at least 2 characters.',

  'developer.eyebrow': 'Studio',
  'developer.games': '{{count}} games',

  'notFound.title': 'Game over',
  'notFound.description': 'This page does not exist.',
  'notFound.back': 'Back to the generator',
} satisfies Translation;

type Catalog = Record<keyof typeof EN, string>;

export const IT: Catalog = {
  'nav.discover': 'Scopri',
  'nav.search': 'Cerca',
  'nav.wishlist': 'Wishlist',
  'nav.discovered': 'Scoperti',
  'nav.profile': 'Profilo',
  'nav.logout': 'Esci',
  'nav.skip': 'Vai al contenuto',
  'nav.primary': 'Navigazione principale',
  'locale.label': 'Lingua',
  'footer.attribution': 'Dati e immagini dei giochi forniti da',

  'common.error': 'Qualcosa è andato storto',
  'common.close': 'Chiudi',
  'common.showMore': 'Mostra di più',
  'common.showLess': 'Mostra meno',
  'common.remove': 'Rimuovi',
  'common.loading': 'Caricamento…',
  'common.retry': 'Riprova',

  'home.eyebrow': 'Generatore di giochi casuali',
  'home.title': 'Il tuo prossimo gioco, a caso',
  'home.description':
    'Imposta i filtri, tira i dadi e ottieni un gioco per la serata. Valuta le proposte e le prossime saranno più azzeccate.',
  'home.resultStage': 'Stasera potresti giocare',
  'home.generating': 'Sto tirando…',
  'home.generate': 'Tira un gioco',
  'home.emptyTitle': 'Pronto quando vuoi',
  'home.emptyDescription': 'Premi il pulsante per estrarre un gioco casuale che rispetta i tuoi filtri.',
  'home.noResults': 'Nessun gioco trovato. Prova ad allargare i filtri.',

  'filters.active': 'Filtri attivi',
  'filters.none': 'Nessun filtro: va bene tutto.',
  'filters.open': 'Filtri',
  'filters.title': 'Filtri',
  'filters.genres': 'Generi',
  'filters.platforms': 'Piattaforme',
  'filters.years': 'Anni di uscita',
  'filters.from': 'Dal',
  'filters.to': 'Al',
  'filters.metacritic': 'Metacritic minimo: {{value}}',
  'filters.minRatings': 'Valutazioni minime dei giocatori: {{value}}',
  'filters.ratingsChip': '≥ {{value}} valutazioni',
  'filters.reset': 'Azzera',
  'filters.apply': 'Applica',

  'card.screenshot': 'Mostra screenshot',
  'card.playtime': '~{{hours}} h',
  'card.showTrailer': 'Guarda il trailer',
  'card.hideTrailer': 'Nascondi trailer',
  'card.about': 'Descrizione',
  'card.studios': 'Studi',
  'card.publisher': 'publisher',

  'save.add': 'Wishlist',
  'save.saved': 'In wishlist',

  'similar.action': 'Simili',
  'similar.eyebrow': 'Stessi generi e tag',
  'similar.title': 'Giochi come {{name}}',
  'similar.empty': 'Nessun gioco simile trovato.',

  'recommendation.feedbackPrompt': 'Buona scelta?',
  'recommendation.like': 'Mi piace',
  'recommendation.dislike': 'Non fa per me',
  'recommendation.reasonPrompt': 'Perché no?',
  'recommendation.reason.not_in_mood': 'Non è il momento',
  'recommendation.reason.wrong_genre': 'Genere sbagliato',
  'recommendation.reason.already_played': 'Già giocato',
  'recommendation.reason.too_long': 'Troppo lungo',
  'recommendation.reason.wrong_platform': 'Non è sulla mia piattaforma',
  'recommendation.whyTitle': 'Perché questo gioco',
  'recommendation.highRating': 'I giocatori lo valutano molto bene.',
  'recommendation.criticallyAcclaimed': 'La critica lo ha adorato.',
  'recommendation.matchesPreferredGenres': 'Rispecchia i generi che ti sono piaciuti.',
  'recommendation.personalizedFromFeedback': 'Calibrato sulle tue valutazioni.',
  'recommendation.freshPick': 'Un gioco che non hai ancora visto qui.',

  'auth.eyebrow': 'Account Games/Randomized',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.login.title': 'Bentornato',
  'auth.login.subtitle': 'Accedi per ritrovare wishlist e cronologia.',
  'auth.login.submit': 'Accedi',
  'auth.login.switch': 'Non hai un account? Registrati',
  'auth.register.title': 'Crea un account',
  'auth.register.subtitle': 'Username con lettere, numeri e underscore. Password di almeno 8 caratteri.',
  'auth.register.submit': 'Registrati',
  'auth.register.switch': 'Hai già un account? Accedi',

  'profile.eyebrow': 'Account',
  'profile.title': 'Profilo',
  'profile.changePassword': 'Cambia password',
  'profile.currentPassword': 'Password attuale',
  'profile.newPassword': 'Nuova password',
  'profile.confirmPassword': 'Conferma nuova password',
  'profile.submit': 'Aggiorna password',
  'profile.success': 'Password aggiornata.',
  'profile.mismatch': 'Le nuove password non coincidono.',

  'collection.wishlist.eyebrow': 'Da giocare',
  'collection.wishlist.title': 'Wishlist',
  'collection.wishlist.empty': 'Ancora niente. Tira un gioco e aggiungilo alla wishlist.',
  'collection.discovered.eyebrow': 'Ogni gioco estratto',
  'collection.discovered.title': 'Scoperti',
  'collection.discovered.empty': 'Nessuna scoperta. Tira il tuo primo gioco.',
  'collection.count': '{{count}} giochi',
  'collection.filter': 'Filtra per nome',

  'search.eyebrow': 'Trova un gioco preciso',
  'search.title': 'Cerca',
  'search.placeholder': 'Nome del gioco o dello studio',
  'search.submit': 'Cerca',
  'search.games': 'Giochi',
  'search.developers': 'Studi',
  'search.empty': 'Nessun risultato.',
  'search.hint': 'Scrivi almeno 2 caratteri.',

  'developer.eyebrow': 'Studio',
  'developer.games': '{{count}} giochi',

  'notFound.title': 'Game over',
  'notFound.description': 'Questa pagina non esiste.',
  'notFound.back': 'Torna al generatore',
};

@Injectable({ providedIn: 'root' })
export class InlineLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(lang === 'it' ? IT : EN);
  }
}

export type Lang = 'en' | 'it';
const LOCALE_KEY = 'games-randomized-locale';

@Injectable({ providedIn: 'root' })
export class Locale {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  readonly current = signal<Lang>(this.stored());

  constructor() {
    this.apply(this.current());
  }

  set(lang: Lang): void {
    try {
      localStorage.setItem(LOCALE_KEY, lang);
    } catch {
      // Not persisted; still switches for this session.
    }
    this.current.set(lang);
    this.apply(lang);
  }

  private apply(lang: Lang): void {
    this.document.documentElement.lang = lang;
    this.transloco.setActiveLang(lang);
  }

  private stored(): Lang {
    try {
      const saved = localStorage.getItem(LOCALE_KEY);
      if (saved === 'it' || saved === 'en') return saved;
    } catch {
      // ignore
    }
    return navigator.language?.startsWith('it') ? 'it' : 'en';
  }
}
