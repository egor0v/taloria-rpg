import { api } from '../../core/api';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import { findSelectedHero } from '../../core/heroSelection';

const DIFF_LABELS: Record<string, string> = { easy: 'ЛЁГКИЙ', medium: 'СРЕДНИЙ', hard: 'СЛОЖНЫЙ', nightmare: 'ЛЕГЕНДАРНЫЙ' };
const DIFF_COLORS: Record<string, string> = { easy: '#3acc60', medium: '#ff8c42', hard: '#ff4d4d', nightmare: '#a855f7' };

export async function renderScenario(container: HTMLElement): Promise<void> {
  clearElement(container);

  const mapId = sessionStorage.getItem('selected_map') || 'forest-road';
  const user = getCurrentUser();

  // Get selected hero (from localStorage)
  let selectedHero: any = null;
  try {
    const heroData = await api.get('/api/heroes');
    selectedHero = findSelectedHero(heroData.heroes || []);
  } catch {}

  // Get config
  let gameMap: any = null;
  let scenarios: any[] = [];
  try {
    const config = await api.get('/api/game/config');
    gameMap = (config.maps || []).find((m: any) => m.mapId === mapId);
    scenarios = (config.scenarios || []).filter((s: any) => s.mapId === mapId && s.active);
  } catch {}

  if (!gameMap) {
    container.innerHTML = `<div class="section"><p style="color:var(--red)">Карта не найдена</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="scn">
      <!-- Header -->
      <header class="scn-header">
        <div class="scn-header-left">
          <a href="/" class="scn-logo">Taloria</a>
          <span class="scn-breadcrumb">/ Выбор сценария</span>
        </div>
        <div class="scn-header-right">
          <button class="scn-back-btn" id="btn-back">НАЗАД</button>
          <span class="scn-username">${user?.displayName || ''}</span>
          <button class="scn-logout-btn" id="btn-logout-scn">Выйти</button>
        </div>
      </header>

      <!-- Map Banner -->
      <div class="scn-banner" style="background-image: url('${gameMap.bgImage || ''}')">
        <div class="scn-banner-content">
          <h1 class="scn-map-name">${gameMap.name}</h1>
          <p class="scn-map-desc">${gameMap.description || ''}</p>
        </div>
      </div>

      <!-- Scenarios -->
      <div class="scn-content">
        <h2 class="scn-section-title">Новая игра</h2>
        <div class="scn-grid">
          ${scenarios.map(s => renderScenarioCard(s)).join('')}
        </div>

        <!-- Selected hero info -->
        ${selectedHero ? `
          <div class="scn-hero-info">
            ⚔ Играет: <strong>${selectedHero.name}</strong> — ${getCls(selectedHero)}, Ур.${selectedHero.level}
          </div>
        ` : '<p class="scn-hero-info" style="color:var(--red)">Сначала создайте и выберите героя</p>'}

        <!-- Action buttons -->
        <div class="scn-actions" id="scn-actions"></div>
      </div>
    </div>
  `;

  addScenarioStyles();

  // Back
  document.getElementById('btn-back')?.addEventListener('click', () => navigateTo('/dashboard'));
  document.getElementById('btn-logout-scn')?.addEventListener('click', () => { navigateTo('/'); });

  // Scenario selection
  let selectedScenarioId: string | null = null;
  document.querySelectorAll('.scn-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedScenarioId = (card as HTMLElement).dataset.scenarioId!;
      document.querySelectorAll('.scn-card').forEach(c => c.classList.remove('scn-card--selected'));
      card.classList.add('scn-card--selected');

      // Show action buttons
      const actions = document.getElementById('scn-actions')!;
      actions.innerHTML = `
        <div class="scn-visibility-toggle">
          <label class="scn-vis-option">
            <input type="radio" name="scn-vis" value="public" checked />
            <span class="scn-vis-chip scn-vis-chip--open">🔓 Открытая</span>
          </label>
          <label class="scn-vis-option">
            <input type="radio" name="scn-vis" value="private" />
            <span class="scn-vis-chip scn-vis-chip--closed">🔒 Закрытая</span>
          </label>
          <span class="scn-vis-hint" id="scn-vis-hint">Наблюдатели могут смотреть игру</span>
        </div>
        <button class="scn-cancel-btn" id="btn-cancel-select">ОТМЕНА</button>
        <button class="scn-solo-btn" id="btn-solo">⚔ ИГРАТЬ ОДНОМУ</button>
        <button class="scn-multi-btn" id="btn-multi">👥 ИГРАТЬ С ДРУЗЬЯМИ</button>
      `;

      // Toggle hint text
      actions.querySelectorAll('input[name="scn-vis"]').forEach(r => {
        r.addEventListener('change', () => {
          const hint = document.getElementById('scn-vis-hint');
          const val = (actions.querySelector('input[name="scn-vis"]:checked') as HTMLInputElement)?.value;
          if (hint) hint.textContent = val === 'public' ? 'Наблюдатели могут смотреть игру' : 'Только приглашённые игроки';
        });
      });

      const getIsPublic = () => (actions.querySelector('input[name="scn-vis"]:checked') as HTMLInputElement)?.value === 'public';

      document.getElementById('btn-cancel-select')?.addEventListener('click', () => {
        selectedScenarioId = null;
        document.querySelectorAll('.scn-card').forEach(c => c.classList.remove('scn-card--selected'));
        actions.innerHTML = '';
      });

      document.getElementById('btn-solo')?.addEventListener('click', async () => {
        if (!selectedHero) return alert('Сначала создайте героя');
        try {
          const data = await api.post('/api/sessions', { scenarioId: selectedScenarioId, heroId: selectedHero._id, maxPlayers: 1, isPublic: getIsPublic() });
          if (!data.session) throw { error: 'Сервер не вернул сессию' };
          await api.patch(`/api/sessions/${data.session._id}/status`, { status: 'playing' });
          sessionStorage.setItem('current_session', JSON.stringify({ ...data.session, status: 'playing', scenarioName: data.session.scenarioId }));
          window.location.href = `/game/${data.session._id}`;
        } catch (err: any) {
          console.error('Solo start error:', err);
          alert(err?.error || err?.message || JSON.stringify(err) || 'Ошибка создания игры');
        }
      });

      document.getElementById('btn-multi')?.addEventListener('click', async () => {
        if (!selectedHero) return alert('Сначала создайте героя');
        try {
          const data = await api.post('/api/sessions', { scenarioId: selectedScenarioId, heroId: selectedHero._id, maxPlayers: 4, isPublic: getIsPublic() });
          sessionStorage.setItem('current_session', JSON.stringify(data.session));
          navigateTo('/lobby');
        } catch (err: any) { alert(err.error || 'Ошибка'); }
      });
    });
  });
}

