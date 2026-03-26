/**
 * GameScreen — Complete game UI for Taloria RPG
 * v2.5 — combat, spectators, abilities
 */
import { clearElement } from '../../utils/safeRender';
import { getGameSocket } from '../../core/socket';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { apiCall } from '../../core/api';
import './GameScreen.css';

// ─── CONSTANTS ───
const CELL_SIZE_PX = 40;
const SEARCH_RANGE = 5;
const NPC_INTERACT_RANGE = 4;
const MAX_ZOOM = 2.5;
const MIN_ZOOM_FLOOR = 0.15;
const ZOOM_STEP_BTN = 0.15;
const ZOOM_STEP_WHEEL = 0.1;
const DICE_SHAKE_ITERATIONS = 40;
const DICE_ANIMATION_INTERVAL_MS = 35;
const DICE_RESULT_TIMEOUT_MS = 2500;
const POPUP_OFFSET_X = 12;
const POPUP_OFFSET_Y = -20;

const DICE_IMAGES: Record<string, string> = {
  d4: '/img/кубики/d4.png', d6: '/img/кубики/d6.png',
  d8: '/img/кубики/d8.png', d20: '/img/кубики/d20.png',
};
const OBJ_IMAGES: Record<string, string> = { chest: '/img/игровые предметы/chest.png' };
const OBJ_ICONS: Record<string, string> = { chest: '📦', trap: '⚡', rune: '🔮', questNpc: '❗' };
const RARITY_COLORS: Record<string, string> = { common: '#e8e6e0', uncommon: '#3acc60', rare: '#4d9fff', epic: '#c77dba', legendary: '#f6c86d' };

// ─── STATE ───
let gs: any = null;
let session: any = null;
let sock: any = null;
let user: any = null;
let zoom = 1;
let actionMode = 'move';
let aiEnabled = true;
let soundEnabled = true;

// NPC data store (avoids inline JSON.stringify in HTML)
const npcDataStore = new Map<string, any>();

// Track spectator state
let isSpectator = false;
let spectatorCount = 0;

export async function renderGameScreen(container: HTMLElement, urlSessionId?: string): Promise<void> {
  clearElement(container);

  user = getCurrentUser();

  // Load session: from URL param, or from sessionStorage
  if (urlSessionId) {
    try {
      const data = user
        ? await apiCall(`/api/sessions/${urlSessionId}`)
        : await fetch(`/api/sessions/${urlSessionId}/public`).then(r => r.json());
      session = data.session || data;
    } catch {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#e8e6e0"><h2>Сессия не найдена</h2><a href="/dashboard" style="color:#f6c86d">← На главную</a></div>';
      return;
    }
  } else {
    const sessionData = sessionStorage.getItem('current_session');
    if (!sessionData) { navigateTo('/dashboard'); return; }
    session = JSON.parse(sessionData);
  }

  // Determine role: player or spectator
  const isPlayer = user && session.players?.some((p: any) => p.userId?.toString() === user._id);
  isSpectator = !isPlayer;
  const isSolo = session.maxPlayers === 1;
  const isHost = session.hostUserId === user?._id;

  container.innerHTML = buildHTML(isSolo);

  // Spectator banner
  if (isSpectator) {
    const banner = document.createElement('div');
    banner.className = 'spectator-banner';
    banner.innerHTML = `👁 Вы наблюдаете за игрой${user ? ' <button class="spectator-join-btn" id="btn-request-join">Присоединиться</button>' : ''}`;
    container.querySelector('.game-screen')?.prepend(banner);
    // Hide action bar for spectators
    const actionBar = document.getElementById('action-bar');
    if (actionBar) actionBar.style.display = 'none';
  }

  // ─── SOCKET ───
  sock = getGameSocket();
  sock.off('game-state'); sock.off('game-started'); sock.off('action-result');
  sock.off('action-error'); sock.off('ai-narration'); sock.off('chat-message');
  sock.off('player-connected'); sock.off('player-disconnected'); sock.off('error'); sock.off('game-saved');

  if (isSpectator) {
    sock.emit('join-as-spectator', { sessionId: session._id, displayName: user?.displayName || 'Гость' });
  } else {
    sock.emit('join-session', { sessionId: session._id });
  }

  let briefingShown = false;
  sock.on('game-state', (data: any) => {
    if (data.gameState?.map) {
      gs = data.gameState;
      onUpdate();
      if (!briefingShown && gs.briefing?.title) { briefingShown = true; showBriefingPopup(); }
    }
  });
  sock.on('game-started', (data: any) => {
    if (data.gameState?.map) {
      gs = data.gameState;
      onUpdate();
      log('🎮 Игра началась!', 'system');
      if (!briefingShown && gs.briefing?.title) { briefingShown = true; showBriefingPopup(); }
    }
  });
  sock.on('action-result', (data: any) => {
    log(fmtAction(data));
    if (data.gameState) { gs = data.gameState; onUpdate(); }
    // Show dice roll popups for all checks
    const rolls = data.result?.diceRolls || [];
    const events = data.result?.events || [];
    // Water check — interactive (player rolls)
    for (const evt of events) {
      if (evt.type === 'water_check') { showDiceCheckPopup(evt); }
    }
    // All other dice rolls — animated display of server result
    if (rolls.length > 0) { showDiceRollSequence(rolls); }
    // Interactive damage roll — player must roll damage dice
    if (data.result?.pendingDamage) { showDamageDicePopup(data.result); }
    // Chest popup
    if (data.result?.showChestPopup) { showChestLootPopup(data.result.chestId, data.result.loot); }
    // NPC dialog popup
    if (data.result?.type === 'talk' && data.result?.npcName) { showNpcDialogPopup(data.result); }
  });
  sock.on('action-error', (data: any) => log(`❌ ${data.error || data.message || 'Ошибка'}`, 'error'));

  // ─── COMBAT EVENTS ───
  sock.on('combat-start', (data: any) => {
    log('⚔ БОЙ НАЧАЛСЯ!', 'system');
    showCombatStartPopup(data);
    if (data.turnOrder) renderTurnOrderPanel(data.turnOrder);
  });
  sock.on('combat-ended', (data: any) => {
    log(`🏁 Бой окончен: ${data.result === 'victory' ? 'Победа!' : 'Поражение...'}`, 'system');
    hideTurnOrderPanel();
    showCombatEndPopup(data);
  });
  sock.on('monster-action', (data: any) => {
    if (data.gameState) { gs = data.gameState; onUpdate(); }
    const mr = data.monsterResult || data;
    if (mr.type === 'monster_attack') {
      log(`👹 ${mr.monsterName || 'Монстр'} атакует ${mr.targetName || 'героя'}: ${mr.damage || 0} урона`, 'error');
    } else if (mr.type === 'monster_move') {
      log(`👹 ${mr.monsterName || 'Монстр'} перемещается`, 'system');
    }
    // Update turn order highlight
    if (data.nextTurn?.entityId) updateTurnOrderHighlight(data.nextTurn.entityId);
  });
  sock.on('turn-started', (data: any) => {
    if (data.gameState) { gs = data.gameState; onUpdate(); }
    const myHero = getMyHero();
    if (data.ownerId === user?._id || data.entityId === myHero?.id) {
      showYourTurnToast();
    }
    if (data.entityId) updateTurnOrderHighlight(data.entityId);
  });
  sock.on('ai-narration', (data: any) => { setNarration(data.text); log(`📜 ${data.text}`, 'narration'); });
  sock.on('chat-message', (data: any) => addChat(data.displayName, data.text, data.userId === user?._id));
  sock.on('player-connected', (data: any) => log(`👤 ${data.displayName} подключился`, 'system'));
  sock.on('player-disconnected', (data: any) => log(`👤 ${data.displayName} вышел`, 'system'));
  sock.on('marker-placed', (data: any) => {
    if (!gs.markers) gs.markers = [];
    gs.markers.push(data);
    renderMap();
    log(`📌 ${data.ownerName || 'Игрок'} поставил метку (${data.col},${data.row})`, 'system');
  });
  sock.on('marker-removed', (data: any) => {
    if (gs.markers) {
      gs.markers = gs.markers.filter((m: any) => !(m.col === data.col && m.row === data.row));
      renderMap();
    }
  });
  sock.on('error', (data: any) => log(`⚠ ${data.message}`, 'error'));
  sock.on('game-saved', () => log('💾 Сохранено', 'system'));

  // ─── SPECTATOR EVENTS ───
  sock.on('spectator-joined', (data: any) => {
    spectatorCount = data.spectatorCount || (spectatorCount + 1);
    updateSpectatorPanel();
    log(`👁 ${data.displayName || 'Гость'} наблюдает за игрой`, 'system');
  });
  sock.on('spectator-left', (data: any) => {
    spectatorCount = data.spectatorCount || Math.max(0, spectatorCount - 1);
    updateSpectatorPanel();
  });
  sock.on('spectator-count', (data: any) => {
    spectatorCount = data.count || 0;
    updateSpectatorPanel();
  });
  // Join request from spectator (shown to host)
  sock.on('join-request', (data: any) => {
    if (isHost || (isSolo && !isSpectator)) {
      showJoinRequestPopup(data);
    }
  });
  // Request join button (for spectator)
  document.getElementById('btn-request-join')?.addEventListener('click', () => {
    sock?.emit('request-join-game', { sessionId: session._id, displayName: user?.displayName });
    log('📤 Запрос на присоединение отправлен', 'system');
  });

  // ─── UI SETUP ───
  setupActions(isSolo, isHost);
  setupMenu(isSolo);
  if (!isSolo) setupChat();
  setupTabs();
  setupZoom();
  // Mobile log panel toggle
  document.getElementById('btn-toggle-log')?.addEventListener('click', () => {
    document.getElementById('right-panel')?.classList.toggle('panel-open');
  });

  log('⏳ Подключение...', 'system');
}

