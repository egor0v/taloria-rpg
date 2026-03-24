import { api } from '../../core/api';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import { getSelectedHeroId, setSelectedHeroId } from '../../core/heroSelection';
import './DashboardScreen.css';

interface Hero {
  _id: string;
  name: string;
  cls: string;
  race: string;
  gender: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  silver: number;
  canLevelUp: boolean;
}

const CLS_NAMES: Record<string, Record<string, string>> = {
  warrior: { male: 'Воин', female: 'Воительница' },
  mage: { male: 'Маг', female: 'Магесса' },
  priest: { male: 'Жрец', female: 'Жрица' },
  bard: { male: 'Бард', female: 'Бардесса' },
};
const RACE_NAMES: Record<string, Record<string, string>> = {
  human: { male: 'Человек', female: 'Человек' },
  elf: { male: 'Эльф', female: 'Эльфийка' },
  dwarf: { male: 'Дварф', female: 'Дварфийка' },
};
const XP_THRESHOLDS: number[] = [0];
for (let lvl = 2; lvl <= 50; lvl++) XP_THRESHOLDS.push(Math.round(250 * Math.pow(1.2, lvl - 2)));

const DIFF_LABELS: Record<string, string> = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная', nightmare: 'Кошмар' };

let selectedHeroId: string | null = getSelectedHeroId();

export async function renderDashboard(container: HTMLElement): Promise<void> {
  clearElement(container);
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = `
    <div class="dash">
      <!-- Heroes -->
      <section class="dash-section">
        <div class="dash-section-header">
          <h2 class="dash-title">Ваши герои</h2>
          <button class="dash-btn-create" id="btn-create-hero">+ СОЗДАТЬ ГЕРОЯ</button>
        </div>
        <div class="dash-heroes" id="heroes-grid">
          <div class="loading-screen"><div class="spinner"></div></div>
        </div>
      </section>

      <!-- Maps -->
      <section class="dash-section">
        <h2 class="dash-title">Доступные карты</h2>
        <div class="dash-maps" id="maps-grid"></div>
      </section>

      <!-- Active Games -->
      <section class="dash-section">
        <h2 class="dash-title">⚔ Текущие игры</h2>
        <div class="dash-tabs">
          <button class="dash-tab active" data-tab="continue">Продолжить игру</button>
          <button class="dash-tab" data-tab="join">Присоединиться к игре</button>
        </div>
        <div id="tab-continue" class="dash-tab-content active">
          <div id="active-sessions"></div>
        </div>
        <div id="tab-join" class="dash-tab-content">
          <div class="dash-join-form">
            <input type="text" class="input" id="input-invite-code" placeholder="Введите код приглашения" maxlength="20" />
            <button class="btn btn-primary" id="btn-join">ВОЙТИ</button>
          </div>
        </div>
      </section>

      <!-- Stats -->
      <section class="dash-section" id="stats-section" style="display:none">
        <h2 class="dash-title">📊 Статистика кампаний</h2>
        <div class="dash-stats" id="stats-grid"></div>
        <div class="dash-scenarios" id="scenarios-stats"></div>
      </section>

      <!-- History -->
      <section class="dash-section" id="history-section" style="display:none">
        <h2 class="dash-title">📜 История кампаний</h2>
        <div id="history-list"></div>
        <button class="dash-show-all hidden" id="btn-show-all-history">ПОКАЗАТЬ ВСЁ ▼</button>
      </section>
    </div>
  `;

  // Load data
  loadHeroes(user);
  loadMaps();
  loadActiveSessions();

  // Events
  document.getElementById('btn-create-hero')?.addEventListener('click', () => navigateTo('/create'));

  // Tabs
  document.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dash-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = (btn as HTMLElement).dataset.tab;
      document.getElementById(`tab-${tab}`)?.classList.add('active');
    });
  });

  // Join
  document.getElementById('btn-join')?.addEventListener('click', async () => {
    const code = (document.getElementById('input-invite-code') as HTMLInputElement).value.trim();
    if (!code) return;
    if (!selectedHeroId) return alert('Сначала выберите героя');
    try {
      const data = await api.post('/api/sessions/join-by-code', { code, heroId: selectedHeroId });
      sessionStorage.setItem('current_session', JSON.stringify(data.session));
      navigateTo('/lobby');
    } catch (err: any) { alert(err.error || 'Ошибка'); }
  });
}