function renderScenarioCard(s: any): string {
  const diff = s.difficulty || 'easy';
  const objectives = s.objectives || {};
  const rewards = s.rewards || {};
  const briefing = s.briefing || {};

  return `
    <div class="scn-card" data-scenario-id="${s.scenarioId}">
      <div class="scn-card-icon">${getDiffIcon(diff)}</div>
      <h3 class="scn-card-name">${s.name}</h3>
      <p class="scn-card-desc">${s.description || ''}</p>

      ${objectives.primary || objectives.secondary ? `
        <div class="scn-card-objectives">
          ${objectives.primary ? `<p class="scn-obj">⚔ ${objectives.primary}</p>` : ''}
          ${objectives.secondary ? `<p class="scn-obj scn-obj--bonus">★ ${objectives.secondary}</p>` : ''}
        </div>
      ` : ''}

      <div class="scn-card-meta">
        <span class="scn-diff-badge" style="border-color:${DIFF_COLORS[diff]};color:${DIFF_COLORS[diff]}">${DIFF_LABELS[diff]}</span>
        <span class="scn-meta-text">~${getEstTime(diff)}</span>
        <span class="scn-meta-text">👥 до ${s.maxPlayers || 4}</span>
      </div>

      <p class="scn-rewards">Награды: ${formatRewards(rewards)}</p>
    </div>
  `;
}

function getDiffIcon(diff: string): string {
  return { easy: '🛡', medium: '⚔️', hard: '👑', nightmare: '💀' }[diff] || '🛡';
}

function getEstTime(diff: string): string {
  return { easy: '15 мин', medium: '20 мин', hard: '40 мин', nightmare: '60 мин' }[diff] || '20 мин';
}

function formatRewards(rewards: any): string {
  const parts = [];
  if (rewards.xp) parts.push(`${rewards.xp} XP`);
  if (rewards.gold) parts.push(`${rewards.gold} золота`);
  parts.push('серебро, предметы');
  return parts.join(', ');
}

function getCls(hero: any): string {
  const names: Record<string, Record<string, string>> = {
    warrior: { male: 'Воин', female: 'Воительница' },
    mage: { male: 'Маг', female: 'Магесса' },
    priest: { male: 'Жрец', female: 'Жрица' },
    bard: { male: 'Бард', female: 'Бардесса' },
  };
  return names[hero.cls]?.[hero.gender] || hero.cls;
}