// ═══════════════════════════════════
// HTML BUILDER
// ═══════════════════════════════════
function buildHTML(isSolo: boolean): string {
  return `<div class="game-screen">
  <!-- Top bar -->
  <div class="game-top-bar">
    <div class="top-bar-left">
      <span class="game-mission-name">${session.scenarioName || session.scenarioId || 'Миссия'}</span>
    </div>
    <div class="game-info-center">
      <span>Раунд <strong id="round-num">0</strong></span>
      <span class="info-sep">|</span>
      <span>Режим: <span id="mode-display" class="mode-explore">Исследование</span></span>
      <span class="info-sep">|</span>
      <span>Ход: <span id="turn-name" class="game-turn-name">${user?.displayName || '—'}</span></span>
    </div>
    <div class="top-bar-right">
      <span class="info-gold">💰 <span id="gold-display">0</span></span>
      <button class="game-menu-btn" id="btn-menu">☰ МЕНЮ</button>
    </div>
  </div>

  <!-- AI narration -->
  <div class="game-narration-bar" id="narration-bar">
    <span class="narration-ai-badge">AI</span>
    <span class="narration-text" id="narration-text">Приключение начинается...</span>
  </div>

  <!-- Main -->
  <div class="game-main">
    <!-- Team panel -->
    <div class="game-team-panel" id="team-panel-wrap">
      <div class="team-title">⚔ КОМАНДА</div>
      <div id="team-panel"></div>
      <div class="spectator-section" id="spectator-section" style="display:none">
        <div class="spectator-divider">── Наблюдатели ──</div>
        <div class="spectator-count" id="spectator-count">👁 0 зрителей</div>
      </div>
    </div>

    <!-- Map -->
    <div class="game-map-area" id="map-area">
      <div class="game-zoom">
        <button class="zoom-btn" id="btn-zoom-in">+</button>
        <button class="zoom-btn" id="btn-zoom-out">−</button>
      </div>
      <div class="game-map-scroll">
        <div class="game-map" id="game-map">
          <div class="map-loading">⏳ Загрузка карты...</div>
        </div>
      </div>
    </div>

    <!-- Mobile log toggle -->
    <button class="mobile-log-toggle" id="btn-toggle-log">📋</button>

    <!-- Right: Log/Chat -->
    <div class="game-right-panel" id="right-panel">
      <div class="right-panel-tabs">
        <button class="rp-tab rp-tab--active" data-tab="log">📋 Лог</button>
        ${!isSolo ? '<button class="rp-tab" data-tab="chat">💬 Чат</button>' : ''}
      </div>
      <div class="right-panel-content">
        <div class="game-log" id="game-log" data-panel="log"></div>
        ${!isSolo ? `<div class="game-chat" id="game-chat" data-panel="chat" style="display:none">
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input-wrap">
            <input type="text" id="chat-input" class="chat-input" placeholder="Сообщение..." maxlength="300" />
            <button class="chat-send-btn" id="chat-send">➤</button>
          </div>
        </div>` : ''}
      </div>
    </div>
  </div>

  <!-- Action bar -->
  <div class="game-action-bar" id="action-bar">
    ${!isSolo ? '<button class="action-btn" id="btn-marker"><span class="action-icon">📌</span><span class="action-label">МЕТКА</span></button>' : ''}
    <button class="action-btn action-btn--active" id="btn-move"><span class="action-icon">🚶</span><span class="action-label">ДВИЖЕНИЕ</span><span class="action-badge" id="move-badge">0</span></button>
    <button class="action-btn" id="btn-attack"><span class="action-icon">⚔️</span><span class="action-label">АТАКА</span></button>
    <button class="action-btn" id="btn-ability"><span class="action-icon">✨</span><span class="action-label">НАВЫК</span></button>
    <button class="action-btn" id="btn-item"><span class="action-icon">🎒</span><span class="action-label">ПРЕДМЕТ</span></button>
    <div class="action-btn-dropdown-wrap">
      <button class="action-btn" id="btn-interact"><span class="action-icon">🤝</span><span class="action-label">ДЕЙСТВИЕ</span></button>
      <div class="action-dropdown" id="action-dropdown" style="display:none">
        <button class="action-dd-item" id="dd-search">🔍 Разведка</button>
        <button class="action-dd-item" id="dd-magic-vision" style="display:none">👁 Магическое зрение</button>
        <button class="action-dd-item" id="dd-sneak">🥷 Подкрасться</button>
        <button class="action-dd-item" id="dd-eavesdrop">👂 Подслушать</button>
        <button class="action-dd-item" id="dd-free-action">📝 Свободное действие</button>
      </div>
    </div>
    <button class="action-btn action-btn--end" id="btn-end-turn"><span class="action-icon">⏭</span><span class="action-label">КОНЕЦ ХОДА</span></button>
  </div>

  <!-- Marker popup (multiplayer only) -->
  ${!isSolo ? `<div class="game-popup-overlay" id="marker-popup" style="display:none">
    <div class="game-popup marker-popup-content">
      <span class="popup-x-close" data-close="marker-popup">✕</span>
      <h3>Установить метку</h3>
      <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:12px">Выберите тип метки и кликните на клетку карты</p>
      <div class="marker-types" id="marker-types">
        <button class="marker-type-btn marker-type-btn--active" data-marker="cross">✖</button>
        <button class="marker-type-btn" data-marker="up">⬆</button>
        <button class="marker-type-btn" data-marker="down">⬇</button>
        <button class="marker-type-btn" data-marker="left">⬅</button>
        <button class="marker-type-btn" data-marker="right">➡</button>
      </div>
      <div class="marker-visibility">
        <label style="color:var(--text-dim);font-size:0.85rem">Кто видит:</label>
        <div id="marker-vis-list" class="marker-vis-list"></div>
      </div>
    </div>
  </div>` : ''}

  <!-- Join request popup -->
  <div class="game-popup-overlay" id="join-request-popup" style="display:none">
    <div class="game-popup join-request-content">
      <span class="popup-x-close" data-close="join-request-popup">✕</span>
      <h3 id="join-request-title">👤 Запрос на вход</h3>
      <p id="join-request-text"></p>
      <div class="join-request-actions">
        <button class="dice-popup-btn" id="join-approve">✅ Пустить в игру</button>
        <button class="popup-close" id="join-spectator" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);color:var(--text);padding:10px 20px;border-radius:6px;cursor:pointer">👁 Оставить наблюдателем</button>
      </div>
    </div>
  </div>

  <!-- Turn order panel (combat) -->
  <div class="turn-order-panel" id="turn-order-panel" style="display:none"></div>

  <!-- Combat start popup -->
  <div class="game-popup-overlay" id="combat-start-popup" style="display:none">
    <div class="game-popup combat-start-content">
      <h2 class="combat-start-title">⚔ БОЙ!</h2>
      <div id="combat-start-order" class="combat-start-order"></div>
      <button class="dice-popup-btn" id="combat-start-ok" style="margin-top:16px;width:100%">В бой!</button>
    </div>
  </div>

  <!-- Combat end popup -->
  <div class="game-popup-overlay" id="combat-end-popup" style="display:none">
    <div class="game-popup combat-end-content">
      <span class="popup-x-close" data-close="combat-end-popup">✕</span>
      <h2 id="combat-end-title" class="combat-end-title"></h2>
      <div id="combat-end-rewards" class="combat-end-rewards"></div>
      <button class="dice-popup-btn" id="combat-end-ok" style="margin-top:16px;width:100%">Продолжить</button>
    </div>
  </div>

  <!-- Mission briefing popup -->
  <div class="game-popup-overlay" id="briefing-popup" style="display:none">
    <div class="game-popup briefing-popup-content">
      <span class="popup-x-close" data-close="briefing-popup">✕</span>
      <div id="briefing-body"></div>
      <button class="dice-popup-btn" id="briefing-start" style="margin-top:16px;width:100%">⚔ Начать приключение</button>
    </div>
  </div>

  <!-- NPC Dialog popup -->
  <div class="game-popup-overlay" id="npc-dialog-popup" style="display:none">
    <div class="game-popup npc-dialog-content">
      <span class="popup-x-close" data-close="npc-dialog-popup">✕</span>
      <div id="npc-dialog-header" class="npc-dialog-header"></div>
      <div id="npc-dialog-text" class="npc-dialog-text"></div>
      <div id="npc-dialog-actions" class="npc-dialog-actions"></div>
    </div>
  </div>

  <!-- Chest loot popup -->
  <div class="game-popup-overlay" id="chest-popup" style="display:none">
    <div class="game-popup chest-popup-content">
      <span class="popup-x-close" data-close="chest-popup">✕</span>
      <h3>📦 Содержимое сундука</h3>
      <div id="chest-silver" class="chest-silver"></div>
      <div id="chest-items" class="chest-items-list"></div>
      <div class="chest-popup-actions">
        <button class="dice-popup-btn" id="chest-take-all">Забрать всё</button>
      </div>
    </div>
  </div>

  <!-- Free action popup -->
  <div class="game-popup-overlay" id="free-action-popup" style="display:none">
    <div class="game-popup">
      <span class="popup-x-close" data-close="free-action-popup">✕</span>
      <h3>Свободное действие</h3>
      <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:12px">Опишите что хотите сделать. AI-мастер обработает ваше действие.</p>
      <textarea id="free-action-text" class="free-action-textarea" rows="4" placeholder="Осмотреть стену на наличие скрытого прохода..."></textarea>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
        <button class="dice-popup-btn" id="free-action-send">Выполнить</button>
      </div>
    </div>
  </div>

  <!-- Menu overlay -->
  <div class="game-menu-overlay" id="menu-overlay" style="display:none">
    <div class="game-menu-popup">
      <span class="popup-x-close" data-close="menu-overlay">✕</span>
      <h3 class="menu-title">⚙ Меню</h3>
      <div class="menu-section"><h4>Настройки</h4>
        <label class="menu-toggle"><input type="checkbox" id="toggle-sound" ${soundEnabled ? 'checked' : ''} /><span>🔊 Звук</span></label>
        <label class="menu-toggle"><input type="checkbox" id="toggle-ai" ${aiEnabled ? 'checked' : ''} /><span>🤖 AI-ведущий</span></label>
      </div>
      <div class="menu-buttons">
        ${session.maxPlayers === 1 ? '<button class="menu-btn menu-btn--warning" id="menu-restart">🔄 Начать сначала</button>' : ''}
        <button class="menu-btn menu-btn--primary" id="menu-save-exit">💾 Сохранить и выйти</button>
        <button class="menu-btn menu-btn--danger" id="menu-exit-nosave">🚪 Выйти без сохранения</button>
      </div>
    </div>
  </div>

  <!-- Ability popup -->
  <div class="game-popup-overlay" id="ability-popup" style="display:none">
    <div class="game-popup"><span class="popup-x-close" data-close="ability-popup">✕</span><h3>Выберите способность</h3><div id="ability-list" class="ability-select-list"></div></div>
  </div>

  <!-- Item popup -->
  <div class="game-popup-overlay" id="item-popup" style="display:none">
    <div class="game-popup"><span class="popup-x-close" data-close="item-popup">✕</span><h3>Использовать предмет</h3><div id="item-list" class="item-select-list"></div></div>
  </div>

  <!-- Interact popup -->
  <div class="game-popup-overlay" id="interact-popup" style="display:none">
    <div class="game-popup"><span class="popup-x-close" data-close="interact-popup">✕</span><h3>Действие</h3>
      <div class="interact-buttons">
        <button class="interact-btn" data-action="search">🔍 Разведка</button>
        <button class="interact-btn" data-action="free-action">💬 Свободное действие</button>
        <button class="interact-btn" data-action="sneak">🥷 Подкрасться</button>
        <button class="interact-btn" data-action="rest">🛌 Отдых (+15% HP)</button>
      </div>
    </div>
  </div>

  <!-- Full Inventory overlay -->
  <div class="game-inv-overlay" id="inventory-overlay" style="display:none">
    <div class="game-inv-panel">
      <div class="game-inv-header">
        <h3 class="game-inv-title">ИНВЕНТАРЬ</h3>
        <button class="game-inv-close" id="inv-overlay-close">✕</button>
      </div>
      <div class="game-inv-body" id="game-inv-body"></div>
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════
// GAME STATE UPDATE
// ═══════════════════════════════════
function onUpdate() {
  if (!gs) return;
  updateHUD();   // update actionMode BEFORE rendering highlights
  renderMap();
  renderTeam();
}

function updateHUD() {
  const el = (id: string) => document.getElementById(id);
  if (!el('round-num')) return; // Guard against unmounted DOM
  el('round-num')!.textContent = String(gs.round || 0);
  const modeEl = el('mode-display')!;
  modeEl.textContent = gs.mode === 'combat' ? 'Бой' : 'Исследование';
  modeEl.className = gs.mode === 'combat' ? 'mode-combat' : 'mode-explore';

  const myHero = getMyHero();
  const steps = myHero?.stepsRemaining ?? myHero?.moveRange ?? 0;
  el('move-badge')!.textContent = String(steps);
  el('gold-display')!.textContent = String(myHero?.silver || myHero?.gold || 0);

  // Disable action buttons based on usage (movement always allowed while steps remain)
  const actionUsed = myHero?.actionUsed || gs.actionUsed;
  const bonusUsed = myHero?.bonusActionUsed || gs.bonusActionUsed;

  el('btn-move')?.classList.toggle('action-btn--disabled', steps <= 0);
  // Main actions: attack, search (action dropdown items are main too)
  el('btn-attack')?.classList.toggle('action-btn--disabled', !!actionUsed);
  el('btn-interact')?.classList.toggle('action-btn--disabled', !!actionUsed);
  // Bonus actions: ability, item
  el('btn-ability')?.classList.toggle('action-btn--disabled', !!bonusUsed);
  el('btn-item')?.classList.toggle('action-btn--disabled', !!bonusUsed);

  // Show "no actions left" popup when all actions exhausted
  const moveExhausted = steps <= 0;
  if (moveExhausted && actionUsed && bonusUsed && !document.querySelector('.no-actions-popup')) {
    const popup = document.createElement('div');
    popup.className = 'no-actions-popup';
    popup.innerHTML = `
      <div class="no-actions-card">
        <p class="no-actions-text">У вас больше не осталось действий</p>
        <button class="dice-popup-btn" id="btn-end-turn-popup">⏭ Завершить ход</button>
      </div>
    `;
    document.querySelector('.game-map-area')?.appendChild(popup);
    document.getElementById('btn-end-turn-popup')?.addEventListener('click', () => {
      sock?.emit('action-request', { type: 'end-turn' });
      popup.remove();
    });
  }
  // Remove popup if actions restored (new turn)
  if (!moveExhausted || !actionUsed || !bonusUsed) {
    document.querySelector('.no-actions-popup')?.remove();
  }

  // Turn name
  const turnEl = el('turn-name')!;
  if (gs.turnOrder?.length && gs.mode === 'combat') {
    const cur = gs.turnOrder[gs.currentTurnIdx];
    const entity = cur?.type === 'hero'
      ? gs.heroes.find((h: any) => h.id === cur.entityId || h.entityId === cur.entityId)
      : gs.monsters.find((m: any) => m.id === cur.entityId || m.entityId === cur.entityId);
    turnEl.textContent = entity?.name || '—';
    turnEl.className = `game-turn-name ${cur?.type === 'hero' ? 'turn-hero' : 'turn-monster'}`;
  } else {
    // Explore mode — show active hero
    const activeHero = gs.heroes?.[gs.activeHeroIdx || 0];
    turnEl.textContent = activeHero?.name || myHero?.name || user?.displayName || '—';
    turnEl.className = 'game-turn-name turn-hero';
  }
}

// ═══════════════════════════════════
// MAP RENDERING
// ═══════════════════════════════════
function renderMap() {
  const mapEl = document.getElementById('game-map');
  if (!mapEl || !gs?.map) return;

  const { map, heroes, monsters, fog, terrain, bgImage, objects, npcs } = gs;
  // mapWidth/mapHeight from server, or derive from map array
  const mapHeight = gs.mapHeight || map.length;
  const mapWidth = gs.mapWidth || (map[0]?.length || 1);
  const myHero = getMyHero();

  const cellSizePx = CELL_SIZE_PX;
  const gridW = mapWidth * cellSizePx;
  const gridH = mapHeight * cellSizePx;
  let gridStyle = `grid-template-columns:repeat(${mapWidth},${cellSizePx}px);width:${gridW}px;height:${gridH}px;position:relative;`;
  let bgHtml = '';
  if (bgImage) {
    const cacheBust = bgImage + (bgImage.includes('?') ? '&' : '?') + 'v=2';
    bgHtml = `<img src="${cacheBust}" class="map-bg-img" style="position:absolute;top:0;left:0;width:${gridW}px;height:${gridH}px;pointer-events:none;z-index:0;" />`;
  }
  let html = `<div class="tactical-grid" style="${gridStyle}">${bgHtml}`;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const cell = map[y]?.[x];
      const road = terrain?.[y]?.[x];
      const fogV = fog?.[y]?.[x] ?? 2;
      const isWall = cell === 1 || cell === 'wall';
      const isObstacle = cell === 2 || cell === 'obstacle';
      const isWater = cell === 3 || cell === 'water';
      const isFire = cell === 4 || cell === 'fire';

      // Server uses row/col; row=y, col=x
      const hero = heroes?.find((h: any) => h.alive !== false && h.hp > 0 && (h.col === x && h.row === y));
      const monster = monsters?.find((m: any) => m.alive && (m.col === x && m.row === y));
      const showMonster = monster && !monster.friendly && (monster.discovered || fogV === 2);
      const friendlyNpc = !hero ? monsters?.find((n: any) => n.friendly && n.alive && n.col === x && n.row === y && (n.discovered || fogV === 2)) : null;
      const rawObj = objects?.find((o: any) => (o.col === x && o.row === y) && (o.discovered !== false) && !o.opened && !o.triggered);
      // Runes hidden until magical vision reveals them
      const obj = rawObj && rawObj.type === 'rune' && !rawObj.revealed && !gs.runesRevealed ? null : rawObj;

      let cls = 'map-cell';
      if (isWall) cls += ' cell-wall';
      else if (isFire) cls += ' cell-fire';
      else if (isWater) cls += ' cell-water';
      else if (isObstacle) cls += ' cell-obstacle';
      else cls += ' cell-floor';

      // Fog of war applies to ALL cells including walls
      if (fogV === 0) cls += ' fog-hidden';
      else if (fogV === 1) cls += ' fog-explored';

      // Highlights
      const steps = myHero?.stepsRemaining ?? myHero?.moveRange ?? 0;
      if (myHero && steps > 0 && !isWall && fogV > 0 && !hero && !showMonster) {
        const reachable = gs.reachableCells;
        if (reachable && reachable.length > 0) {
          if (reachable.some((c: any) => c.row === y && c.col === x)) {
            cls += isObstacle ? ' cell-reachable-obstacle' : ' cell-reachable';
          }
        } else {
          const dist = Math.abs(myHero.col - x) + Math.abs(myHero.row - y);
          if (dist > 0 && dist <= steps) {
            cls += isObstacle ? ' cell-reachable-obstacle' : ' cell-reachable';
          }
        }
      }
      if (myHero && actionMode === 'attack' && showMonster) {
        const dist = Math.abs(myHero.col - x) + Math.abs(myHero.row - y);
        const range = myHero.equipment?.weapon?.attackRange || myHero.equipment?.weapon?.range || 1;
        if (dist <= range) cls += ' cell-attackable';
      }
      // Interact highlight: adjacent objects (chests, runes, traps)
      if (myHero && actionMode === 'interact' && obj && fogV > 0) {
        const dist = Math.abs(myHero.col - x) + Math.abs(myHero.row - y);
        if (dist <= 1) cls += ' cell-interactable';
      }
      // Search highlight: vision range area
      if (myHero && actionMode === 'search' && !isWall) {
        const dist = Math.abs(myHero.col - x) + Math.abs(myHero.row - y);
        if (dist <= SEARCH_RANGE) cls += ' cell-searchable';
      }

      let content = '';
      if (hero) {
        const isMe = hero._ownerId === user?._id || hero.userId === user?._id;
        const portrait = `/uploads/heroes/${hero.race}-${hero.gender}-${hero.cls}.png`;
        content = `<div class="token token-hero ${isMe ? 'token-mine' : ''}" title="${hero.name} HP:${hero.hp}/${hero.maxHp}">
          <img src="${portrait}" class="token-img" alt="" onerror="this.style.display='none';this.parentElement.textContent='🧙'" />
          <span class="token-hp-bar" style="width:${Math.round(hero.hp / hero.maxHp * 100)}%"></span>
        </div>`;
      } else if (showMonster) {
        npcDataStore.set(monster.id, { id: monster.id, name: monster.name, hp: monster.hp, maxHp: monster.maxHp, type: monster.type, canTalk: monster.canTalk, friendly: false, label: monster.label || '👹', tokenImg: monster.tokenImg, hoverImg: monster.hoverImg || monster.tokenImg });
        content = `<div class="token token-monster" data-npc-id="${monster.id}" title="${monster.name}">
          ${monster.tokenImg ? `<img src="${monster.tokenImg}" class="token-img" alt="" />` : '👹'}
          <span class="token-hp-bar token-hp-monster" style="width:${Math.round(monster.hp / monster.maxHp * 100)}%"></span>
        </div>`;
      } else if (friendlyNpc) {
        npcDataStore.set(friendlyNpc.id, { id: friendlyNpc.id, name: friendlyNpc.name, hp: friendlyNpc.hp, maxHp: friendlyNpc.maxHp, type: friendlyNpc.type, canTalk: friendlyNpc.canTalk, friendly: true, label: friendlyNpc.label || '🧝', isTrader: friendlyNpc.isTrader, isQuestNpc: friendlyNpc.isQuestNpc, hoverImg: friendlyNpc.hoverImg || friendlyNpc.tokenImg });
        content = `<span class="token-object token-npc" data-npc-id="${friendlyNpc.id}" title="${friendlyNpc.name}">${friendlyNpc.label || '🧝'}</span>`;
      } else if (obj && fogV > 0) {
        const imgSrc = OBJ_IMAGES[obj.type];
        const icon = OBJ_ICONS[obj.type] || '❓';
        content = imgSrc
          ? `<span class="token-object" title="${obj.name || obj.type}"><img src="${imgSrc}" alt="" onerror="this.parentElement.textContent='${icon}'" /></span>`
          : `<span class="token-object" title="${obj.name || obj.type}">${icon}</span>`;
      }

      // Markers (multiplayer) — visible on ANY cell including walls/fog
      const marker = gs.markers?.find((m: any) => m.col === x && m.row === y && (!m.visibleTo?.length || m.visibleTo.includes(user?._id) || m.visibleTo.includes('all')));
      if (marker) {
        content += `<span class="map-marker" title="Метка от ${marker.ownerName || 'игрока'}">${marker.icon || '✖'}</span>`;
      }

      html += `<div class="${cls}" data-x="${x}" data-y="${y}">${content}</div>`;
    }
  }
  html += '</div>';
  mapEl.innerHTML = html;

  // Cell click handlers — all cells for markers, passable cells for movement
  mapEl.querySelectorAll('.map-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const cx = parseInt((cell as HTMLElement).dataset.x!);
      const cy = parseInt((cell as HTMLElement).dataset.y!);
      // In marker mode, allow clicking any cell
      if (markerPlacingMode) { onCellClick(cx, cy); return; }
      // Normal mode — only passable visible cells
      if (cell.classList.contains('cell-wall') || cell.classList.contains('fog-hidden')) return;
      onCellClick(cx, cy);
    });
  });

  // NPC hover popups
  mapEl.querySelectorAll('[data-npc-id]').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
      const npcId = (el as HTMLElement).dataset.npcId || '';
      const npcData = npcDataStore.get(npcId) || {};
      const myH = getMyHero();
      const parent = (el as HTMLElement).closest('.map-cell') as HTMLElement;
      const npcX = parseInt(parent?.dataset.x || '0');
      const npcY = parseInt(parent?.dataset.y || '0');
      const dist = myH ? Math.abs(myH.col - npcX) + Math.abs(myH.row - npcY) : 99;
      const inRange = dist <= NPC_INTERACT_RANGE;
      showNpcHover(npcData, e as MouseEvent, inRange);
    });
    el.addEventListener('mouseleave', () => {
      setTimeout(() => {
        const popup = document.getElementById('npc-hover');
        if (popup && !popup.matches(':hover')) popup.remove();
      }, 200);
    });
  });

  // Auto-scroll to hero
  if (myHero) {
    const heroCell = mapEl.querySelector(`[data-x="${myHero.col}"][data-y="${myHero.row}"]`);
    heroCell?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

function onCellClick(x: number, y: number) {
  if (!sock || !gs) return;
  const myHero = getMyHero();
  if (!myHero) return;

  // Marker placing mode
  if (markerPlacingMode) {
    markerPlacingMode = false;
    const MARKER_ICONS: Record<string, string> = { cross: '✖', up: '⬆', down: '⬇', left: '⬅', right: '➡' };
    const marker = { type: selectedMarkerType, icon: MARKER_ICONS[selectedMarkerType] || '✖', col: x, row: y, owner: user?._id, visibleTo: markerVisibleTo };
    sock.emit('place-marker', marker);
    if (!gs.markers) gs.markers = [];
    gs.markers.push(marker);
    renderMap();
    log(`📌 Метка «${marker.icon}» установлена на (${x},${y})`, 'system');
    return;
  }

  // Search mode — click anywhere triggers search
  if (actionMode === 'search') {
    sock.emit('action-request', { type: 'search' });
    actionMode = 'move';
    return;
  }

  // Click on hostile monster → attack (row=y, col=x)
  const monster = gs.monsters?.find((m: any) => m.alive && !m.friendly && m.discovered && m.col === x && m.row === y);
  if (monster && (actionMode === 'attack' || actionMode === 'move')) {
    sock.emit('action-request', { type: 'attack', targetId: monster.entityId || monster.id });
    return;
  }

  // Click on friendly NPC/monster → talk
  const friendlyNpc = gs.monsters?.find((m: any) => m.alive && m.friendly && m.col === x && m.row === y);
  if (friendlyNpc) {
    sock.emit('action-request', { type: 'talk', targetId: friendlyNpc.id });
    return;
  }

  // Click on object (chest, rune, trap) → interact automatically
  const obj = gs.objects?.find((o: any) => o.col === x && o.row === y && (o.discovered !== false) && !o.opened && !o.triggered && !o.activated);
  if (obj) {
    sock.emit('action-request', { type: 'interact', targetRow: y, targetCol: x, targetId: obj.id });
    return;
  }

  // Click on dead monster → loot
  const corpse = gs.monsters?.find((m: any) => !m.alive && !m.looted && m.col === x && m.row === y);
  if (corpse) {
    sock.emit('action-request', { type: 'loot', objectId: corpse.id });
    return;
  }

  // Move — always available while steps remain (no need to select "move" mode)
  const myH = getMyHero();
  const stepsLeft = myH?.stepsRemaining ?? myH?.moveRange ?? 0;
  if (stepsLeft > 0) {
    sock.emit('action-request', { type: 'move', x, y });
  }
}

// ═══════════════════════════════════
// TEAM PANEL
// ═══════════════════════════════════
function renderTeam() {
  const panel = document.getElementById('team-panel');
  if (!panel || !gs?.heroes) return;

  panel.innerHTML = gs.heroes.filter((h: any) => h.alive !== false && h.hp > 0).map((h: any) => {
    const hpPct = Math.round(h.hp / h.maxHp * 100);
    const mpPct = Math.round(h.mp / h.maxMp * 100);
    const portrait = `/uploads/heroes/${h.race}-${h.gender}-${h.cls}.png`;
    const isMe = h._ownerId === user?._id || h.userId === user?._id;
    const isTurn = gs.turnOrder?.[gs.currentTurnIdx]?.entityId === h.entityId;
    const statuses = (h.statusEffects || []).map((s: any) => `<span class="status-icon" title="${s.name}">${statusIcon(s.type)}</span>`).join('');

    return `<div class="team-hero-card ${isMe ? 'team-hero--mine' : ''} ${isTurn ? 'team-hero--active' : ''}">
      <div class="team-hero-portrait"><img src="${portrait}" alt="" onerror="this.style.display='none'" /></div>
      <div class="team-hero-info">
        <div class="team-hero-name">${h.name} <span class="team-hero-level">Lv${h.level}</span>${statuses}</div>
        <div class="team-bar"><div class="team-bar-track team-bar--hp"><div class="team-bar-fill" style="width:${hpPct}%"></div></div><span class="team-bar-text">${h.hp}/${h.maxHp}</span></div>
        <div class="team-bar"><div class="team-bar-track team-bar--mp"><div class="team-bar-fill" style="width:${mpPct}%"></div></div><span class="team-bar-text">${h.mp}/${h.maxMp}</span></div>
        ${isTurn ? '<div class="team-turn-indicator">◄ Ход</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function statusIcon(type: string): string {
  const m: Record<string, string> = { poison: '🤢', burn: '🔥', burning: '🔥', freeze: '❄', frozen: '❄', stunned: '⚡', stun: '⚡', shield: '🛡', arcane_shield: '🛡', inspired: '🎵', weakened: '⬇', confusion: '💫', stealth: '👻', regeneration: '💚', haste: '⚡', precision: '🎯', sleep: '💤', rooted: '🌿', bleeding: '🩸' };
  return m[type] || '⭐';
}

// ═══════════════════════════════════
// ACTION BAR
// ═══════════════════════════════════
function clearActiveBtn() { document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('action-btn--active')); }
function setAction(mode: string, btnId: string) {
  actionMode = mode;
  clearActiveBtn();
  document.getElementById(btnId)?.classList.add('action-btn--active');
  if (gs) renderMap();
}