async function loadHeroes(user: any) {
  const grid = document.getElementById('heroes-grid')!;
  try {
    const data = await api.get<{ heroes: Hero[] }>('/api/heroes');
    const heroes = data.heroes || [];
    const maxSlots = 2 + (user.heroSlots || 0);
    const freeRemaining = maxSlots - heroes.length;

    let html = '';

    // Render hero cards
    heroes.forEach((hero, idx) => {
      const isSelected = selectedHeroId === hero._id || (!selectedHeroId && idx === 0);
      if (isSelected && !selectedHeroId) selectedHeroId = hero._id;

      const xpNeeded = XP_THRESHOLDS[hero.level + 1] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
      const xpPercent = Math.min(100, (hero.xp / xpNeeded) * 100);
      const genderIcon = hero.gender === 'female' ? '♀' : '♂';
      const raceName = RACE_NAMES[hero.race]?.[hero.gender] || hero.race;
      const clsName = CLS_NAMES[hero.cls]?.[hero.gender] || hero.cls;

      html += `
        <div class="hero-card ${isSelected ? 'hero-card--selected' : ''}" data-hero-id="${hero._id}">
          ${isSelected ? '<div class="hero-selected-badge">✦ Выбран</div>' : ''}
          <div class="hero-portrait" style="background-image: url('/uploads/heroes/${hero.race}-${hero.gender}-${hero.cls}.png')">
            <div class="hero-level-badge">Ур. ${hero.level}</div>
            ${hero.canLevelUp ? '<div class="hero-levelup-icon">⬆</div>' : ''}
          </div>
          <div class="hero-info">
            <h3 class="hero-name">${hero.name}</h3>
            <p class="hero-class">${genderIcon} ${raceName} • ${clsName}</p>
            <div class="hero-xp-bar">
              <div class="hero-xp-fill" style="width:${xpPercent}%"></div>
              <span class="hero-xp-text">${hero.xp} / ${xpNeeded} XP</span>
            </div>
            <div class="hero-coins">
              <span class="coin-gold">🪙 ${hero.gold}</span>
              <span class="coin-silver">🥈 ${hero.silver}</span>
            </div>
            <div class="hero-actions">
              <button class="hero-btn hero-btn-details" data-id="${hero._id}">ПОДРОБНЕЕ</button>
              <button class="hero-btn hero-btn-delete" data-id="${hero._id}">УДАЛИТЬ</button>
            </div>
          </div>
        </div>
      `;
    });

    // Empty slot card
    if (heroes.length < maxSlots) {
      html += `
        <div class="hero-card hero-card--empty" id="btn-create-hero-slot">
          <div class="hero-empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="6 4"/>
              <path d="M24 14v20M14 24h20" stroke="rgba(255,255,255,0.25)" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="hero-empty-text">Создать нового героя</p>
          <p class="hero-empty-sub">${heroes.length} из ${maxSlots} бесплатных</p>
        </div>
      `;
    }

    grid.innerHTML = html;

    // Hero selection
    grid.querySelectorAll('.hero-card:not(.hero-card--empty)').forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.hero-btn')) return;
        selectedHeroId = (card as HTMLElement).dataset.heroId!;
        setSelectedHeroId(selectedHeroId);
        grid.querySelectorAll('.hero-card').forEach(c => {
          c.classList.remove('hero-card--selected');
          c.querySelector('.hero-selected-badge')?.remove();
        });
        card.classList.add('hero-card--selected');
        const badge = document.createElement('div');
        badge.className = 'hero-selected-badge';
        badge.textContent = '✦ Выбран';
        card.prepend(badge);
        loadStats(selectedHeroId);
        loadHistory(selectedHeroId);
      });
    });

    // Empty slot click
    document.getElementById('btn-create-hero-slot')?.addEventListener('click', () => navigateTo('/create'));

    // Details
    grid.querySelectorAll('.hero-btn-details').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedHeroId = (btn as HTMLElement).dataset.id!;
        setSelectedHeroId(selectedHeroId);
        navigateTo('/inventory');
      });
    });

    // Delete
    grid.querySelectorAll('.hero-btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить героя? Это действие необратимо.')) return;
        const id = (btn as HTMLElement).dataset.id!;
        try { await api.delete(`/api/heroes/${id}`); loadHeroes(user); } catch {}
      });
    });

    // Load stats for selected hero
    if (selectedHeroId) {
      loadStats(selectedHeroId);
      loadHistory(selectedHeroId);
    }
  } catch {
    grid.innerHTML = '<p class="dash-empty">Ошибка загрузки героев</p>';
  }
}