function addScenarioStyles() {
  if (document.getElementById('scn-styles')) return;
  const style = document.createElement('style');
  style.id = 'scn-styles';
  style.textContent = `
    .scn { background: var(--bg); min-height: 100vh; color: var(--text); }
    .scn-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: rgba(11,13,18,0.97); border-bottom: 1px solid var(--panel-border); }
    .scn-header-left { display: flex; align-items: center; gap: 12px; }
    .scn-logo { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: #d4a84b; text-decoration: none; letter-spacing: 0.12em; }
    .scn-breadcrumb { color: var(--text-muted); font-size: 0.82rem; }
    .scn-header-right { display: flex; align-items: center; gap: 12px; }
    .scn-back-btn { background: none; border: 1px solid rgba(255,255,255,0.15); color: var(--text-dim); padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; font-family: var(--font-body); }
    .scn-back-btn:hover { border-color: rgba(255,255,255,0.3); color: var(--text); }
    .scn-username { color: var(--gold); font-size: 0.85rem; font-weight: 500; }
    .scn-logout-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.72rem; font-family: var(--font-body); }

    .scn-banner { height: 200px; background-size: cover; background-position: center; position: relative; display: flex; align-items: flex-end; }
    .scn-banner::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(11,15,21,0.95) 0%, rgba(11,15,21,0.3) 50%, transparent 100%); }
    .scn-banner-content { position: relative; padding: 24px 32px; }
    .scn-map-name { font-family: var(--font-heading); font-size: 1.8rem; font-weight: 700; color: var(--gold); margin-bottom: 6px; }
    .scn-map-desc { color: var(--text-dim); font-size: 0.88rem; }

    .scn-content { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .scn-section-title { font-family: var(--font-heading); font-size: 1.1rem; color: var(--gold); margin-bottom: 20px; }

    .scn-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 24px; }

    .scn-card { background: rgba(16,20,30,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 20px; cursor: pointer; transition: all 0.3s; }
    .scn-card:hover { border-color: rgba(201,162,78,0.3); }
    .scn-card--selected { border-color: rgba(201,162,78,0.6); box-shadow: 0 0 20px rgba(201,162,78,0.1); }
    .scn-card-icon { font-size: 1.5rem; margin-bottom: 10px; }
    .scn-card-name { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }
    .scn-card-desc { color: var(--text-dim); font-size: 0.82rem; margin-bottom: 14px; line-height: 1.5; }

    .scn-card-objectives { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.04); border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; }
    .scn-obj { font-size: 0.78rem; color: var(--text-dim); margin-bottom: 3px; }
    .scn-obj--bonus { color: var(--gold); }

    .scn-card-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .scn-diff-badge { font-size: 0.65rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; border: 1px solid; letter-spacing: 0.04em; }
    .scn-meta-text { color: var(--text-muted); font-size: 0.75rem; }
    .scn-rewards { color: var(--text-muted); font-size: 0.75rem; }

    .scn-hero-info { text-align: center; color: var(--text-dim); font-size: 0.88rem; margin-bottom: 20px; padding: 12px; }

    .scn-actions { display: flex; justify-content: center; gap: 12px; padding: 16px 0 40px; flex-wrap: wrap; align-items: center; }
    .scn-visibility-toggle { display: flex; align-items: center; gap: 8px; width: 100%; justify-content: center; margin-bottom: 8px; }
    .scn-vis-option { cursor: pointer; }
    .scn-vis-option input { display: none; }
    .scn-vis-chip { padding: 8px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; font-family: var(--font-body); border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s; }
    .scn-vis-chip--open { color: #3acc60; }
    .scn-vis-chip--closed { color: #ff6b6b; }
    .scn-vis-option input:checked + .scn-vis-chip--open { background: rgba(58,204,96,0.15); border-color: rgba(58,204,96,0.4); }
    .scn-vis-option input:checked + .scn-vis-chip--closed { background: rgba(255,107,107,0.15); border-color: rgba(255,107,107,0.4); }
    .scn-vis-hint { font-size: 0.72rem; color: var(--text-dim); font-style: italic; }
    .scn-cancel-btn { background: none; border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); padding: 12px 28px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; font-family: var(--font-body); letter-spacing: 0.04em; }
    .scn-cancel-btn:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
    .scn-solo-btn { background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; padding: 12px 28px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700; font-family: var(--font-body); letter-spacing: 0.04em; transition: all 0.2s; }
    .scn-solo-btn:hover { box-shadow: 0 4px 15px rgba(232,200,90,0.3); }
    .scn-multi-btn { background: none; border: 2px solid rgba(201,162,78,0.4); color: var(--gold); padding: 12px 28px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700; font-family: var(--font-body); letter-spacing: 0.04em; transition: all 0.2s; }
    .scn-multi-btn:hover { border-color: rgba(201,162,78,0.7); background: rgba(201,162,78,0.05); }

    @media (max-width: 768px) { .scn-grid { grid-template-columns: 1fr; } .scn-banner { height: 150px; } }
  `;
  document.head.appendChild(style);
}
