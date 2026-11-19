// Names in one place. index.html, the manifest and sw.js carry the same name and id as literals.
export const GAME_NAME = 'Müsli';
// Storage keys and the service worker's cache. Kept apart from GAME_NAME: changing it drops saved data.
export const GAME_ID = 'muesli';
