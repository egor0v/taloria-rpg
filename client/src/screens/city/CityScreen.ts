import { api } from '../../core/api';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import './CityScreen.css';

// Позиции иконок на карте города (в % от размера карты)
const LOCATION_POSITIONS: Record<string, { x: number; y: number; icon: string; img?: string }> = {
  'tavern-1':  { x: 28, y: 42, icon: '🍺', img: '/uploads/city/zolotoy-kubik.png' },
  'tavern-2':  { x: 15, y: 25, icon: '🍺', img: '/uploads/city/veseliy-goblin.png' },
  'tavern-3':  { x: 72, y: 28, icon: '🍺', img: '/uploads/city/elf-dub.png' },
  'tavern-4':  { x: 85, y: 55, icon: '🍺', img: '/uploads/city/temniy-podval.png' },
  'smithy':    { x: 20, y: 58, icon: '⚒️', img: '/uploads/city/kuznica.png' },
  'temple':    { x: 58, y: 22, icon: '⛪', img: '/uploads/city/hram.png' },
  'alchemist': { x: 78, y: 62, icon: '🧪', img: '/uploads/city/alhimik-lavka.png' },
  'herbalist': { x: 42, y: 75, icon: '🌿', img: '/uploads/city/hijina-travnicy.png' },
  'shop-1':    { x: 32, y: 68, icon: '📚', img: '/uploads/city/books-lavka.png' },
  'shop-2':    { x: 55, y: 50, icon: '💎', img: '/uploads/city/lavka-yuvelira.png' },
  'shop-3':    { x: 35, y: 35, icon: '✨', img: '/uploads/city/magik-lavka.png' },
  'shop-4':    { x: 62, y: 42, icon: '🏪', img: '/uploads/city/lavka-brona.png' },
  'main-shop': { x: 52, y: 38, icon: '🏛️', img: '/uploads/city/glav-lavka.png' },
  'gates':     { x: 52, y: 82, icon: '🏰', img: '/uploads/city/vorota.png' },
};

export async function renderCity(container: HTMLElement): Promise<void> {
  clearElement(container);

  container.innerHTML = `
    <div class="city-page">
      <div class="city-map-wrapper">
        <div class="city-map" id="city-map">
          <img src="/uploads/maps/city-map.png" alt="Город Талория" class="city-map-bg" />
          <div class="city-locations" id="city-locations"></div>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await api.get('/api/city/locations');
    const locationsEl = document.getElementById('city-locations')!;

    let html = '';
    for (const loc of (data.locations || [])) {
      const pos = LOCATION_POSITIONS[loc.id];
      if (!pos) continue;

      html += `
        <div class="city-loc" style="left:${pos.x}%;top:${pos.y}%" data-loc-id="${loc.id}">
          <div class="city-loc-icon-wrap">
            ${pos.img ? `<img src="${pos.img}" class="city-loc-img" alt="" />` : `<span class="city-loc-icon">${pos.icon}</span>`}
            ${loc.onlinePlayers > 0 ? `<span class="city-loc-badge">${loc.onlinePlayers}</span>` : ''}
          </div>
          <span class="city-loc-name">${loc.name}</span>
        </div>
      `;
    }

    locationsEl.innerHTML = html;

    // Click handlers
    locationsEl.querySelectorAll('.city-loc').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.locId!;
        const loc = (data.locations || []).find((l: any) => l.id === id);
        if (loc) {
          showLocationPopup(loc);
        }
      });
    });
  } catch {
    document.getElementById('city-locations')!.innerHTML =
      '<p style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--red)">Ошибка загрузки города</p>';
  }
}

function showLocationPopup(loc: any) {
  // Special locations: redirect
  if (loc.type === 'main_shop') { window.location.href = '/lavka'; return; }
  if (loc.type === 'gates') { navigateTo('/dashboard'); return; }

  // Remove existing popup
  document.querySelector('.city-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'city-popup';
  popup.innerHTML = `
    <div class="city-popup-card">
      <button class="city-popup-close" id="city-popup-close">✕</button>
      <h3 class="city-popup-title">${loc.name}</h3>
      <p class="city-popup-meta">${loc.onlinePlayers || 0} / ${loc.maxPlayers} игроков</p>
      <div class="city-popup-actions">
        <button class="btn btn-primary city-popup-enter" id="btn-enter-location">Войти</button>
      </div>
    </div>
  `;

  document.querySelector('.city-page')?.appendChild(popup);

  document.getElementById('city-popup-close')?.addEventListener('click', () => popup.remove());
  document.getElementById('btn-enter-location')?.addEventListener('click', () => {
    popup.remove();
    navigateTo(`/city/${loc.id}`);
  });

  popup.addEventListener('click', (e) => {
    if (e.target === popup) popup.remove();
  });
}