function setupActions(isSolo: boolean, isHost: boolean) {
  // Simple mode buttons
  document.getElementById('btn-move')?.addEventListener('click', () => setAction('move', 'btn-move'));
  document.getElementById('btn-attack')?.addEventListener('click', () => setAction('attack', 'btn-attack'));
  document.getElementById('btn-ability')?.addEventListener('click', () => showAbilityPopup());
  document.getElementById('btn-item')?.addEventListener('click', () => showItemPopup());
  document.getElementById('btn-end-turn')?.addEventListener('click', () => { sock?.emit('action-request', { type: 'end-turn' }); });

  // ДЕЙСТВИЕ dropdown
  const ddWrap = document.getElementById('action-dropdown')!;
  document.getElementById('btn-interact')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = ddWrap.style.display !== 'none';
    ddWrap.style.display = visible ? 'none' : 'flex';
    // Show magic vision for mage/priest by default, or if hero has the ability
    const hero = getMyHero();
    const hasMagicVision = hero && (
      hero.cls === 'mage' || hero.cls === 'priest' ||
      [...(hero.abilities || []), ...(hero.baseAbilities || [])].some((a: any) =>
        (typeof a === 'string' ? a : a?.abilityId) === 'magic-vision' ||
        (typeof a === 'string' ? a : a?.abilityId) === 'arcane-sight'
      )
    );
    const mvBtn = document.getElementById('dd-magic-vision');
    if (mvBtn) mvBtn.style.display = hasMagicVision ? 'flex' : 'none';
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => { ddWrap.style.display = 'none'; });
  ddWrap.addEventListener('click', (e) => e.stopPropagation());

  // Разведка
  document.getElementById('dd-search')?.addEventListener('click', () => {
    ddWrap.style.display = 'none';
    setAction('search', 'btn-interact');
    // Trigger search dice roll
    showInteractiveDicePopup('d20', 'Разведка — бросьте кубик', 10, (roll) => {
      sock?.emit('action-request', { type: 'search', roll });
    });
  });

  // Магическое зрение
  document.getElementById('dd-magic-vision')?.addEventListener('click', () => {
    ddWrap.style.display = 'none';
    showInteractiveDicePopup('d20', 'Магическое зрение — бросьте кубик', 12, (roll) => {
      sock?.emit('action-request', { type: 'magic-vision', roll });
    });
  });

  // Подкрасться
  document.getElementById('dd-sneak')?.addEventListener('click', () => {
    ddWrap.style.display = 'none';
    showInteractiveDicePopup('d20', 'Скрытность — бросьте кубик', 12, (roll) => {
      sock?.emit('action-request', { type: 'sneak', roll });
    });
  });

  // Подслушать
  document.getElementById('dd-eavesdrop')?.addEventListener('click', () => {
    ddWrap.style.display = 'none';
    showInteractiveDicePopup('d20', 'Подслушивание — бросьте кубик', 10, (roll) => {
      sock?.emit('action-request', { type: 'eavesdrop', roll });
    });
  });

  // Свободное действие
  document.getElementById('dd-free-action')?.addEventListener('click', () => {
    ddWrap.style.display = 'none';
    const popup = document.getElementById('free-action-popup')!;
    popup.style.display = 'flex';
    const textarea = document.getElementById('free-action-text') as HTMLTextAreaElement;
    textarea.value = '';
    textarea.focus();
  });
  document.getElementById('free-action-cancel')?.addEventListener('click', () => {
    document.getElementById('free-action-popup')!.style.display = 'none';
  });
  document.getElementById('free-action-send')?.addEventListener('click', () => {
    const text = (document.getElementById('free-action-text') as HTMLTextAreaElement).value.trim();
    if (!text) return;
    document.getElementById('free-action-popup')!.style.display = 'none';
    sock?.emit('action-request', { type: 'free-action', text });
    log(`📝 Свободное действие: ${text}`, 'system');
  });

  // ─── MARKER (multiplayer only) ───
  setupMarker();
}