async function loadMaps() {
  const grid = document.getElementById('maps-grid')!;
  try {
    const data = await api.get<{ maps: any[]; scenarios: any[] }>('/api/game/config');
    const maps = data.maps || [];
    const scenarios = data.scenarios || [];

    grid.innerHTML = maps.map(map => {
      const mapScenarios = scenarios.filter((s: any) => s.mapId === map.mapId);
      const difficulty = mapScenarios[0]?.difficulty;
      return `
        <div class="map-card ${map.active ? '' : 'map-card--locked'}">
          <div class="map-image" style="background-image: url('${map.bgImage || ''}')">
            ${!map.active ? '<div class="map-lock-icon">🔒</div>' : ''}
          </div>
          <div class="map-info">
            <h3 class="map-name">${map.name}</h3>
            <div class="map-meta">
              <span class="map-players">${map.maxPlayers > 1 ? `2–${map.maxPlayers} игрока` : '1 игрок'}</span>
              ${difficulty ? `<span class="map-diff map-diff--${difficulty}">${DIFF_LABELS[difficulty] || difficulty}</span>` : ''}
            </div>
            ${map.active
              ? `<button class="hero-btn hero-btn-details map-start-btn" data-map-id="${map.mapId}">НАЧАТЬ</button>`
              : '<span class="map-soon">🔒 Скоро</span>'}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.map-start-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('selected_map', (btn as HTMLElement).dataset.mapId!);
        navigateTo('/scenario');
      });
    });
  } catch {
    grid.innerHTML = '<p class="dash-empty">Ошибка загрузки карт</p>';
  }
}

async function loadActiveSessions() {
  const el = document.getElementById('active-sessions')!;
  try {
    const data = await api.get<{ sessions: any[] }>('/api/sessions/active');
    if (!data.sessions?.length) {
      el.innerHTML = '<p class="dash-empty">Нет активных игр</p>';
      return;
    }

    const statusLabels: Record<string, string> = { lobby: 'В лобби', playing: 'В процессе', paused: 'Пауза' };
    const statusColors: Record<string, string> = { lobby: '#5b8fff', playing: '#3acc60', paused: '#ff8c42' };

    el.innerHTML = data.sessions.slice(0, 3).map(s => {
      const status = s.status || 'lobby';
      const players = s.players?.length || 1;
      const timeAgo = getTimeAgo(s.updatedAt);
      return `
        <div class="session-row">
          <div class="session-info">
            <strong class="session-name">${s.scenarioId || 'Сессия'}</strong>
            <span class="session-meta">
              <span style="color:${statusColors[status] || '#9a9a9e'}">${statusLabels[status] || status}</span>
              · ${players > 1 ? `${players} игрока` : 'Одиночная'}
              · ${timeAgo}
            </span>
          </div>
          <div class="session-actions">
            <button class="dash-btn-continue" data-id="${s._id}">ПРОДОЛЖИТЬ</button>
            <button class="dash-btn-x" data-id="${s._id}" title="Удалить">✕</button>
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.dash-btn-continue').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        try {
          const d = await api.get(`/api/sessions/${id}`);
          sessionStorage.setItem('current_session', JSON.stringify(d.session));
          navigateTo(d.session.status === 'lobby' ? '/lobby' : '/game');
        } catch {}
      });
    });

    el.querySelectorAll('.dash-btn-x').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить сессию?')) return;
        try { await api.delete(`/api/sessions/${(btn as HTMLElement).dataset.id}`); loadActiveSessions(); } catch {}
      });
    });
  } catch {
    el.innerHTML = '<p class="dash-empty">Ошибка загрузки</p>';
  }
}

