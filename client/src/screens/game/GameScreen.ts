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
    // Show dice roll popups for all checks
    const rolls = data.result?.diceRolls || [];
    const events = data.result?.events || [];
    // Water check — interactive (player rolls)
    for (const evt of events) {
      if (evt.type === 'water_check') { showDiceCheckPopup(evt); }
    }
    // All other dice rolls — animated display of server result
    if (rolls.length > 0) { showDiceRollSequence(rolls); }
  });
  sock.on('action-error', (data: any) => log(`❌ ${data.error || data.message || 'Ошибка'}`, 'error'));
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
  renderMap();
  renderTeam();
  updateHUD();
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

  // Disable buttons when actions used
  const moveBtn = el('btn-move');
  if (moveBtn) {
    const moveUsed = myHero?.moveUsed || gs.moveUsed || steps <= 0;
    moveBtn.classList.toggle('action-btn--disabled', moveUsed);
  }
  const actionUsed = myHero?.actionUsed || gs.actionUsed;
  const bonusUsed = myHero?.bonusActionUsed || gs.bonusActionUsed;
  el('btn-attack')?.classList.toggle('action-btn--disabled', !!actionUsed);
  el('btn-ability')?.classList.toggle('action-btn--disabled', !!actionUsed);
  el('btn-item')?.classList.toggle('action-btn--disabled', !!bonusUsed);
  el('btn-interact')?.classList.toggle('action-btn--disabled', !!bonusUsed);

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

  const cellSizePx = 40;
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
      const obj = objects?.find((o: any) => (o.col === x && o.row === y) && (o.discovered !== false) && !o.opened && !o.triggered);

      let cls = 'map-cell';
      if (isWall) cls += ' cell-wall';
      else if (isFire) cls += ' cell-fire';
      else if (isWater) cls += ' cell-water';
      else if (isObstacle) cls += ' cell-obstacle';
      else cls += ' cell-floor';

      // Walls are always visible (just impassable), fog only hides floor cells
      if (!isWall) {
        if (fogV === 0) cls += ' fog-hidden';
        else if (fogV === 1) cls += ' fog-explored';
      }

      // Highlights
      if (myHero && actionMode === 'move' && !isWall && fogV > 0 && !hero && !showMonster) {
        const reachable = gs.reachableCells;
        if (reachable && reachable.length > 0) {
          if (reachable.some((c: any) => c.row === y && c.col === x)) {
            cls += isObstacle ? ' cell-reachable-obstacle' : ' cell-reachable';
          }
        } else {
          const dist = Math.abs(myHero.col - x) + Math.abs(myHero.row - y);
          if (dist > 0 && dist <= (myHero.stepsRemaining || myHero.moveRange || 2)) {
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

      let content = '';
      if (hero) {
        const isMe = hero._ownerId === user?._id || hero.userId === user?._id;
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
      } else if (friendlyNpc) {
        content = `<span class="token-object token-npc" title="${friendlyNpc.name}">${friendlyNpc.label || '🧝'}</span>`;
      } else if (obj && fogV > 0) {
        const icons: Record<string, string> = { chest: '📦', trap: '⚡', rune: '🔮', questNpc: '❗' };
        content = `<span class="token-object" title="${obj.name || obj.type}">${icons[obj.type] || '❓'}</span>`;
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
    const heroCell = mapEl.querySelector(`[data-x="${myHero.col}"][data-y="${myHero.row}"]`);
    heroCell?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }
}

function onCellClick(x: number, y: number) {
  if (!sock || !gs) return;
  const myHero = getMyHero();
  if (!myHero) return;

  // Click on hostile monster → attack (row=y, col=x)
  const monster = gs.monsters?.find((m: any) => m.alive && !m.friendly && m.discovered && m.col === x && m.row === y);
  if (monster && (actionMode === 'attack' || actionMode === 'move')) {
    sock.emit('action-request', { type: 'attack', targetId: monster.entityId || monster.id });
    return;
  }

  // Click on friendly NPC/monster → interact
  const friendlyNpc = gs.monsters?.find((m: any) => m.alive && m.friendly && m.col === x && m.row === y);
  if (friendlyNpc) {
    sock.emit('action-request', { type: 'interact', targetId: friendlyNpc.id });
    return;
  }

  // Click on object → interact (send coordinates for server)
  const obj = gs.objects?.find((o: any) => o.col === x && o.row === y && (o.discovered !== false) && !o.opened && !o.triggered && !o.activated);
  if (obj && actionMode === 'interact') {
    sock.emit('action-request', { type: 'interact', targetRow: y, targetCol: x, targetId: obj.id });
    return;
  }

  // Click on dead monster → loot
  const corpse = gs.monsters?.find((m: any) => !m.alive && !m.looted && m.col === x && m.row === y);
  if (corpse) {
    sock.emit('action-request', { type: 'loot', objectId: corpse.id });
    return;
  }

  // Move (send x/y, server translates to targetRow/targetCol)
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
function setupActions(isSolo: boolean, isHost: boolean) {
  const btns = ['search', 'move', 'attack', 'ability', 'item', 'interact'];
  btns.forEach(id => {
    document.getElementById(`btn-${id}`)?.addEventListener('click', () => {
      if (id === 'ability') { showAbilityPopup(); return; }
      if (id === 'item') { showItemPopup(); return; }
      if (id === 'interact') { actionMode = 'interact'; document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('action-btn--active')); document.getElementById('btn-interact')?.classList.add('action-btn--active'); if (gs) renderMap(); return; }
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
  showInventoryOverlay();
}

// ═══════════════════════════════════
// IN-GAME INVENTORY OVERLAY
// ═══════════════════════════════════
const STAT_LABELS: Record<string, string> = { attack: 'СИЛ', agility: 'ЛОВ', armor: 'ВЫН', intellect: 'ИНТ', wisdom: 'МУД', charisma: 'ХАР' };
const EQUIP_SLOT_NAMES: Record<string, string> = { weapon: 'ОРУЖИЕ', shield: 'ЩИТ', helmet: 'ШЛЕМ', cloak: 'ПЛАЩ', armor: 'БРОНЯ', pants: 'ШТАНЫ', boots: 'ОБУВЬ', gloves: 'ПРЕДМЕТ', ring: 'КОЛЬЦО', amulet: 'АМУЛЕТ' };
const RARITY_NAMES: Record<string, string> = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
const RARITY_COLORS: Record<string, string> = { common: '#9a9a9e', uncommon: '#3acc60', rare: '#5b8fff', epic: '#a855f7', legendary: '#f6c86d' };

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
  return Math.max(0.15, Math.min(cW / mapW, cH / mapH));
}

function setupZoom() {
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => { zoom = Math.min(2.5, zoom + 0.15); applyZoom(); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => { const min = getMinZoom(); zoom = Math.max(min, zoom - 0.15); applyZoom(); });
  // Mouse wheel zoom
  document.querySelector('.game-map-scroll')?.addEventListener('wheel', (e: Event) => {
    const we = e as WheelEvent;
    if (we.ctrlKey || we.metaKey) {
      we.preventDefault();
      const min = getMinZoom();
      zoom = we.deltaY < 0 ? Math.min(2.5, zoom + 0.1) : Math.max(min, zoom - 0.1);
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

  const diceImgMap: Record<string, string> = {
    d4: '/img/кубики/d4.png', d6: '/img/кубики/d6.png',
    d8: '/img/кубики/d8.png', d20: '/img/кубики/d20.png',
  };
  const diceImg = diceImgMap[diceType] || diceImgMap['d20'];

  const overlay = document.createElement('div');
  overlay.className = 'dice-popup-overlay';
  overlay.innerHTML = `
    <div class="dice-popup">
      <div class="dice-popup-title">${roll.label || '🎲 Бросок'}</div>
      <p class="dice-popup-message">${roll.message || ''}</p>
      <div class="dice-popup-dice-wrap">
        <div class="dice-popup-dice dice-shaking" id="dice-anim-auto">
          <img src="${diceImg}" alt="${diceType}" class="dice-img" />
        </div>
        <div class="dice-popup-value" id="dice-value-auto">...</div>
      </div>
      <div class="dice-popup-result" id="dice-result-auto" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const diceEl = document.getElementById('dice-anim-auto')!;
  const valueEl = document.getElementById('dice-value-auto')!;
  const resultEl = document.getElementById('dice-result-auto')!;

  // Animate random numbers then land on final
  let count = 0;
  const interval = setInterval(() => {
    valueEl.textContent = String(Math.floor(Math.random() * maxVal) + 1);
    count++;
    if (count > 12) {
      clearInterval(interval);
      diceEl.classList.remove('dice-shaking');
      valueEl.textContent = String(finalRoll);
      valueEl.classList.add(success ? 'dice-value-success' : 'dice-value-fail');
      diceEl.classList.add(success ? 'dice-success' : 'dice-fail');
      resultEl.style.display = 'block';
      resultEl.innerHTML = roll.resultText || (success
        ? `<span class="dice-result-success">✅ ${finalRoll}${roll.bonus ? '+' + roll.bonus + '=' + (finalRoll + (roll.bonus||0)) : ''} — Успех!</span>`
        : `<span class="dice-result-fail">❌ ${finalRoll}${roll.bonus ? '+' + roll.bonus + '=' + (finalRoll + (roll.bonus||0)) : ''} — Провал!</span>`);
      setTimeout(() => { overlay.remove(); onDone(); }, 2000);
    }
  }, 80);
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
        diceEl.classList.remove('dice-shaking');
        valueEl.textContent = String(roll);
        valueEl.classList.add(roll >= dc ? 'dice-value-success' : 'dice-value-fail');
        diceEl.classList.add(roll >= dc ? 'dice-success' : 'dice-fail');

        const success = roll >= dc;
        resultEl.style.display = 'block';
        resultEl.innerHTML = success
          ? `<span class="dice-result-success">✅ ${roll} ≥ ${dc} — Успех!</span>`
          : `<span class="dice-result-fail">❌ ${roll} < ${dc} — Провал!</span>`;

        // Send result to server
        sock?.emit('dice-check-result', {
          sessionId: session?._id,
          entityId: evt.entityId,
          diceRoll: roll,
          checkType: evt.type,
        });

        // Auto-close after 2s
        setTimeout(() => overlay.remove(), 2500);
      }
    }, 80);
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
    case 'use-item': return `🧪 ${r.itemName}: ${r.healing ? '+' + r.healing + ' HP' : ''}${r.manaRestored ? '+' + r.manaRestored + ' MP' : ''}`;
    case 'ability': return `✨ ${r.abilityName || 'Способность'}${r.healing ? ': +' + r.healing + ' HP' : ''}${r.damage ? ': ' + r.damage + ' урона' : ''}${r.shield ? ': щит +' + r.shield : ''} (${r.manaCost} MP)`;
    case 'interact': return `🤝 ${r.type === 'chest' ? '📦 Сундук: ' + (r.loot?.length || 0) + ' предметов' : r.message || r.name || 'Взаимодействие'}`;
    case 'loot': return `🎁 ${r.targetName}: ${r.loot?.length || 0} предметов`;
    case 'combat-start': return `⚔ БОЙ! Порядок: ${r.turnOrder?.map((t: any) => t.name).join(' → ')}`;
    default: return `⚡ ${r.type || data.action?.type || 'Действие'}`;
  }
}
