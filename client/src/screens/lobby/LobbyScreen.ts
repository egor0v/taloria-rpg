import { api } from '../../core/api';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import { getGameSocket } from '../../core/socket';

export async function renderLobby(container: HTMLElement): Promise<void> {
  clearElement(container);

  const sessionData = sessionStorage.getItem('current_session');
  if (!sessionData) { navigateTo('/dashboard'); return; }
  const session = JSON.parse(sessionData);
  const user = getCurrentUser();
  const isHost = session.hostUserId === user?._id;
  const maxPlayers = session.maxPlayers || 4;

  container.innerHTML = `
    <div class="lby">
      <!-- Header -->
      <header class="lby-header">
        <div class="lby-header-left">
          <a href="/" class="lby-logo">Taloria</a>
          <span class="lby-breadcrumb">/ Лобби команды</span>
        </div>
        <div class="lby-header-right">
          <button class="lby-back-btn" id="btn-lby-back">НАЗАД</button>
          <span class="lby-username">${user?.displayName || ''}</span>
          <button class="lby-logout-btn" id="btn-lby-logout">Выйти</button>
        </div>
      </header>

      <!-- Scenario Info Banner -->
      <div class="lby-banner">
        <div class="lby-banner-img" style="background-image: url('/uploads/maps/${session.mapId || 'forest-road'}.jpg')"></div>
        <div class="lby-banner-info">
          <h2 class="lby-scenario-name">${session.scenarioId || 'Сценарий'}</h2>
          <p class="lby-scenario-desc">Описание сценария</p>
          <div class="lby-scenario-meta">
            <span class="lby-diff-badge">ЛЁГКИЙ</span>
            <span class="lby-meta-text">до ${maxPlayers} игроков</span>
          </div>
          <div class="lby-objectives">
            <p class="lby-obj-title">Цели:</p>
            <p class="lby-obj">⚔ Победить всех врагов</p>
          </div>
        </div>
      </div>

      <!-- Team -->
      <div class="lby-content">
        <h3 class="lby-team-title">КОМАНДА</h3>
        <div class="lby-team-grid" id="lby-team-grid">
          ${renderPlayerSlots(session.players || [], maxPlayers, isHost)}
        </div>

        <!-- Actions -->
        <div class="lby-actions">
          <button class="lby-leave-btn" id="btn-lby-leave">ПОКИНУТЬ</button>
          ${isHost ? '<button class="lby-start-btn" id="btn-lby-start">НАЧАТЬ ПРИКЛЮЧЕНИЕ</button>' : '<p class="lby-wait-text">Ожидание хоста...</p>'}
        </div>
      </div>

      <!-- Invite Modal -->
      <div class="lby-invite-overlay hidden" id="invite-overlay">
        <div class="lby-invite-modal">
          <h3 class="lby-invite-title">Пригласить игрока</h3>
          <div class="lby-invite-section">
            <label class="lby-invite-label">Ссылка-приглашение</label>
            <div class="lby-invite-row">
              <input type="text" class="lby-invite-input" id="invite-link" value="${window.location.origin}/join/${session.inviteCode || ''}" readonly />
              <button class="lby-copy-btn" id="btn-copy-link">КОПИРОВАТЬ</button>
            </div>
          </div>
          <div class="lby-invite-section">
            <label class="lby-invite-label">Код приглашения</label>
            <div class="lby-invite-code" id="invite-code">${session.inviteCode || '—'}</div>
          </div>
          <button class="lby-close-btn" id="btn-close-invite">ЗАКРЫТЬ</button>
        </div>
      </div>
    </div>
  `;

  addLobbyStyles();

  // Back
  document.getElementById('btn-lby-back')?.addEventListener('click', () => navigateTo('/scenario'));
  document.getElementById('btn-lby-logout')?.addEventListener('click', () => navigateTo('/'));

  // Leave
  document.getElementById('btn-lby-leave')?.addEventListener('click', async () => {
    if (!confirm('Покинуть лобби?')) return;
    try { await api.delete(`/api/sessions/${session._id}`); } catch {}
    sessionStorage.removeItem('current_session');
    navigateTo('/dashboard');
  });

  // Start
  document.getElementById('btn-lby-start')?.addEventListener('click', () => {
    const socket = getGameSocket();
    socket.emit('start-game', { sessionId: session._id });
    navigateTo('/game');
  });

  // Invite buttons
  document.querySelectorAll('.lby-invite-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('invite-overlay')?.classList.remove('hidden');
    });
  });

  document.getElementById('btn-close-invite')?.addEventListener('click', () => {
    document.getElementById('invite-overlay')?.classList.add('hidden');
  });

  document.getElementById('invite-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'invite-overlay') {
      document.getElementById('invite-overlay')?.classList.add('hidden');
    }
  });

  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    const input = document.getElementById('invite-link') as HTMLInputElement;
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('btn-copy-link')!;
      btn.textContent = '✓ СКОПИРОВАНО';
      setTimeout(() => { btn.textContent = 'КОПИРОВАТЬ'; }, 2000);
    });
  });
}

