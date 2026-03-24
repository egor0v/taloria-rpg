/**
 * GameScreen — Complete game UI for Taloria RPG
 * Built from game-implementation-guide.md
 */
import { clearElement } from '../../utils/safeRender';
import { getGameSocket } from '../../core/socket';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { apiCall } from '../../core/api';
import './GameScreen.css';

// ─── STATE ───
let gs: any = null;     // current gameState
let session: any = null; // current session
let sock: any = null;    // game socket
let user: any = null;    // current user
let zoom = 1;
let actionMode = 'move'; // move | attack | ability
let aiEnabled = true;
let soundEnabled = true;

export function renderGameScreen(container: HTMLElement): void {
  clearElement(container);

  const sessionData = sessionStorage.getItem('current_session');
  if (!sessionData) { navigateTo('/dashboard'); return; }
  session = JSON.parse(sessionData);
  user = getCurrentUser();
  const isSolo = session.maxPlayers === 1 || (session.players?.length || 0) <= 1;
  const isHost = session.hostUserId === user?._id;

  container.innerHTML = buildHTML(isSolo);

  // ─── SOCKET ───
  sock = getGameSocket();
  sock.off('game-state'); sock.off('game-started'); sock.off('action-result');
  sock.off('action-error'); sock.off('ai-narration'); sock.off('chat-message');
  sock.off('player-connected'); sock.off('player-disconnected'); sock.off('error'); sock.off('game-saved');

  sock.emit('join-session', { sessionId: session._id });

  sock.on('game-state', (data: any) => {
    if (data.gameState?.map) { gs = data.gameState; onUpdate(); }
  });
  sock.on('game-started', (data: any) => {
    if (data.gameState?.map) { gs = data.gameState; onUpdate(); log('🎮 Игра началась!', 'system'); }
  });
  sock.on('action-result', (data: any) => {
    log(fmtAction(data));
    if (data.gameState) { gs = data.gameState; onUpdate(); }
  });
  sock.on('action-error', (data: any) => log(`❌ ${data.message}`, 'error'));
  sock.on('ai-narration', (data: any) => { setNarration(data.text); log(`📜 ${data.text}`, 'narration'); });
  sock.on('chat-message', (data: any) => addChat(data.displayName, data.text, data.userId === user?._id));
  sock.on('player-connected', (data: any) => log(`👤 ${data.displayName} подключился`, 'system'));
  sock.on('player-disconnected', (data: any) => log(`👤 ${data.displayName} вышел`, 'system'));
  sock.on('error', (data: any) => log(`⚠ ${data.message}`, 'error'));
  sock.on('game-saved', () => log('💾 Сохранено', 'system'));

  // ─── UI SETUP ───
  setupActions(isSolo, isHost);
  setupMenu(isSolo);
  if (!isSolo) setupChat();
  setupTabs();
  setupZoom();

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
    <button class="action-btn" id="btn-search"><span class="action-icon">🔍</span><span class="action-label">РАЗВЕДКА</span></button>
    <button class="action-btn action-btn--active" id="btn-move"><span class="action-icon">🚶</span><span class="action-label">ДВИЖЕНИЕ</span><span class="action-badge" id="move-badge">0</span></button>
    <button class="action-btn" id="btn-attack"><span class="action-icon">⚔️</span><span class="action-label">АТАКА</span></button>
    <button class="action-btn" id="btn-ability"><span class="action-icon">✨</span><span class="action-label">НАВЫК</span></button>
    <button class="action-btn" id="btn-item"><span class="action-icon">🎒</span><span class="action-label">ПРЕДМЕТ</span></button>
    <button class="action-btn" id="btn-interact"><span class="action-icon">🤝</span><span class="action-label">ДЕЙСТВИЕ</span></button>
    <button class="action-btn action-btn--end" id="btn-end-turn"><span class="action-icon">⏭</span><span class="action-label">КОНЕЦ ХОДА</span></button>
  </div>

  <!-- Menu overlay -->
  <div class="game-menu-overlay" id="menu-overlay" style="display:none">
    <div class="game-menu-popup">
      <h3 class="menu-title">⚙ Меню</h3>
      <div class="menu-section"><h4>Настройки</h4>
        <label class="menu-toggle"><input type="checkbox" id="toggle-sound" ${soundEnabled ? 'checked' : ''} /><span>🔊 Звук</span></label>
        <label class="menu-toggle"><input type="checkbox" id="toggle-ai" ${aiEnabled ? 'checked' : ''} /><span>🤖 AI-ведущий</span></label>
      </div>
      <div class="menu-buttons">
        ${session.maxPlayers === 1 ? '<button class="menu-btn menu-btn--warning" id="menu-restart">🔄 Начать сначала</button>' : ''}
        <button class="menu-btn menu-btn--primary" id="menu-save-exit">💾 Сохранить и выйти</button>
        <button class="menu-btn menu-btn--danger" id="menu-exit-nosave">🚪 Выйти без сохранения</button>
        <button class="menu-btn" id="menu-close">✕ Закрыть</button>
      </div>
    </div>
  </div>

  <!-- Ability popup -->
  <div class="game-popup-overlay" id="ability-popup" style="display:none">
    <div class="game-popup"><h3>Выберите способность</h3><div id="ability-list" class="ability-select-list"></div><button class="popup-close" id="ability-close">Отмена</button></div>
  </div>

  <!-- Item popup -->
  <div class="game-popup-overlay" id="item-popup" style="display:none">
    <div class="game-popup"><h3>Использовать предмет</h3><div id="item-list" class="item-select-list"></div><button class="popup-close" id="item-close">Отмена</button></div>
  </div>

  <!-- Interact popup -->
  <div class="game-popup-overlay" id="interact-popup" style="display:none">
    <div class="game-popup"><h3>Действие</h3>
      <div class="interact-buttons">
        <button class="interact-btn" data-action="search">🔍 Разведка</button>
        <button class="interact-btn" data-action="free-action">💬 Свободное действие</button>
        <button class="interact-btn" data-action="sneak">🥷 Подкрасться</button>
        <button class="interact-btn" data-action="rest">🛌 Отдых (+15% HP)</button>
      </div>
      <button class="popup-close" id="interact-close">Отмена</button>
    </div>
  </div>
</div>`;
}

// ═══════════════════════════════════
// GAME STATE UPDATE
// ═══════════════════════════════════
function onUpdate() {
  if (!gs) return;
  renderMap();
  renderTeam();
  updateHUD();
}

function updateHUD() {
  const el = (id: string) => document.getElementById(id);
  el('round-num')!.textContent = String(gs.round || 0);
  const modeEl = el('mode-display')!;
  modeEl.textContent = gs.mode === 'combat' ? 'Бой' : 'Исследование';
  modeEl.className = gs.mode === 'combat' ? 'mode-combat' : 'mode-explore';

  const myHero = getMyHero();
  el('move-badge')!.textContent = String(myHero?.stepsRemaining || 0);
  el('gold-display')!.textContent = String(myHero?.silver || 0);

  // Turn name
  const turnEl = el('turn-name')!;
  if (gs.turnOrder?.length) {
    const cur = gs.turnOrder[gs.currentTurnIdx];
    const entity = cur?.type === 'hero'
      ? gs.heroes.find((h: any) => h.entityId === cur.entityId)
      : gs.monsters.find((m: any) => m.entityId === cur.entityId);
    turnEl.textContent = entity?.name || '—';
    turnEl.className = `game-turn-name ${cur?.type === 'hero' ? 'turn-hero' : 'turn-monster'}`;
  } else {
    turnEl.textContent = myHero?.name || user?.displayName || '—';
  }
}

// ═══════════════════════════════════
// MAP RENDERING
// ═══════════════════════════════════
function renderMap() {
  const mapEl = document.getElementById('game-map');
  if (!mapEl || !gs?.map) return;

  const { map, heroes, monsters, fog, mapWidth, mapHeight, terrain, bgImage, objects, npcs } = gs;
  const myHero = getMyHero();

  let html = `<div class="tactical-grid" style="grid-template-columns:repeat(${mapWidth},var(--cell-size,40px));${bgImage ? `background-image:url(${bgImage});background-size:cover;` : ''}">`;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const cell = map[y]?.[x];
      const road = terrain?.[y]?.[x];
      const fogV = fog?.[y]?.[x] ?? 2;
      const isWall = cell === 0 || cell === 'wall';
      const isWater = cell === 3 || cell === 'water';
      const isRoad = cell === 1 || road === 1 || road === 'road';
      const isOffroad = cell === 2 || road === 2 || road === 'offroad';

      const hero = heroes?.find((h: any) => h.alive && h.x === x && h.y === y);
      const monster = monsters?.find((m: any) => m.alive && m.x === x && m.y === y);
      const showMonster = monster && (monster.discovered || fogV === 2);
      const obj = objects?.find((o: any) => o.x === x && o.y === y && o.discovered && !o.opened && !o.triggered);
      const npc = npcs?.find((n: any) => n.x === x && n.y === y);

      let cls = 'map-cell';
      if (isWall) cls += ' cell-wall';
      else if (isWater) cls += ' cell-water';
      else if (isRoad) cls += ' cell-road';
      else if (isOffroad) cls += ' cell-offroad';
      else cls += ' cell-floor';

      if (fogV === 0) cls += ' fog-hidden';
      else if (fogV === 1) cls += ' fog-explored';

      // Highlights
      if (myHero && actionMode === 'move' && !isWall && fogV > 0) {
        const dist = Math.abs(myHero.x - x) + Math.abs(myHero.y - y);
        if (dist > 0 && dist <= (myHero.stepsRemaining || 0) && !hero && !showMonster) cls += ' cell-reachable';
      }
      if (myHero && actionMode === 'attack' && showMonster) {
        const dist = Math.abs(myHero.x - x) + Math.abs(myHero.y - y);
        const range = myHero.equipment?.weapon?.range || 1;
        if (dist <= range) cls += ' cell-attackable';
      }

      let content = '';
      if (hero) {
        const isMe = hero.userId === user?._id;
        const portrait = `/uploads/heroes/${hero.race}-${hero.gender}-${hero.cls}.png`;
        content = `<div class="token token-hero ${isMe ? 'token-mine' : ''}" title="${hero.name} HP:${hero.hp}/${hero.maxHp}">
          <img src="${portrait}" class="token-img" alt="" onerror="this.style.display='none';this.parentElement.textContent='🧙'" />
          <span class="token-hp-bar" style="width:${Math.round(hero.hp / hero.maxHp * 100)}%"></span>
        </div>`;
      } else if (showMonster) {
        content = `<div class="token token-monster" title="${monster.name} HP:${monster.hp}/${monster.maxHp}">
          ${monster.tokenImg ? `<img src="${monster.tokenImg}" class="token-img" alt="" />` : '👹'}
          <span class="token-hp-bar token-hp-monster" style="width:${Math.round(monster.hp / monster.maxHp * 100)}%"></span>
        </div>`;
      } else if (obj && fogV >= 2) {
        const icons: Record<string, string> = { chest: '📦', trap: '⚡', rune: '🔮', questNpc: '❗' };
        content = `<span class="token-object" title="${obj.name || obj.type}">${icons[obj.type] || '❓'}</span>`;
      } else if (npc && fogV >= 2) {
        content = `<span class="token-object" title="${npc.name}">🧝</span>`;
      }

      html += `<div class="${cls}" data-x="${x}" data-y="${y}">${content}</div>`;
    }
  }
  html += '</div>';
  mapEl.innerHTML = html;

  // Cell click handlers
  mapEl.querySelectorAll('.map-cell:not(.cell-wall):not(.fog-hidden)').forEach(cell => {
    cell.addEventListener('click', () => {
      const cx = parseInt((cell as HTMLElement).dataset.x!);
      const cy = parseInt((cell as HTMLElement).dataset.y!);
      onCellClick(cx, cy);
    });
  });

  // Auto-scroll to hero
  if (myHero) {
    const heroCell = mapEl.querySelector(`[data-x="${myHero.x}"][data-y="${myHero.y}"]`);
    heroCell?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

function onCellClick(x: number, y: number) {
  if (!sock || !gs) return;
  const myHero = getMyHero();
  if (!myHero) return;

  // Click on monster → attack
  const monster = gs.monsters?.find((m: any) => m.alive && m.discovered && m.x === x && m.y === y);
  if (monster && (actionMode === 'attack' || actionMode === 'move')) {
    sock.emit('action-request', { type: 'attack', targetId: monster.entityId || monster.id });
    return;
  }

  // Click on object → interact
  const obj = gs.objects?.find((o: any) => o.x === x && o.y === y && o.discovered && !o.opened && !o.triggered);
  if (obj) {
    sock.emit('action-request', { type: 'interact', targetId: obj.id });
    return;
  }

  // Click on NPC → interact
  const npc = gs.npcs?.find((n: any) => n.x === x && n.y === y);
  if (npc) {
    sock.emit('action-request', { type: 'interact', targetId: npc.id });
    return;
  }

  // Click on dead monster → loot
  const corpse = gs.monsters?.find((m: any) => !m.alive && !m.looted && m.x === x && m.y === y);
  if (corpse) {
    sock.emit('action-request', { type: 'loot', objectId: corpse.id });
    return;
  }

  // Move
  if (actionMode === 'move') {
    sock.emit('action-request', { type: 'move', x, y });
  }
}

// ═══════════════════════════════════
// TEAM PANEL
// ═══════════════════════════════════
function renderTeam() {
  const panel = document.getElementById('team-panel');
  if (!panel || !gs?.heroes) return;

  panel.innerHTML = gs.heroes.filter((h: any) => h.alive).map((h: any) => {
    const hpPct = Math.round(h.hp / h.maxHp * 100);
    const mpPct = Math.round(h.mp / h.maxMp * 100);
    const portrait = `/uploads/heroes/${h.race}-${h.gender}-${h.cls}.png`;
    const isMe = h.userId === user?._id;
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
function setupActions(isSolo: boolean, isHost: boolean) {
  const btns = ['search', 'move', 'attack', 'ability', 'item', 'interact'];
  btns.forEach(id => {
    document.getElementById(`btn-${id}`)?.addEventListener('click', () => {
      if (id === 'ability') { showAbilityPopup(); return; }
      if (id === 'item') { showItemPopup(); return; }
      if (id === 'interact') { showInteractPopup(); return; }
      if (id === 'search') { sock?.emit('action-request', { type: 'search' }); return; }
      actionMode = id;
      document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('action-btn--active'));
      document.getElementById(`btn-${id}`)?.classList.add('action-btn--active');
      if (gs) renderMap(); // re-render highlights
    });
  });
  document.getElementById('btn-end-turn')?.addEventListener('click', () => {
    sock?.emit('action-request', { type: 'end-turn' });
  });
}

function showAbilityPopup() {
  const popup = document.getElementById('ability-popup')!;
  const list = document.getElementById('ability-list')!;
  const hero = getMyHero();
  if (!hero) return;

  const all = [...(hero.abilities || []), ...(hero.baseAbilities || [])];
  list.innerHTML = all.map((a: any) => `
    <div class="ability-option" data-id="${a.abilityId}">
      <div class="ability-opt-name">${a.name}</div>
      <div class="ability-opt-desc">${a.description || ''}</div>
      <div class="ability-opt-cost">${a.manaCost ? a.manaCost + ' MP' : 'Бесплатно'}</div>
    </div>
  `).join('') || '<p style="color:var(--text-dim)">Нет способностей</p>';

  popup.style.display = 'flex';
  list.querySelectorAll('.ability-option').forEach(el => {
    el.addEventListener('click', () => {
      sock?.emit('action-request', { type: 'ability', abilityId: (el as HTMLElement).dataset.id });
      popup.style.display = 'none';
    });
  });
  document.getElementById('ability-close')?.addEventListener('click', () => { popup.style.display = 'none'; });
}

function showItemPopup() {
  const popup = document.getElementById('item-popup')!;
  const list = document.getElementById('item-list')!;
  const hero = getMyHero();
  if (!hero) return;

  const usable = (hero.inventory || []).filter((i: any) => i.usable || ['potion', 'scroll', 'food', 'tool'].includes(i.type));
  list.innerHTML = usable.map((item: any, idx: number) => `
    <div class="item-option" data-idx="${idx}">
      <span>${item.img ? `<img src="${item.img}" class="item-opt-img" />` : '📦'}</span>
      <div class="item-opt-info">
        <div class="item-opt-name">${item.name}</div>
        <div class="ability-opt-desc">${item.description || ''}</div>
      </div>
      ${(item.quantity || 1) > 1 ? `<span class="item-opt-qty">x${item.quantity}</span>` : ''}
    </div>
  `).join('') || '<p style="color:var(--text-dim)">Нет предметов</p>';

  popup.style.display = 'flex';
  list.querySelectorAll('.item-option').forEach(el => {
    el.addEventListener('click', () => {
      const invIdx = (hero.inventory || []).findIndex((i: any) => i.usable || ['potion', 'scroll', 'food', 'tool'].includes(i.type));
      sock?.emit('action-request', { type: 'use-item', itemIndex: parseInt((el as HTMLElement).dataset.idx!) });
      popup.style.display = 'none';
    });
  });
  document.getElementById('item-close')?.addEventListener('click', () => { popup.style.display = 'none'; });
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
  document.getElementById('menu-close')?.addEventListener('click', () => {
    document.getElementById('menu-overlay')!.style.display = 'none';
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
      await apiCall(`/api/sessions/${session._id}`, { method: 'DELETE' });
      const hero = getMyHero();
      const res = await apiCall('/api/sessions', { method: 'POST', body: JSON.stringify({ scenarioId: session.scenarioId, heroId: hero?.id, maxPlayers: 1 }) });
      if (res.session) {
        await apiCall(`/api/sessions/${res.session._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'playing' }) });
        sessionStorage.setItem('current_session', JSON.stringify({ ...res.session, status: 'playing', scenarioName: session.scenarioName }));
        const container = document.querySelector('.game-screen')?.parentElement;
        if (container) renderGameScreen(container as HTMLElement);
      }
    } catch { log('❌ Ошибка рестарта', 'error'); }
    document.getElementById('menu-overlay')!.style.display = 'none';
  });
  document.getElementById('menu-save-exit')?.addEventListener('click', () => {
    sock?.emit('save-game', {});
    setTimeout(() => navigateTo('/dashboard'), 500);
  });
  document.getElementById('menu-exit-nosave')?.addEventListener('click', async () => {
    if (!confirm('Выйти? Прогресс потерян, игра прервана.')) return;
    try {
      await apiCall(`/api/sessions/${session._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'abandoned' }) });
    } catch {}
    navigateTo('/dashboard');
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

function setupZoom() {
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => { zoom = Math.min(2.5, zoom + 0.15); applyZoom(); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => { zoom = Math.max(0.3, zoom - 0.15); applyZoom(); });
}

function applyZoom() {
  const el = document.getElementById('game-map');
  if (el) el.style.transform = `scale(${zoom})`;
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════
function getMyHero() { return gs?.heroes?.find((h: any) => h.userId === user?._id); }

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
  switch (r.type || data.action?.type) {
    case 'move': return `➡ ${r.heroName || 'Герой'} → (${r.to?.x},${r.to?.y})${r.trap ? ' ⚡Ловушка! -' + r.trap.damage + 'HP' : ''}${r.encounter ? ' 👹 ' + r.encounter.monsterName + '!' : ''}`;
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
    case 'use-item': return `🧪 ${r.itemName}: ${r.healing ? '+' + r.healing + ' HP' : ''}${r.manaRestored ? '+' + r.manaRestored + ' MP' : ''}`;
    case 'ability': return `✨ ${r.abilityName || 'Способность'}${r.healing ? ': +' + r.healing + ' HP' : ''}${r.damage ? ': ' + r.damage + ' урона' : ''}${r.shield ? ': щит +' + r.shield : ''} (${r.manaCost} MP)`;
    case 'interact': return `🤝 ${r.type === 'chest' ? '📦 Сундук: ' + (r.loot?.length || 0) + ' предметов' : r.message || r.name || 'Взаимодействие'}`;
    case 'loot': return `🎁 ${r.targetName}: ${r.loot?.length || 0} предметов`;
    case 'combat-start': return `⚔ БОЙ! Порядок: ${r.turnOrder?.map((t: any) => t.name).join(' → ')}`;
    default: return `⚡ ${r.type || data.action?.type || 'Действие'}`;
  }
}