async function loadStats(heroId: string) {
  const section = document.getElementById('stats-section')!;
  const grid = document.getElementById('stats-grid')!;
  const scenariosEl = document.getElementById('scenarios-stats')!;
  try {
    const data = await api.get(`/api/sessions/stats?heroId=${heroId}`);
    const s = data.stats;
    if (s.total === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    const winRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-val stat-val--default">${s.total}</div><div class="stat-label">ВСЕГО ИГР</div></div>
      <div class="stat-card"><div class="stat-val stat-val--green">${s.completed}</div><div class="stat-label">ЗАВЕРШЕНО</div></div>
      <div class="stat-card"><div class="stat-val stat-val--red">${s.abandoned}</div><div class="stat-label">ПРЕРВАНО</div></div>
      <div class="stat-card"><div class="stat-val stat-val--gold">${winRate}%</div><div class="stat-label">ПРОЦЕНТ ПОБЕД</div></div>
    `;

    if (data.byScenario?.length) {
      scenariosEl.innerHTML = `
        <div class="scenarios-breakdown">
          <h4 class="scenarios-title">По сценариям</h4>
          ${data.byScenario.map((sc: any) => `
            <div class="scenario-row"><span>${sc._id}</span><span class="scenario-count">${sc.completed}/${sc.total}</span></div>
          `).join('')}
        </div>
      `;
    } else {
      scenariosEl.innerHTML = '';
    }
  } catch { section.style.display = 'none'; }
}

async function loadHistory(heroId: string) {
  const section = document.getElementById('history-section')!;
  const list = document.getElementById('history-list')!;
  try {
    const data = await api.get(`/api/sessions/history?heroId=${heroId}&limit=50`);
    if (!data.sessions?.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    const statusIcons: Record<string, string> = { completed: '✅', abandoned: '✕' };
    const statusLabels: Record<string, string> = { completed: 'Победа', abandoned: 'Прервана' };
    const statusColors: Record<string, string> = { completed: '#3acc60', abandoned: '#ff4d4d' };

    const show = data.sessions.slice(0, 3);
    list.innerHTML = show.map((s: any) => {
      const date = new Date(s.updatedAt || s.createdAt);
      const dateStr = date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      const players = s.players?.length || 1;
      const duration = getDuration(s.createdAt, s.updatedAt);
      return `
        <div class="history-row">
          <div class="history-info">
            <strong>${s.scenarioId || 'Сессия'}</strong>
            <span class="history-meta">
              <span style="color:${statusColors[s.status] || '#9a9a9e'}">${statusIcons[s.status] || ''} ${statusLabels[s.status] || s.status}</span>
              · ${players > 1 ? `${players} игрока` : 'Одиночная'}
              · ${duration}
            </span>
          </div>
          <span class="history-date">${dateStr}</span>
        </div>
      `;
    }).join('');

    const showAllBtn = document.getElementById('btn-show-all-history')!;
    if (data.sessions.length > 3) {
      showAllBtn.classList.remove('hidden');
      showAllBtn.onclick = () => {
        list.innerHTML = data.sessions.map((s: any) => {
          const date = new Date(s.updatedAt || s.createdAt);
          const dateStr = date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' ' + date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
          const players = s.players?.length || 1;
          const duration = getDuration(s.createdAt, s.updatedAt);
          return `
            <div class="history-row">
              <div class="history-info">
                <strong>${s.scenarioId || 'Сессия'}</strong>
                <span class="history-meta">
                  <span style="color:${statusColors[s.status] || '#9a9a9e'}">${statusIcons[s.status] || ''} ${statusLabels[s.status] || s.status}</span>
                  · ${players > 1 ? `${players} игрока` : 'Одиночная'}
                  · ${duration}
                </span>
              </div>
              <span class="history-date">${dateStr}</span>
            </div>
          `;
        }).join('');
        showAllBtn.classList.add('hidden');
      };
    } else {
      showAllBtn.classList.add('hidden');
    }
  } catch { section.style.display = 'none'; }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

function getDuration(start: string, end: string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}ч ${remMins}м`;
}

export { selectedHeroId };