function renderPlayerSlots(players: any[], maxPlayers: number, isHost: boolean): string {
  let html = '';

  // Filled slots
  for (const p of players) {
    html += `
      <div class="lby-slot lby-slot--filled">
        <div class="lby-slot-avatar">🧙</div>
        <div class="lby-slot-info">
          <span class="lby-slot-name">${p.displayName || 'Игрок'}${p.role === 'host' ? ' (хост)' : ''}</span>
          <span class="lby-slot-role">${p.role === 'host' ? 'Организатор' : 'Игрок'}</span>
        </div>
        ${p.role === 'host' ? '<span class="lby-slot-badge lby-slot-badge--host">👑 ХОСТ</span>' : ''}
        ${p.ready ? '<span class="lby-slot-badge lby-slot-badge--ready">✓</span>' : ''}
      </div>
    `;
  }

  // Empty slots
  for (let i = players.length; i < maxPlayers; i++) {
    html += `
      <div class="lby-slot lby-slot--empty">
        <div class="lby-slot-plus">+</div>
        <button class="lby-invite-btn">ПРИГЛАСИТЬ ИГРОКА</button>
      </div>
    `;
  }

  return html;
}

function addLobbyStyles() {
  if (document.getElementById('lby-styles')) return;
  const style = document.createElement('style');
  style.id = 'lby-styles';
  style.textContent = `
    .lby { background: var(--bg); min-height: 100vh; color: var(--text); }

    .lby-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: rgba(11,13,18,0.97); border-bottom: 1px solid var(--panel-border); }
    .lby-header-left { display: flex; align-items: center; gap: 12px; }
    .lby-logo { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: #d4a84b; text-decoration: none; letter-spacing: 0.12em; }
    .lby-breadcrumb { color: var(--text-muted); font-size: 0.82rem; }
    .lby-header-right { display: flex; align-items: center; gap: 12px; }
    .lby-back-btn, .lby-logout-btn { background: none; border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; font-family: var(--font-body); transition: all 0.2s; }
    .lby-back-btn:hover, .lby-logout-btn:hover { border-color: rgba(255,255,255,0.3); color: var(--text); }
    .lby-username { color: var(--gold); font-size: 0.85rem; }

    /* Banner */
    .lby-banner { display: flex; margin: 24px auto; max-width: 1000px; border: 1px solid rgba(201,162,78,0.25); border-radius: 6px; overflow: hidden; background: rgba(16,20,30,0.7); }
    .lby-banner-img { width: 280px; min-height: 200px; background-size: cover; background-position: center; background-color: rgba(30,25,18,0.5); flex-shrink: 0; }
    .lby-banner-info { padding: 20px 24px; flex: 1; }
    .lby-scenario-name { font-family: var(--font-heading); font-size: 1.4rem; color: var(--gold); margin-bottom: 6px; }
    .lby-scenario-desc { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 12px; }
    .lby-scenario-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
    .lby-diff-badge { font-size: 0.65rem; font-weight: 700; padding: 3px 10px; border-radius: 4px; border: 1px solid #3acc60; color: #3acc60; letter-spacing: 0.04em; }
    .lby-meta-text { color: var(--text-muted); font-size: 0.78rem; }
    .lby-objectives { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.04); border-radius: 4px; padding: 10px 14px; }
    .lby-obj-title { color: var(--text-dim); font-size: 0.75rem; margin-bottom: 4px; }
    .lby-obj { font-size: 0.78rem; color: var(--text-dim); margin-bottom: 2px; }

    /* Content */
    .lby-content { max-width: 1000px; margin: 0 auto; padding: 0 24px 40px; }
    .lby-team-title { font-size: 0.75rem; font-weight: 700; color: var(--gold); letter-spacing: 0.08em; margin-bottom: 16px; }

    /* Team Grid */
    .lby-team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 32px; }

    .lby-slot { background: rgba(16,20,30,0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 16px 20px; display: flex; align-items: center; gap: 14px; min-height: 80px; transition: border-color 0.2s; }
    .lby-slot--filled { border-color: rgba(201,162,78,0.2); }
    .lby-slot--empty { justify-content: center; flex-direction: column; gap: 10px; border-style: dashed; border-color: rgba(255,255,255,0.08); }

    .lby-slot-avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(201,162,78,0.15); border: 2px solid rgba(201,162,78,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
    .lby-slot-info { flex: 1; }
    .lby-slot-name { display: block; font-size: 0.88rem; font-weight: 600; color: var(--text); }
    .lby-slot-role { font-size: 0.72rem; color: var(--text-muted); }
    .lby-slot-badge { font-size: 0.6rem; font-weight: 700; padding: 3px 8px; border-radius: 10px; }
    .lby-slot-badge--host { background: rgba(58,204,96,0.15); color: #3acc60; }
    .lby-slot-badge--ready { background: rgba(58,204,96,0.15); color: #3acc60; }

    .lby-slot-plus { font-size: 1.5rem; color: var(--text-muted); opacity: 0.4; }

    .lby-invite-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); padding: 6px 18px; border-radius: 4px; cursor: pointer; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; font-family: var(--font-body); transition: all 0.2s; }
    .lby-invite-btn:hover { border-color: rgba(201,162,78,0.3); color: var(--gold); }

    /* Actions */
    .lby-actions { display: flex; justify-content: center; gap: 12px; }
    .lby-leave-btn { background: none; border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); padding: 12px 28px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em; font-family: var(--font-body); transition: all 0.2s; }
    .lby-leave-btn:hover { border-color: rgba(255,77,77,0.3); color: var(--red); }
    .lby-start-btn { background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; padding: 12px 32px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; font-family: var(--font-body); transition: all 0.2s; }
    .lby-start-btn:hover { box-shadow: 0 4px 20px rgba(232,200,90,0.3); }
    .lby-wait-text { color: var(--text-muted); font-size: 0.85rem; }

    /* Invite Modal */
    .lby-invite-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .lby-invite-overlay.hidden { display: none; }
    .lby-invite-modal { background: linear-gradient(180deg, rgba(18,16,12,0.98), rgba(12,10,8,0.99)); border: 2px solid rgba(201,162,78,0.3); border-radius: 8px; padding: 32px; min-width: 420px; max-width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    .lby-invite-title { font-family: var(--font-heading); font-size: 1.2rem; color: var(--gold); margin-bottom: 20px; }
    .lby-invite-section { margin-bottom: 16px; }
    .lby-invite-label { font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 6px; }
    .lby-invite-row { display: flex; gap: 8px; }
    .lby-invite-input { flex: 1; padding: 10px 14px; background: rgba(0,0,0,0.4); border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text); font-size: 0.82rem; font-family: var(--font-body); }
    .lby-copy-btn { background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: 700; font-size: 0.75rem; letter-spacing: 0.04em; font-family: var(--font-body); transition: all 0.2s; white-space: nowrap; }
    .lby-copy-btn:hover { box-shadow: 0 2px 10px rgba(232,200,90,0.3); }
    .lby-invite-code { text-align: center; font-family: var(--font-heading); font-size: 1.8rem; color: var(--gold); letter-spacing: 0.15em; padding: 16px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 4px; }
    .lby-close-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; font-family: var(--font-body); margin-top: 8px; }
    .lby-close-btn:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }

    @media (max-width: 768px) {
      .lby-banner { flex-direction: column; }
      .lby-banner-img { width: 100%; height: 150px; }
      .lby-team-grid { grid-template-columns: 1fr; }
      .lby-invite-modal { min-width: auto; }
    }
  `;
  document.head.appendChild(style);
}