let selectedMarkerType = 'cross';
let markerPlacingMode = false;
let markerVisibleTo: string[] = []; // empty = all

function setupMarker() {
  const markerBtn = document.getElementById('btn-marker');
  if (!markerBtn) return; // solo mode — no marker

  markerBtn.addEventListener('click', () => {
    const popup = document.getElementById('marker-popup')!;
    popup.style.display = 'flex';
    // Populate visibility list from players
    const visList = document.getElementById('marker-vis-list')!;
    const players = gs?.heroes || [];
    visList.innerHTML = `<label class="marker-vis-option"><input type="checkbox" value="all" checked /> Все</label>` +
      players.map((h: any) => `<label class="marker-vis-option"><input type="checkbox" value="${h._ownerId || h.userId}" /> ${h.name}</label>`).join('');
  });

  document.getElementById('marker-cancel')?.addEventListener('click', () => {
    document.getElementById('marker-popup')!.style.display = 'none';
    markerPlacingMode = false;
  });

  // Marker type selection
  document.getElementById('marker-types')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.marker-type-btn') as HTMLElement;
    if (!btn) return;
    document.querySelectorAll('.marker-type-btn').forEach(b => b.classList.remove('marker-type-btn--active'));
    btn.classList.add('marker-type-btn--active');
    selectedMarkerType = btn.dataset.marker || 'cross';
    // Enter placing mode
    markerPlacingMode = true;
    document.getElementById('marker-popup')!.style.display = 'none';
    log(`📌 Кликните на клетку для установки метки`, 'system');
  });
}

// Ability definitions cache (loaded once from API)
let abilityDefsCache: Record<string, any> = {};
async function loadAbilityDefs() {
  if (Object.keys(abilityDefsCache).length > 0) return;
  try {
    const data = await apiCall('/api/bestiary?tab=abilities&limit=500');
    const items = data.data || data.abilities || (Array.isArray(data) ? data : []);
    items.forEach((a: any) => {
      abilityDefsCache[a.abilityId] = {
        ...a,
        name: a.name || a.abilityId,
        description: a.description || a.desc || '',
        manaCost: a.manaCost ?? a.mpCost ?? 0,
        cooldown: a.cooldown ?? a.cd ?? 0,
        range: a.range ?? 0,
      };
    });
    console.log(`Loaded ${items.length} ability defs`);
  } catch (err) {
    console.error('Failed to load abilities:', err);
  }
}

