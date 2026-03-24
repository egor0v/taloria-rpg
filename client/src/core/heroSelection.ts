/**
 * Hero Selection — глобальное хранение выбранного героя
 * Сохраняется в localStorage, доступно на всех страницах
 */

const STORAGE_KEY = 'taloria_selected_hero_id';

export function getSelectedHeroId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setSelectedHeroId(heroId: string): void {
  localStorage.setItem(STORAGE_KEY, heroId);
}

export function clearSelectedHeroId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get selected hero from a heroes array, falling back to first hero
 */
export function findSelectedHero(heroes: any[]): any | null {
  if (!heroes?.length) return null;
  const savedId = getSelectedHeroId();
  if (savedId) {
    const found = heroes.find((h: any) => h._id === savedId);
    if (found) return found;
  }
  // Fallback to first hero and save it
  setSelectedHeroId(heroes[0]._id);
  return heroes[0];
}