async function showAbilityPopup() {
  const popup = document.getElementById('ability-popup')!;
  const list = document.getElementById('ability-list')!;
  const hero = getMyHero();
  if (!hero) return;

  await loadAbilityDefs();

  // Hero abilities are arrays of abilityId strings
  const abilityIds = [...(hero.abilities || []), ...(hero.learnedAbilities || [])];
  const uniqueIds = [...new Set(abilityIds)];
  // Only show abilities that exist in cache AND are not passives/base abilities
  const activeAbilities = uniqueIds
    .filter(id => !id.startsWith('passive_') && !id.startsWith('base_'))
    .map(id => {
      const def = abilityDefsCache[id];
      if (def) return def;
      // Fallback: show with ID as name if not in cache
      return { abilityId: id, name: id, description: '', manaCost: 0, type: 'unknown' };
    })
    .filter(a => a.type !== 'passive');

  const cooldowns = hero.cooldowns || {};

  list.innerHTML = activeAbilities.length > 0 ? activeAbilities.map((a: any) => {
    const cd = cooldowns[a.abilityId] || 0;
    const canUse = (hero.mp || 0) >= (a.manaCost || 0) && cd <= 0;
    const cdText = a.cooldown > 0 ? `Перезарядка: ${a.cooldown} ход${a.cooldown > 1 ? 'а' : ''}` : a.usesPerGame ? `${a.usesPerGame} раз за игру` : '';

    return `
      <div class="ability-option ${canUse ? '' : 'ability-option--disabled'}" data-id="${a.abilityId}">
        <div class="ability-opt-header">
          <span class="ability-opt-name">${a.name || a.abilityId}</span>
          <span class="ability-opt-cost">${a.manaCost ? a.manaCost + ' MP' : 'Бесплатно'}</span>
        </div>
        <div class="ability-opt-desc">${a.description || ''}</div>
        <div class="ability-opt-meta">
          ${a.range ? `<span>Дальность: ${a.range}</span>` : ''}
          ${cdText ? `<span>${cdText}</span>` : ''}
          ${cd > 0 ? `<span class="ability-opt-cd">⏳ Перезарядка: ${cd}</span>` : ''}
          ${(hero.mp || 0) < (a.manaCost || 0) ? '<span class="ability-opt-no-mana">Мало маны</span>' : ''}
        </div>
      </div>
    `;
  }).join('') : '<p style="color:var(--text-dim);text-align:center;padding:16px">Нет доступных способностей</p>';

  popup.style.display = 'flex';
  list.querySelectorAll('.ability-option:not(.ability-option--disabled)').forEach(el => {
    el.addEventListener('click', () => {
      sock?.emit('action-request', { type: 'ability', abilityId: (el as HTMLElement).dataset.id });
      popup.style.display = 'none';
    });
  });
}

function showItemPopup() {
  showInventoryOverlay();
}

// ═══════════════════════════════════
// IN-GAME INVENTORY OVERLAY
// ═══════════════════════════════════
const STAT_LABELS: Record<string, string> = { attack: 'СИЛ', agility: 'ЛОВ', armor: 'ВЫН', intellect: 'ИНТ', wisdom: 'МУД', charisma: 'ХАР' };
const EQUIP_SLOT_NAMES: Record<string, string> = { weapon: 'ОРУЖИЕ', shield: 'ЩИТ', helmet: 'ШЛЕМ', cloak: 'ПЛАЩ', armor: 'БРОНЯ', pants: 'ШТАНЫ', boots: 'ОБУВЬ', gloves: 'ПРЕДМЕТ', ring: 'КОЛЬЦО', amulet: 'АМУЛЕТ' };
const RARITY_NAMES: Record<string, string> = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

function itemEmoji(type: string): string {
  const m: Record<string, string> = { weapon: '⚔️', armor: 'armor' ? '🛡️' : '🛡️', helmet: '⛑️', boots: '👢', shield: '🛡️', ring: '💍', amulet: '📿', potion: '🧪', scroll: '📜', food: '🍖', tool: '🔧', junk: '🗑️', quest: '❗' };
  return m[type] || '📦';
}

function showInventoryOverlay() {
  const overlay = document.getElementById('inventory-overlay')!;
  const body = document.getElementById('game-inv-body')!;
  const hero = getMyHero();
  if (!hero) return;

  const equipment = hero.equipment || {};
  const inventory = hero.inventory || [];
  const isCombat = gs?.mode === 'combat';

  // Calc stats
  const statKeys = ['attack', 'agility', 'armor', 'intellect', 'wisdom', 'charisma'];

  const slotRows = [['weapon', 'shield'], ['helmet', 'cloak'], ['armor', 'pants'], ['boots', 'gloves'], ['ring', 'amulet']];

  body.innerHTML = `
    <div class="ginv-layout">
      <!-- Top row: Left = portrait+stats, Right = equipment -->
      <div class="ginv-top-row">
        <!-- Left: Portrait + Stats -->
        <div class="ginv-left">
          <div class="ginv-portrait" style="background-image: url('/uploads/heroes/${hero.race}-${hero.gender}-${hero.cls}.png')"></div>
          <div class="ginv-info-block">
            <div class="ginv-hero-info">
              <div class="ginv-hero-name">${hero.name}</div>
              <div class="ginv-hero-meta">Ур.${hero.level}</div>
            </div>
            <div class="ginv-bars">
              <div class="ginv-bar"><span class="ginv-bar-label">HP</span><div class="ginv-bar-track ginv-bar--hp"><div class="ginv-bar-fill" style="width:${Math.round(hero.hp / hero.maxHp * 100)}%"></div></div><span class="ginv-bar-val">${hero.hp}/${hero.maxHp}</span></div>
              <div class="ginv-bar"><span class="ginv-bar-label">MP</span><div class="ginv-bar-track ginv-bar--mp"><div class="ginv-bar-fill" style="width:${Math.round(hero.mp / hero.maxMp * 100)}%"></div></div><span class="ginv-bar-val">${hero.mp}/${hero.maxMp}</span></div>
            </div>
            <div class="ginv-stats">
              ${statKeys.map(key => {
                const val = hero[key] || 0;
                return `<div class="ginv-stat"><span class="ginv-stat-label">${STAT_LABELS[key]}</span><span class="ginv-stat-val">${val}</span></div>`;
              }).join('')}
            </div>
            <div class="ginv-coins">
              <span>🪙 ${hero.gold || 0}</span>
              <span>🥈 ${hero.silver || 0}</span>
            </div>
          </div>
        </div>

        <!-- Right: Equipment + Preview -->
        <div class="ginv-right-top">
          <h4 class="ginv-section-title">ЭКИПИРОВКА</h4>
          <div class="ginv-equip-and-preview">
            <div class="ginv-equip-grid">
              ${slotRows.map(row => row.map(slot => {
                const item = equipment[slot];
                const rarCls = item?.rarity ? `ginv-slot--${item.rarity}` : '';
                return `<div class="ginv-equip-slot ${item?.name ? 'ginv-slot--filled' : ''} ${rarCls}" data-slot="${slot}" data-item='${item?.name ? JSON.stringify(item) : ''}'>
                  ${item?.img ? `<img src="${item.img}" class="ginv-equip-img" />` :
                    item?.name ? `<div class="ginv-equip-text">${item.name.slice(0, 8)}</div>` :
                    `<span class="ginv-slot-label">${EQUIP_SLOT_NAMES[slot]}</span>`}
                </div>`;
              }).join('')).join('')}
            </div>
            <div class="ginv-preview" id="ginv-preview">
              <p class="ginv-preview-hint">Нажмите на предмет для просмотра</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Inventory Grid -->
      <div class="ginv-bottom">
        <h4 class="ginv-section-title">ИНВЕНТАРЬ <span class="ginv-count">${inventory.length} предм.</span></h4>
        <div class="ginv-grid">
          ${inventory.map((item: any, idx: number) => {
            const rarCls = item.rarity ? `ginv-item--${item.rarity}` : '';
            return `<div class="ginv-item ${rarCls}" data-idx="${idx}" data-item='${JSON.stringify(item)}' data-source="inventory" title="${item.name || ''}">
              ${item.img ? `<img src="${item.img}" class="ginv-item-img" />` : `<span class="ginv-item-emoji">${itemEmoji(item.type)}</span>`}
              ${(item.quantity || 1) > 1 ? `<span class="ginv-item-qty">${item.quantity}</span>` : ''}
            </div>`;
          }).join('')}
          ${Array(Math.max(0, 35 - inventory.length)).fill('<div class="ginv-item ginv-item--empty"></div>').join('')}
        </div>
        ${isCombat ? '<p class="ginv-hint">В бою: экипировка стоит действие</p>' : '<p class="ginv-hint">Исследование: экипировка бесплатно</p>'}
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  // Close
  document.getElementById('inv-overlay-close')?.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', (e) => { if ((e.target as HTMLElement).id === 'inventory-overlay') overlay.style.display = 'none'; });

  // Item click → preview
  body.querySelectorAll('.ginv-item[data-item]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const item = JSON.parse((el as HTMLElement).dataset.item || '{}');
        const idx = parseInt((el as HTMLElement).dataset.idx || '0');
        showInGameItemPreview(item, 'inventory', idx);
      } catch {}
    });
  });

  // Equip slot click → preview
  body.querySelectorAll('.ginv-equip-slot[data-item]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const itemStr = (el as HTMLElement).dataset.item;
        if (itemStr) {
          const item = JSON.parse(itemStr);
          if (item.name) showInGameItemPreview(item, 'equipment', 0);
        }
      } catch {}
    });
  });
}

function showInGameItemPreview(item: any, source: string, idx: number) {
  const el = document.getElementById('ginv-preview');
  if (!el) return;

  const isUsable = item.usable || ['potion', 'scroll', 'food', 'tool'].includes(item.type);
  const canEquip = item.slot && source === 'inventory';
  const canUnequip = source === 'equipment';

  el.innerHTML = `
    <div class="ginv-preview-card">
      <div class="ginv-preview-header">
        ${item.img ? `<img src="${item.img}" class="ginv-preview-img" />` : `<span class="ginv-preview-emoji">${itemEmoji(item.type)}</span>`}
        <div>
          <div class="ginv-preview-name" style="color:${RARITY_COLORS[item.rarity] || '#e8e6e0'}">${item.name || 'Предмет'}</div>
          <div class="ginv-preview-rarity">${RARITY_NAMES[item.rarity] || ''} ${item.type || ''}</div>
        </div>
      </div>
      ${item.description ? `<p class="ginv-preview-desc">${item.description}</p>` : ''}
      ${item.damage ? `<p class="ginv-preview-stat">Урон: ${item.damage.die || item.damageDie || '?'}${item.damage.bonus ? '+' + item.damage.bonus : ''}</p>` : ''}
      ${item.range || item.attackRange ? `<p class="ginv-preview-stat">Дальность: ${item.range || item.attackRange}</p>` : ''}
      ${item.stats ? `<p class="ginv-preview-stat">${Object.entries(item.stats).map(([k, v]) => `${STAT_LABELS[k] || k}: +${v}`).join(', ')}</p>` : ''}
      ${item.weight ? `<p class="ginv-preview-stat">Вес: ${item.weight} кг</p>` : ''}
      <div class="ginv-preview-actions">
        ${isUsable && source === 'inventory' ? `<button class="ginv-action-btn ginv-action-use" data-idx="${idx}">🧪 Использовать</button>` : ''}
        ${canEquip ? `<button class="ginv-action-btn ginv-action-equip" data-idx="${idx}" data-slot="${item.slot}">⬆ Экипировать</button>` : ''}
        ${canUnequip ? `<button class="ginv-action-btn ginv-action-unequip">⬇ Снять</button>` : ''}
      </div>
    </div>
  `;

  // Use item in game
  el.querySelector('.ginv-action-use')?.addEventListener('click', () => {
    sock?.emit('action-request', { type: 'use-item', itemIndex: idx });
    document.getElementById('inventory-overlay')!.style.display = 'none';
  });

  // Equip (in explore mode — free; in combat — costs action)
  el.querySelector('.ginv-action-equip')?.addEventListener('click', () => {
    sock?.emit('action-request', { type: 'equip', itemIndex: idx, slot: item.slot });
    document.getElementById('inventory-overlay')!.style.display = 'none';
  });
}

function showInteractPopup() {
  const popup = document.getElementById('interact-popup')!;
  popup.style.display = 'flex';
  popup.querySelectorAll('.interact-btn').forEach(el => {
    el.addEventListener('click', () => {
      const act = (el as HTMLElement).dataset.action!;
      if (act === 'free-action') {
        const text = prompt('Опишите действие:');
        if (text) sock?.emit('action-request', { type: 'free-action', text });
      } else {
        sock?.emit('action-request', { type: act });
      }
      popup.style.display = 'none';
    });
  });
  document.getElementById('interact-close')?.addEventListener('click', () => { popup.style.display = 'none'; });
}

// ═══════════════════════════════════
// MENU
// ═══════════════════════════════════
function setupMenu(isSolo: boolean) {
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    document.getElementById('menu-overlay')!.style.display = 'flex';
  });

  // Global X close buttons on all popups
  document.querySelectorAll('.popup-x-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = (btn as HTMLElement).dataset.close;
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.style.display = 'none';
      }
    });
  });
  document.getElementById('toggle-sound')?.addEventListener('change', (e) => {
    soundEnabled = (e.target as HTMLInputElement).checked;
  });
  document.getElementById('toggle-ai')?.addEventListener('change', (e) => {
    aiEnabled = (e.target as HTMLInputElement).checked;
  });
  document.getElementById('menu-restart')?.addEventListener('click', async () => {
    if (!confirm('Начать сначала? Прогресс будет сброшен.')) return;
    try {
      sock?.disconnect();
      await apiCall(`/api/sessions/${session._id}`, { method: 'DELETE' });
      const hero = getMyHero();
      const res = await apiCall('/api/sessions', { method: 'POST', body: JSON.stringify({ scenarioId: session.scenarioId, heroId: hero?.heroId || hero?._id, maxPlayers: 1 }) });
      if (res.session) {
        await apiCall(`/api/sessions/${res.session._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'playing' }) });
        sessionStorage.setItem('current_session', JSON.stringify({ ...res.session, status: 'playing', scenarioName: session.scenarioName }));
        window.location.href = '/game';
      }
    } catch (e: any) { log(`❌ Ошибка рестарта: ${e.error || e.message || ''}`, 'error'); }
    document.getElementById('menu-overlay')!.style.display = 'none';
  });
  document.getElementById('menu-save-exit')?.addEventListener('click', () => {
    sock?.emit('save-game', {});
    sock?.disconnect();
    sessionStorage.removeItem('current_session');
    setTimeout(() => { window.location.href = '/dashboard'; }, 300);
  });
  document.getElementById('menu-exit-nosave')?.addEventListener('click', async () => {
    if (!confirm('Выйти? Прогресс потерян, игра прервана.')) return;
    try {
      await apiCall(`/api/sessions/${session._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'abandoned' }) });
    } catch {}
    sock?.disconnect();
    sessionStorage.removeItem('current_session');
    window.location.href = '/dashboard';
  });
}

// ═══════════════════════════════════
// CHAT
// ═══════════════════════════════════
function setupChat() {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const send = () => { if (input?.value.trim()) { sock?.emit('chat-message', { text: input.value.trim() }); input.value = ''; } };
  document.getElementById('chat-send')?.addEventListener('click', send);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

function addChat(name: string, text: string, isMe: boolean) {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'chat-msg--mine' : ''}`;
  div.innerHTML = `<span class="chat-name">${name}:</span> <span class="chat-text">${text}</span>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  const chatTab = document.querySelector('.rp-tab[data-tab="chat"]');
  if (chatTab && !chatTab.classList.contains('rp-tab--active')) chatTab.classList.add('rp-tab--new');
}

// ═══════════════════════════════════
// TABS / ZOOM
// ═══════════════════════════════════
function setupTabs() {
  document.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = (tab as HTMLElement).dataset.tab!;
      document.querySelectorAll('.rp-tab').forEach(b => b.classList.remove('rp-tab--active', 'rp-tab--new'));
      tab.classList.add('rp-tab--active');
      const logEl = document.getElementById('game-log');
      const chatEl = document.getElementById('game-chat');
      if (logEl) logEl.style.display = t === 'log' ? 'flex' : 'none';
      if (chatEl) chatEl.style.display = t === 'chat' ? 'flex' : 'none';
    });
  });
}

function getMinZoom(): number {
  const container = document.querySelector('.game-map-scroll');
  const mapEl = document.getElementById('game-map');
  if (!container || !mapEl || !gs?.map) return 0.3;
  const cellSize = 40; // --cell-size default
  const mapW = (gs.mapWidth || gs.map[0]?.length || 1) * cellSize;
  const mapH = (gs.mapHeight || gs.map.length || 1) * cellSize;
  const cW = container.clientWidth || 600;
  const cH = container.clientHeight || 400;
  // Min zoom: map fills at least the container
  return Math.max(MIN_ZOOM_FLOOR, Math.min(cW / mapW, cH / mapH));
}

function setupZoom() {
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => { zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP_BTN); applyZoom(); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => { const min = getMinZoom(); zoom = Math.max(min, zoom - ZOOM_STEP_BTN); applyZoom(); });
  // Mouse wheel zoom
  document.querySelector('.game-map-scroll')?.addEventListener('wheel', (e: Event) => {
    const we = e as WheelEvent;
    if (we.ctrlKey || we.metaKey) {
      we.preventDefault();
      const min = getMinZoom();
      zoom = we.deltaY < 0 ? Math.min(MAX_ZOOM, zoom + ZOOM_STEP_WHEEL) : Math.max(min, zoom - ZOOM_STEP_WHEEL);
      applyZoom();
    }
  }, { passive: false });
}

function applyZoom() {
  const el = document.getElementById('game-map');
  if (el) el.style.transform = `scale(${zoom})`;
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════
function getMyHero() {
  return gs?.heroes?.find((h: any) => h._ownerId === user?._id || h.userId === user?._id);
}

// ═══════════════════════════════════
// NPC HOVER POPUP
// ═══════════════════════════════════
function showNpcHover(npc: any, e: MouseEvent, inRange: boolean) {
  document.getElementById('npc-hover')?.remove();

  const typeLabels: Record<string, string> = { 'goblin-scout': 'Разведчик', 'goblin-warrior': 'Воин', 'wolf': 'Зверь', 'troll': 'Тролль', 'troll-chief': 'Босс', 'cave-spider': 'Паук', trader: 'Торговец', npc: 'NPC', 'quest-npc': 'Квестовый NPC' };
  const typeLabel = typeLabels[npc.type] || npc.type || 'NPC';
  const isFriendly = npc.friendly;

  const popup = document.createElement('div');
  popup.id = 'npc-hover';
  popup.className = 'npc-hover-popup';
  const previewImg = npc.hoverImg || npc.tokenImg;

  popup.innerHTML = `
    ${previewImg ? `<div class="npc-hover-preview"><img src="${previewImg}" alt="${npc.name}" class="npc-hover-preview-img" /></div>` : ''}
    <div class="npc-hover-header">
      <div>
        <div class="npc-hover-name ${isFriendly ? 'npc-friendly' : 'npc-hostile'}">${npc.name}</div>
        <div class="npc-hover-type">${typeLabel}</div>
      </div>
    </div>
    ${!isFriendly ? `<div class="npc-hover-hp"><span class="npc-hover-hp-label">HP</span><div class="npc-hover-hp-track"><div class="npc-hover-hp-fill" style="width:${Math.round((npc.hp/npc.maxHp)*100)}%"></div></div><span class="npc-hover-hp-val">${npc.hp}/${npc.maxHp}</span></div>` : ''}
    ${inRange ? `<div class="npc-hover-actions">
      ${npc.canTalk || isFriendly ? `<button class="npc-hover-btn npc-hover-talk" data-npc-id="${npc.id}">💬 Поговорить</button>` : ''}
      <button class="npc-hover-btn npc-hover-attack" data-npc-id="${npc.id}">⚔ Атаковать</button>
    </div>` : `<div class="npc-hover-dist">Слишком далеко (нужно ≤ ${NPC_INTERACT_RANGE} клеток)</div>`}
  `;

  // Position near mouse
  popup.style.left = (e.clientX + POPUP_OFFSET_X) + 'px';
  popup.style.top = (e.clientY + POPUP_OFFSET_Y) + 'px';
  document.body.appendChild(popup);

  // Keep popup alive on hover
  popup.addEventListener('mouseleave', () => popup.remove());

  // Button handlers
  popup.querySelector('.npc-hover-talk')?.addEventListener('click', () => {
    popup.remove();
    sock?.emit('action-request', { type: 'talk', targetId: npc.id });
  });
  popup.querySelector('.npc-hover-attack')?.addEventListener('click', () => {
    popup.remove();
    sock?.emit('action-request', { type: 'attack', targetId: npc.id });
  });
}

// ═══════════════════════════════════
// DICE ROLL SEQUENCE — server-resolved rolls shown as animation
// ═══════════════════════════════════
function showDiceRollSequence(rolls: any[]) {
  let idx = 0;
  function showNext() {
    if (idx >= rolls.length) return;
    const roll = rolls[idx++];
    showDiceResultPopup(roll, () => showNext());
  }
  showNext();
}

function showDiceResultPopup(roll: any, onDone: () => void) {
  document.querySelector('.dice-popup-overlay')?.remove();

  const diceType = roll.diceType || 'd20';
  const maxVal = parseInt(diceType.replace('d', '')) || 20;
  const finalRoll = roll.roll || 1;
  const success = roll.success !== undefined ? roll.success : true;

  const diceImg = DICE_IMAGES[diceType] || DICE_IMAGES['d20'];

  const overlay = document.createElement('div');
  overlay.className = 'dice-popup-overlay';
  overlay.innerHTML = `
    <div class="dice-popup">
      <div class="dice-popup-title">${roll.label || '🎲 Бросок'}</div>
      <p class="dice-popup-message">${roll.message || ''}</p>
      <div class="dice-popup-dice-wrap">
        <div class="dice-popup-dice" id="dice-anim-auto">
          <img src="${diceImg}" alt="${diceType}" class="dice-img" />
        </div>
        <div class="dice-popup-value" id="dice-value-auto">${diceType.toUpperCase()}</div>
      </div>
      <div class="dice-popup-result" id="dice-result-auto" style="display:none"></div>
      <button class="dice-popup-btn" id="btn-roll-auto">🎲 Бросить кубик</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const diceEl = document.getElementById('dice-anim-auto')!;
  const valueEl = document.getElementById('dice-value-auto')!;
  const resultEl = document.getElementById('dice-result-auto')!;
  const btn = document.getElementById('btn-roll-auto')!;

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    diceEl.classList.add('dice-shaking');
    let count = 0;
    const interval = setInterval(() => {
      valueEl.textContent = String(Math.floor(Math.random() * maxVal) + 1);
      count++;
      if (count > DICE_SHAKE_ITERATIONS) {
        clearInterval(interval);
        diceEl.classList.remove('dice-shaking');
        const total = finalRoll + (roll.bonus || 0);
        valueEl.textContent = String(total);
        valueEl.classList.add(success ? 'dice-value-success' : 'dice-value-fail');
        diceEl.classList.add(success ? 'dice-success' : 'dice-fail');
        // Show bonus breakdown only if there is a bonus
        if (roll.bonus) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<span class="dice-bonus-line">${finalRoll} + ${roll.bonus}</span>`;
        }
        setTimeout(() => { overlay.remove(); onDone(); }, DICE_RESULT_TIMEOUT_MS);
      }
    }, DICE_ANIMATION_INTERVAL_MS);
  });
}

// ═══════════════════════════════════
// DICE CHECK POPUP — interactive (player clicks to roll)
// ═══════════════════════════════════
function showDiceCheckPopup(evt: any) {
  // Remove any existing popup
  document.querySelector('.dice-popup-overlay')?.remove();

  const diceType = evt.diceType || 'd20';
  const dc = evt.dc || 10;
  const maxVal = parseInt(diceType.replace('d', '')) || 20;

  // Dice images from /img/кубики/
  const diceImgMap: Record<string, string> = {
    d4: '/img/кубики/d4.png',
    d6: '/img/кубики/d6.png',
    d8: '/img/кубики/d8.png',
    d20: '/img/кубики/d20.png',
  };
  const diceImg = diceImgMap[diceType] || diceImgMap['d20'];

  const overlay = document.createElement('div');
  overlay.className = 'dice-popup-overlay';
  overlay.innerHTML = `
    <div class="dice-popup">
      <div class="dice-popup-title">⚠️ Проверка!</div>
      <p class="dice-popup-message">${evt.message || 'Бросьте кубик'}</p>
      <div class="dice-popup-dice-wrap">
        <div class="dice-popup-dice" id="dice-anim">
          <img src="${diceImg}" alt="${diceType}" class="dice-img" />
        </div>
        <div class="dice-popup-value" id="dice-value">${diceType.toUpperCase()}</div>
      </div>
      <p class="dice-popup-dc">Нужно: ${diceType} ≥ ${dc}</p>
      <div class="dice-popup-result" id="dice-result" style="display:none"></div>
      <button class="dice-popup-btn" id="btn-roll-dice">🎲 Бросить кубик</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const diceEl = document.getElementById('dice-anim')!;
  const valueEl = document.getElementById('dice-value')!;
  const resultEl = document.getElementById('dice-result')!;
  const btn = document.getElementById('btn-roll-dice')!;

  btn.addEventListener('click', () => {
    btn.style.display = 'none';
    // Shake animation
    diceEl.classList.add('dice-shaking');
    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
      valueEl.textContent = String(Math.floor(Math.random() * maxVal) + 1);
      shakeCount++;
      if (shakeCount > 15) {
        clearInterval(shakeInterval);
        // Final roll
        const roll = Math.floor(Math.random() * maxVal) + 1;
        const bonus = evt.bonus || 0;
        const total = roll + bonus;
        diceEl.classList.remove('dice-shaking');
        valueEl.textContent = String(total);
        const success = total >= dc;
        valueEl.classList.add(success ? 'dice-value-success' : 'dice-value-fail');
        diceEl.classList.add(success ? 'dice-success' : 'dice-fail');
        // Show bonus breakdown only if there is a bonus
        if (bonus) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<span class="dice-bonus-line">${roll} + ${bonus}</span>`;
        }

        // Send result to server
        sock?.emit('dice-check-result', {
          sessionId: session?._id,
          entityId: evt.entityId,
          diceRoll: roll,
          checkType: evt.type,
        });

        // Auto-close after 2s
        setTimeout(() => overlay.remove(), DICE_RESULT_TIMEOUT_MS);
      }
    }, DICE_ANIMATION_INTERVAL_MS);
  });
}

function setNarration(text: string) {
  const el = document.getElementById('narration-text');
  if (el) el.textContent = text;
}

function log(text: string, type = 'normal') {
  const el = document.getElementById('game-log');
  if (!el) return;
  const p = document.createElement('p');
  p.className = `log-entry log-${type}`;
  p.textContent = text;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function fmtAction(data: any): string {
  const r = data.result || {};
  const rType = r.type || data.action?.type;
  switch (rType) {
    case 'move': return `➡ ${r.heroName || 'Герой'} → (${r.toCol ?? r.to?.x ?? '?'},${r.toRow ?? r.to?.y ?? '?'})${r.trap ? ' ⚡Ловушка! -' + r.trap.damage + 'HP' : ''}${r.encounter ? ' 👹 Встреча!' : ''}`;
    case 'attack': {
      if (r.dodged) return `🤸 ${r.targetName} уклонился!`;
      if (r.isMiss) return `❌ ${r.heroName} промах (d20=1)`;
      if (!r.hits) return `🛡 ${r.heroName}: d20=${r.d20} ≤ ${r.effectiveArmor} — отбито`;
      return `⚔ ${r.heroName} → ${r.targetName}: ${r.damage} урона${r.isCrit ? ' 💥КРИТ!' : ''} (d20=${r.d20}, ${r.damageDie}=${r.damageRoll})${!r.targetAlive ? ' ☠ УБИТ!' : ` [${r.targetHp}HP]`}${r.counterAttack ? ` ↩ Контратака: ${r.counterAttack.damage} урона` : ''}`;
    }
    case 'search': return r.success ? `🔍 Разведка: d20=${r.roll}+${r.bonus}=${r.total}, радиус ${r.radius}, найдено: ${r.discovered?.length || 0}` : `🔍 Ничего (d20=${r.roll})`;
    case 'end-turn': return `⏭ Конец хода. Раунд ${r.round}`;
    case 'rest': return `🛌 Отдых: +${r.hpRestored} HP`;
    case 'free-action': return `💬 ${r.description || r.text}`;
    case 'sneak': return r.success ? `🥷 Скрытность! (d20=${r.roll}+${r.bonus}=${r.total} ≥ ${r.dc})` : `🥷 Замечен (d20=${r.roll}+${r.bonus}=${r.total} < ${r.dc})`;
    case 'eavesdrop': return r.success ? `👂 Подслушал! ${r.info || ''}` : `👂 Ничего не услышал`;
    case 'magic-vision': return r.success ? `👁 Магическое зрение! Обнаружено: ${r.discovered || 0}` : `👁 Ничего не видно`;
    case 'use-item': return `🧪 ${r.itemName}: ${r.healing ? '+' + r.healing + ' HP' : ''}${r.manaRestored ? '+' + r.manaRestored + ' MP' : ''}`;
    case 'ability': return `✨ ${r.abilityName || 'Способность'}${r.healing ? ': +' + r.healing + ' HP' : ''}${r.damage ? ': ' + r.damage + ' урона' : ''}${r.shield ? ': щит +' + r.shield : ''} (${r.manaCost} MP)`;
    case 'talk': return `💬 ${r.heroName || 'Герой'} → ${r.npcName || 'НПС'}`;
    case 'interact': return `🤝 ${r.objectType === 'chest' ? '📦 Сундук' : r.message || r.name || 'Взаимодействие'}`;
    case 'loot': return `🎁 ${r.targetName}: ${r.loot?.length || 0} предметов`;
    case 'combat-start': return `⚔ БОЙ! Порядок: ${r.turnOrder?.map((t: any) => t.name).join(' → ')}`;
    default: return `⚡ ${r.type || data.action?.type || 'Действие'}`;
  }
}

// ═══════════════════════════════════
// MISSION BRIEFING POPUP
// ═══════════════════════════════════
function showBriefingPopup() {
  const popup = document.getElementById('briefing-popup');
  const body = document.getElementById('briefing-body');
  if (!popup || !body || !gs) return;

  const b = gs.briefing || {};
  const obj = gs.objectives || {};

  body.innerHTML = `
    <div class="briefing-header">
      <h2 class="briefing-title">${b.title || gs.scenarioName || 'Миссия'}</h2>
      ${b.subtitle ? `<p class="briefing-subtitle">${b.subtitle}</p>` : ''}
    </div>
    ${b.lore || gs.introNarration ? `<div class="briefing-lore">${b.lore || gs.introNarration}</div>` : ''}
    ${gs.scenarioDescription ? `<p class="briefing-desc">${gs.scenarioDescription}</p>` : ''}
    <div class="briefing-objectives">
      <h3 class="briefing-obj-title">🎯 Цели</h3>
      ${obj.main ? `<div class="briefing-obj briefing-obj-main">⚔ <strong>Основная:</strong> ${obj.main}</div>` : ''}
      ${obj.bonus ? `<div class="briefing-obj briefing-obj-bonus">⭐ <strong>Бонусная:</strong> ${obj.bonus}</div>` : ''}
      ${obj.secret ? `<div class="briefing-obj briefing-obj-secret">🔮 <strong>Секретная:</strong> ???</div>` : ''}
    </div>
    ${b.tips ? `<div class="briefing-tips"><h4>💡 Советы</h4><p>${b.tips}</p></div>` : ''}
  `;

  popup.style.display = 'flex';

  document.getElementById('briefing-start')?.addEventListener('click', () => {
    popup.style.display = 'none';
  });
  popup.querySelector('.popup-x-close')?.addEventListener('click', () => {
    popup.style.display = 'none';
  });
}

// ═══════════════════════════════════
// NPC DIALOG POPUP
// ═══════════════════════════════════
function showNpcDialogPopup(result: any) {
  const popup = document.getElementById('npc-dialog-popup')!;
  const header = document.getElementById('npc-dialog-header')!;
  const text = document.getElementById('npc-dialog-text')!;
  const actions = document.getElementById('npc-dialog-actions')!;

  const npcData = npcDataStore.get(result.npcId) || {};
  const previewImg = npcData.hoverImg || npcData.tokenImg;

  header.innerHTML = `
    ${previewImg ? `<img src="${previewImg}" class="npc-dialog-portrait" alt="" />` : ''}
    <div class="npc-dialog-name-wrap">
      <span class="npc-dialog-name">${result.npcName}</span>
      <span class="npc-dialog-type">${result.isTrader ? 'Торговец' : result.isQuestNpc ? 'Квестовый НПС' : 'НПС'}</span>
    </div>
  `;

  text.innerHTML = result.dialog
    ? `<p>${result.dialog}</p>`
    : `<p style="color:var(--text-dim);font-style:italic">${result.npcName} кивает вам.</p>`;

  // Built-in dialog options
  let actionsHtml = '';
  const dialogOpts = result.dialogTree || [];
  if (dialogOpts.length) {
    actionsHtml += dialogOpts.map((opt: any, i: number) =>
      `<button class="npc-dialog-option" data-dialog-idx="${i}">${opt.text || opt.label}</button>`
    ).join('');
  }
  if (result.isTrader) {
    actionsHtml += `<button class="npc-dialog-option npc-dialog-trade">🛒 Торговать</button>`;
  }
  // Custom text input for AI master
  actionsHtml += `
    <div class="npc-dialog-custom">
      <input type="text" class="npc-dialog-input" id="npc-custom-input" placeholder="Написать свой вариант..." maxlength="300" />
      <button class="npc-dialog-send" id="npc-custom-send">➤</button>
    </div>
  `;
  actions.innerHTML = actionsHtml;

  popup.style.display = 'flex';

  // Built-in dialog option click
  actions.querySelectorAll('[data-dialog-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.dialogIdx || '0');
      const opt = dialogOpts[idx];
      if (opt?.response) {
        // Show NPC's response inline
        text.innerHTML += `<p class="npc-dialog-player">🗣 ${opt.text || opt.label}</p><p>${opt.response}</p>`;
        text.scrollTop = text.scrollHeight;
      } else {
        // Send to AI master for response
        sendNpcDialogToAI(result.npcId, result.npcName, opt?.text || opt?.label || '', text);
      }
    });
  });

  // Trade button
  actions.querySelector('.npc-dialog-trade')?.addEventListener('click', () => {
    popup.style.display = 'none';
    log(`🛒 Торговля с ${result.npcName} (в разработке)`, 'system');
  });

  // Custom text send
  const customInput = document.getElementById('npc-custom-input') as HTMLInputElement;
  const customSend = document.getElementById('npc-custom-send');
  const sendCustom = () => {
    const msg = customInput?.value?.trim();
    if (!msg) return;
    customInput.value = '';
    text.innerHTML += `<p class="npc-dialog-player">🗣 ${msg}</p>`;
    text.scrollTop = text.scrollHeight;
    sendNpcDialogToAI(result.npcId, result.npcName, msg, text);
  };
  customSend?.addEventListener('click', sendCustom);
  customInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCustom(); });

  // X close
  popup.querySelector('.popup-x-close')?.addEventListener('click', () => {
    popup.style.display = 'none';
  });
}

function sendNpcDialogToAI(npcId: string, npcName: string, playerMessage: string, textEl: HTMLElement) {
  // Show loading
  const loadingP = document.createElement('p');
  loadingP.className = 'npc-dialog-loading';
  loadingP.textContent = `${npcName} думает...`;
  textEl.appendChild(loadingP);
  textEl.scrollTop = textEl.scrollHeight;

  // Send to server via socket
  sock?.emit('npc-dialog', {
    npcId,
    npcName,
    playerMessage,
    sessionId: session?._id,
  });

  // Listen for AI response (one-time)
  const handler = (data: any) => {
    loadingP.remove();
    const responseP = document.createElement('p');
    responseP.innerHTML = data.npcResponse || `${npcName}: ...`;
    textEl.appendChild(responseP);
    textEl.scrollTop = textEl.scrollHeight;
    log(`💬 ${npcName}: ${(data.npcResponse || '').slice(0, 80)}`, 'narration');
    sock?.off('npc-dialog-response', handler);
  };
  sock?.on('npc-dialog-response', handler);

  // Timeout fallback
  setTimeout(() => {
    if (loadingP.parentElement) {
      loadingP.remove();
      const fallback = document.createElement('p');
      fallback.style.color = 'var(--text-dim)';
      fallback.style.fontStyle = 'italic';
      fallback.textContent = `${npcName} молча смотрит на вас.`;
      textEl.appendChild(fallback);
      sock?.off('npc-dialog-response', handler);
    }
  }, 15000);
}

// ═══════════════════════════════════
// CHEST LOOT POPUP
// ═══════════════════════════════════
function showChestLootPopup(chestId: string, loot: any) {
  const popup = document.getElementById('chest-popup')!;
  const silverEl = document.getElementById('chest-silver')!;
  const itemsEl = document.getElementById('chest-items')!;

  const silver = loot?.silver || 0;
  const gold = loot?.gold || 0;
  const items = loot?.items || [];

  silverEl.innerHTML = (silver ? `<span>💰 ${silver} серебра</span>` : '') + (gold ? ` <span>🪙 ${gold} золота</span>` : '');

  itemsEl.innerHTML = items.length > 0 ? items.map((item: any, idx: number) => `
    <div class="chest-item" data-idx="${idx}">
      <span class="chest-item-icon">${item.img ? `<img src="${item.img}" alt="" class="chest-item-img"/>` : itemEmoji(item.type)}</span>
      <div class="chest-item-info">
        <span class="chest-item-name" style="color:${RARITY_COLORS[item.rarity] || '#e8e6e0'}">${item.name}</span>
        <span class="chest-item-desc">${item.description || item.type || ''}</span>
      </div>
      <button class="chest-item-take" data-idx="${idx}">Забрать</button>
    </div>
  `).join('') : '<p style="color:var(--text-dim);text-align:center">Пусто</p>';

  popup.style.display = 'flex';

  // Individual take buttons
  itemsEl.querySelectorAll('.chest-item-take').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.idx || '0');
      sock?.emit('action-request', { type: 'loot-chest', chestId, takeAll: false, takeIndices: [idx] });
      // Remove item from popup
      const row = btn.closest('.chest-item');
      row?.remove();
      items.splice(idx, 1);
      // Re-index remaining
      itemsEl.querySelectorAll('.chest-item').forEach((el, i) => {
        (el as HTMLElement).dataset.idx = String(i);
        const takeBtn = el.querySelector('.chest-item-take') as HTMLElement;
        if (takeBtn) takeBtn.dataset.idx = String(i);
      });
      if (items.length === 0 && !silver && !gold) popup.style.display = 'none';
      log(`📦 Предмет забран`, 'system');
    });
  });

  // Take all
  document.getElementById('chest-take-all')?.addEventListener('click', () => {
    sock?.emit('action-request', { type: 'loot-chest', chestId, takeAll: true });
    popup.style.display = 'none';
    log(`📦 Всё забрано из сундука`, 'system');
  });

  // Close
  document.getElementById('chest-close')?.addEventListener('click', () => {
    popup.style.display = 'none';
  });
}

// ═══════════════════════════════════
// SPECTATOR UI
// ═══════════════════════════════════
function updateSpectatorPanel() {
  const section = document.getElementById('spectator-section');
  const countEl = document.getElementById('spectator-count');
  if (section && spectatorCount > 0) {
    section.style.display = 'block';
    if (countEl) countEl.textContent = `👁 ${spectatorCount} ${spectatorCount === 1 ? 'зритель' : spectatorCount < 5 ? 'зрителя' : 'зрителей'}`;
  } else if (section) {
    section.style.display = 'none';
  }
}

function showJoinRequestPopup(data: any) {
  const popup = document.getElementById('join-request-popup')!;
  const textEl = document.getElementById('join-request-text')!;
  textEl.textContent = `${data.displayName || 'Игрок'} хочет присоединиться к игре!`;
  popup.style.display = 'flex';

  const approveBtn = document.getElementById('join-approve')!;
  const spectatorBtn = document.getElementById('join-spectator')!;

  const cleanup = () => { popup.style.display = 'none'; };

  approveBtn.onclick = () => {
    sock?.emit('approve-join', { sessionId: session._id, userId: data.userId, approved: true });
    log(`✅ ${data.displayName} принят в игру`, 'system');
    cleanup();
  };
  spectatorBtn.onclick = () => {
    sock?.emit('approve-join', { sessionId: session._id, userId: data.userId, approved: false });
    log(`👁 ${data.displayName} остаётся наблюдателем`, 'system');
    cleanup();
  };
  popup.querySelector('.popup-x-close')?.addEventListener('click', cleanup);
}

// ═══════════════════════════════════
// COMBAT UI
// ═══════════════════════════════════

function showCombatStartPopup(data: any) {
  const popup = document.getElementById('combat-start-popup')!;
  const orderEl = document.getElementById('combat-start-order')!;
  const turnOrder = data.turnOrder || [];

  orderEl.innerHTML = turnOrder.map((t: any) => {
    const isHero = t.type === 'hero';
    const entity = isHero
      ? gs.heroes?.find((h: any) => h.id === t.entityId)
      : gs.monsters?.find((m: any) => m.id === t.entityId);
    const name = entity?.name || t.entityId;
    return `<div class="combat-init-entry ${isHero ? 'combat-init-hero' : 'combat-init-monster'}">
      <span class="combat-init-icon">${isHero ? '🧙' : '👹'}</span>
      <span class="combat-init-name">${name}</span>
      <span class="combat-init-roll">🎲 ${t.initiative}</span>
    </div>`;
  }).join('');

  popup.style.display = 'flex';
  document.getElementById('combat-start-ok')?.addEventListener('click', () => {
    popup.style.display = 'none';
  });
}

function renderTurnOrderPanel(turnOrder: any[]) {
  const panel = document.getElementById('turn-order-panel')!;
  panel.style.display = 'flex';
  panel.innerHTML = turnOrder.map((t: any, i: number) => {
    const isHero = t.type === 'hero';
    const entity = isHero
      ? gs.heroes?.find((h: any) => h.id === t.entityId)
      : gs.monsters?.find((m: any) => m.id === t.entityId);
    const name = entity?.name || '?';
    const isCurrent = i === (gs.currentTurnIdx || 0);
    return `<div class="turn-order-entry ${isHero ? 'to-hero' : 'to-monster'} ${isCurrent ? 'to-current' : ''}" data-entity-id="${t.entityId}">
      <span class="to-icon">${isHero ? '🧙' : '👹'}</span>
      <span class="to-name">${name}</span>
    </div>`;
  }).join('');
}

function updateTurnOrderHighlight(entityId: string) {
  document.querySelectorAll('.turn-order-entry').forEach(el => {
    el.classList.toggle('to-current', (el as HTMLElement).dataset.entityId === entityId);
  });
}

function hideTurnOrderPanel() {
  const panel = document.getElementById('turn-order-panel');
  if (panel) panel.style.display = 'none';
}

function showYourTurnToast() {
  const existing = document.querySelector('.your-turn-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'your-turn-toast';
  toast.textContent = '⚔ Ваш ход!';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function showDamageDicePopup(result: any) {
  document.querySelector('.dice-popup-overlay')?.remove();

  const diceType = result.diceType || 'd6';
  const diceCount = result.diceCount || 1;
  const maxVal = parseInt(diceType.replace('d', '')) || 6;
  const isCrit = result.isCrit;
  const diceImg = DICE_IMAGES[diceType] || DICE_IMAGES['d6'];

  const overlay = document.createElement('div');
  overlay.className = 'dice-popup-overlay';
  overlay.innerHTML = `
    <div class="dice-popup">
      <div class="dice-popup-title">${isCrit ? '💥 КРИТИЧЕСКИЙ УДАР!' : '⚔ Бросок урона'}</div>
      <p class="dice-popup-message">${result.heroName} → ${result.targetName} (${result.damageDice})</p>
      <div class="dice-popup-dice-wrap">
        ${Array.from({length: diceCount}, (_, i) => `
          <div class="dice-popup-dice" id="dmg-dice-${i}">
            <img src="${diceImg}" alt="${diceType}" class="dice-img" />
          </div>
        `).join('')}
      </div>
      <div class="dice-popup-value" id="dmg-dice-value">${result.damageDice}</div>
      <button class="dice-popup-btn" id="btn-roll-damage">🎲 Бросить урон</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btn-roll-damage')!.addEventListener('click', () => {
    document.getElementById('btn-roll-damage')!.style.display = 'none';
    // Shake all dice
    for (let i = 0; i < diceCount; i++) {
      document.getElementById(`dmg-dice-${i}`)?.classList.add('dice-shaking');
    }
    const valueEl = document.getElementById('dmg-dice-value')!;
    let count = 0;
    const interval = setInterval(() => {
      const rands = Array.from({length: diceCount}, () => Math.floor(Math.random() * maxVal) + 1);
      valueEl.textContent = rands.join(' + ');
      count++;
      if (count > DICE_SHAKE_ITERATIONS) {
        clearInterval(interval);
        // Final rolls
        const finalRolls = Array.from({length: diceCount}, () => Math.floor(Math.random() * maxVal) + 1);
        const total = finalRolls.reduce((s, v) => s + v, 0);
        for (let i = 0; i < diceCount; i++) {
          document.getElementById(`dmg-dice-${i}`)?.classList.remove('dice-shaking');
          document.getElementById(`dmg-dice-${i}`)?.classList.add(isCrit ? 'dice-success' : 'dice-success');
        }
        valueEl.textContent = diceCount > 1 ? `${finalRolls.join(' + ')} = ${total}` : String(total);
        valueEl.classList.add('dice-value-success');

        // Send to server
        sock?.emit('action-request', {
          type: 'resolve-damage',
          rolls: finalRolls,
          targetId: result.targetId,
          attackBonus: result.attackBonus,
        });

        setTimeout(() => overlay.remove(), DICE_RESULT_TIMEOUT_MS);
      }
    }, DICE_ANIMATION_INTERVAL_MS);
  });
}

function showCombatEndPopup(data: any) {
  const popup = document.getElementById('combat-end-popup')!;
  const titleEl = document.getElementById('combat-end-title')!;
  const rewardsEl = document.getElementById('combat-end-rewards')!;

  const isVictory = data.result === 'victory';
  titleEl.textContent = isVictory ? '🎉 Победа!' : '💀 Поражение...';
  titleEl.style.color = isVictory ? '#3acc60' : '#ff4d4d';

  if (isVictory && data.rewards) {
    const r = data.rewards;
    rewardsEl.innerHTML = `
      <div class="combat-reward-row">💠 Опыт: <strong>+${r.xp || 0} XP</strong></div>
      <div class="combat-reward-row">🥈 Серебро: <strong>+${r.silver || 0}</strong></div>
      ${r.gold ? `<div class="combat-reward-row">🪙 Золото: <strong>+${r.gold}</strong></div>` : ''}
      ${r.items?.length ? `<div class="combat-reward-row">🎁 Предметы: ${r.items.map((i: any) => i.name).join(', ')}</div>` : ''}
    `;
  } else {
    rewardsEl.innerHTML = '<p style="color:var(--text-dim)">Герои пали в бою...</p>';
  }

  popup.style.display = 'flex';
  document.getElementById('combat-end-ok')?.addEventListener('click', () => {
    popup.style.display = 'none';
    if (!isVictory) {
      window.location.href = '/dashboard';
    }
  });
}
