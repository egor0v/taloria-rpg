import { api } from '../../core/api';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import { io, Socket } from 'socket.io-client';
import { getToken } from '../../core/api';
import { findSelectedHero } from '../../core/heroSelection';
import './CityLobby.css';

let citySocket: Socket | null = null;
let currentHero: any = null;
let lobbyState: any = null;

export async function renderCityLobby(container: HTMLElement, locationId: string): Promise<void> {
  clearElement(container);

  // Get selected hero (from localStorage)
  try {
    const heroData = await api.get('/api/heroes');
    currentHero = findSelectedHero(heroData.heroes || []);
  } catch { }

  // Join lobby via REST
  let joinData: any;
  try {
    joinData = await api.post(`/api/city/lobby/${locationId}/join`, { heroId: currentHero?._id });
  } catch (err: any) {
    if (err.error === 'redirect' || joinData?.redirect) {
      navigateTo(joinData?.redirect || '/city');
      return;
    }
    container.innerHTML = `<div class="section"><p style="color:var(--red)">${err.error || 'Ошибка входа в локацию'}</p><button class="btn btn-secondary" id="btn-back-city">← Назад</button></div>`;
    document.getElementById('btn-back-city')?.addEventListener('click', () => navigateTo('/city'));
    return;
  }

  lobbyState = joinData;
  const location = joinData.location;
  const npcShop = joinData.npcShop;

  container.innerHTML = `
    <div class="lobby-page">
      <!-- Header -->
      <div class="lobby-header">
        <button class="lobby-back-btn" id="btn-leave-lobby">← Город</button>
        <h2 class="lobby-title">${location.name}</h2>
        <div class="lobby-hero-balance" id="hero-balance">
          <span class="hero-name-badge">${currentHero?.name || 'Герой'}</span>
          <span class="hero-gold">🪙 <strong id="hero-gold-val">${currentHero?.gold || 0}</strong></span>
          <span class="hero-silver">🥈 <strong id="hero-silver-val">${currentHero?.silver || 0}</strong></span>
        </div>
        <div class="lobby-players-count" id="lobby-count">${joinData.players?.length || 0} / ${location.maxPlayers}</div>
      </div>

      <div class="lobby-layout">
        <!-- Left: Players -->
        <div class="lobby-players-panel">
          <h4 class="lobby-panel-title">Игроки</h4>
          <div class="lobby-players-list" id="players-list"></div>
        </div>

        <!-- Center: Grid Map + NPC -->
        <div class="lobby-center">
          <div class="lobby-map-wrap" style="background-image: url('${location.mapImage || ''}')">
            <div class="lobby-grid" id="lobby-grid"></div>
          </div>

          <!-- Actions -->
          <div class="lobby-actions" id="lobby-actions">
            ${(location.actions || []).map((action: string) => `
              <button class="lobby-action-btn" data-action="${action}">${getActionLabel(action)}</button>
            `).join('')}
          </div>
        </div>

        <!-- Right: Chat -->
        <div class="lobby-chat-panel">
          <h4 class="lobby-panel-title">Чат</h4>
          <div class="lobby-chat-messages" id="chat-messages"></div>
          <div class="lobby-chat-input">
            <input type="text" class="input" id="chat-input" placeholder="Сообщение..." maxlength="200" />
            <button class="btn btn-primary btn-sm" id="btn-send-chat">↵</button>
          </div>
        </div>
      </div>

      <!-- NPC Interaction Menu -->
      <div class="lobby-npc-menu hidden" id="npc-menu">
        <div class="lobby-npc-menu-card">
          <div class="npc-menu-header">
            <span class="npc-menu-icon">🧑‍💼</span>
            <div>
              <h3 class="npc-menu-name">${npcShop?.npcName || 'NPC'}</h3>
              <p class="npc-menu-type">${npcShop?.npcType || ''}</p>
            </div>
            <button class="npc-menu-close" id="btn-close-npc-menu">✕</button>
          </div>
          <div class="npc-menu-actions">
            <button class="npc-menu-btn" id="btn-npc-talk">💬 Поговорить</button>
            <button class="npc-menu-btn" id="btn-npc-trade">🛒 Торговать</button>
          </div>
        </div>
      </div>

      <!-- NPC Dialog Modal -->
      <div class="lobby-dialog-overlay hidden" id="dialog-overlay">
        <div class="lobby-dialog-modal">
          <div class="lobby-dialog-header">
            <span class="dialog-npc-icon">🧑‍💼</span>
            <h3 class="dialog-npc-name">${npcShop?.npcName || 'NPC'}</h3>
            <button class="lobby-dialog-close" id="btn-close-dialog">✕</button>
          </div>
          <div class="lobby-dialog-messages" id="dialog-messages">
            <div class="dialog-msg dialog-msg--npc">
              <span class="dialog-msg-name">${npcShop?.npcName || 'NPC'}</span>
              <p class="dialog-msg-text">${npcShop?.greeting || 'Приветствую, путник!'}</p>
            </div>
          </div>
          <div class="lobby-dialog-choices" id="dialog-choices">
            <button class="dialog-choice-btn" data-choice="Расскажи о себе">Расскажи о себе</button>
            <button class="dialog-choice-btn" data-choice="Что у тебя есть?">Что у тебя есть?</button>
            <button class="dialog-choice-btn" data-choice="Что нового в городе?">Что нового в городе?</button>
            <button class="dialog-choice-btn dialog-choice-btn--exit" data-choice="__exit__">Уйти</button>
          </div>
        </div>
      </div>

      <!-- NPC Shop Modal -->
      <div class="lobby-shop-overlay hidden" id="shop-overlay">
        <div class="lobby-shop-modal">
          <div class="lobby-shop-header">
            <h3 class="lobby-shop-title" id="shop-title">${npcShop?.npcName || 'Торговец'}</h3>
            <button class="lobby-shop-close" id="btn-close-shop">✕</button>
          </div>
          <p class="lobby-shop-greeting" id="shop-greeting">${npcShop?.greeting || ''}</p>
          <div class="lobby-shop-balance" id="shop-balance">
            Баланс торговца: 🪙 ${npcShop?.goldBalance || 0} 🥈 ${npcShop?.silverBalance || 0}
          </div>
          <div class="lobby-shop-tabs">
            <button class="lobby-shop-tab active" data-shop-tab="buy">Купить</button>
            <button class="lobby-shop-tab" data-shop-tab="sell">Продать</button>
          </div>
          <div class="lobby-shop-content" id="shop-content">
            <div class="loading-screen"><div class="spinner"></div></div>
          </div>
          <div class="lobby-hero-balance" id="hero-trade-balance">
            Ваши средства: 🪙 ${currentHero?.gold || 0} 🥈 ${currentHero?.silver || 0}
          </div>
        </div>
      </div>

      <!-- Action Result Toast -->
      <div class="lobby-toast hidden" id="action-toast"></div>
    </div>
  `;

  // Render players list
  renderPlayersList(joinData.players || []);

  // Render grid map with player + NPC
  renderLobbyGrid(npcShop, joinData.players || []);

  // Connect to city WebSocket
  connectCitySocket(locationId);

  // Event: Leave lobby
  document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
    try { await api.post(`/api/city/lobby/${locationId}/leave`); } catch { }
    citySocket?.emit('city-leave');
    citySocket?.disconnect();
    citySocket = null;
    navigateTo('/city');
  });

  // ===== NPC MENU =====
  document.getElementById('btn-close-npc-menu')?.addEventListener('click', () => {
    document.getElementById('npc-menu')?.classList.add('hidden');
  });

  // NPC → Talk
  document.getElementById('btn-npc-talk')?.addEventListener('click', () => {
    document.getElementById('npc-menu')?.classList.add('hidden');
    document.getElementById('dialog-overlay')?.classList.remove('hidden');
  });

  // NPC → Trade
  document.getElementById('btn-npc-trade')?.addEventListener('click', () => {
    document.getElementById('npc-menu')?.classList.add('hidden');
    document.getElementById('shop-overlay')?.classList.remove('hidden');
    loadShopItems(locationId, 'buy');
  });

  // ===== NPC DIALOG =====
  document.getElementById('btn-close-dialog')?.addEventListener('click', () => {
    document.getElementById('dialog-overlay')?.classList.add('hidden');
  });
  document.getElementById('dialog-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'dialog-overlay') {
      document.getElementById('dialog-overlay')?.classList.add('hidden');
    }
  });

  // Dialog choices
  document.getElementById('dialog-choices')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.dialog-choice-btn') as HTMLElement;
    if (!btn) return;
    const choice = btn.dataset.choice!;

    if (choice === '__exit__') {
      document.getElementById('dialog-overlay')?.classList.add('hidden');
      return;
    }

    // "Покажи товары" — open shop directly
    if (choice === 'Покажи товары' || choice === 'Показать товары' || choice === 'Торговля') {
      document.getElementById('dialog-overlay')?.classList.add('hidden');
      document.getElementById('shop-overlay')?.classList.remove('hidden');
      const firstTab = document.querySelector('.lobby-shop-tab.active') as HTMLElement;
      if (firstTab) loadShopItems(locationId, firstTab.dataset.shopTab!);
      return;
    }

    // Add player message
    const messagesEl = document.getElementById('dialog-messages')!;
    messagesEl.innerHTML += `<div class="dialog-msg dialog-msg--player"><span class="dialog-msg-name">${currentHero?.name || 'Вы'}</span><p class="dialog-msg-text">${choice}</p></div>`;

    // Show loading
    const choicesEl = document.getElementById('dialog-choices')!;
    choicesEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:10px">NPC думает...</p>';

    try {
      const result = await api.post('/api/ai/dialog', {
        npcName: npcShop?.npcName || 'NPC',
        npcType: npcShop?.npcType || 'trader',
        heroName: currentHero?.name || 'Герой',
        heroCls: currentHero?.cls || 'warrior',
        playerChoice: choice,
        dialogHistory: [],
      });

      // Add NPC response
      messagesEl.innerHTML += `<div class="dialog-msg dialog-msg--npc"><span class="dialog-msg-name">${npcShop?.npcName || 'NPC'}</span><p class="dialog-msg-text">${result.npcText || result.narration || 'Хм...'}</p></div>`;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      // Update choices
      const choices = result.choices || [{ text: 'Продолжить разговор' }, { text: 'Покажи товары' }];
      choicesEl.innerHTML = choices.map((c: any) =>
        `<button class="dialog-choice-btn" data-choice="${c.text}">${c.text}</button>`
      ).join('') + '<button class="dialog-choice-btn dialog-choice-btn--exit" data-choice="__exit__">Уйти</button>';
    } catch {
      // Fallback if AI is not configured
      const fallbacks = [
        'Мир полон тайн и опасностей, путник.',
        'Если тебе нужно снаряжение — обращайся!',
        'Будь осторожен на дорогах. Гоблины не дремлют.',
        'У меня лучший товар в городе. Хочешь взглянуть?',
      ];
      const text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      messagesEl.innerHTML += `<div class="dialog-msg dialog-msg--npc"><span class="dialog-msg-name">${npcShop?.npcName || 'NPC'}</span><p class="dialog-msg-text">${text}</p></div>`;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      choicesEl.innerHTML = `
        <button class="dialog-choice-btn" data-choice="Расскажи подробнее">Расскажи подробнее</button>
        <button class="dialog-choice-btn" data-choice="Покажи товары">Покажи товары</button>
        <button class="dialog-choice-btn dialog-choice-btn--exit" data-choice="__exit__">Уйти</button>
      `;
    }
  });

  // ===== SHOP =====
  document.getElementById('btn-close-shop')?.addEventListener('click', () => {
    document.getElementById('shop-overlay')?.classList.add('hidden');
  });
  document.getElementById('shop-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'shop-overlay') {
      document.getElementById('shop-overlay')?.classList.add('hidden');
    }
  });

  // Shop tabs
  document.querySelectorAll('.lobby-shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lobby-shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadShopItems(locationId, (tab as HTMLElement).dataset.shopTab!);
    });
  });

  // ===== CHAT =====
  document.getElementById('btn-send-chat')?.addEventListener('click', sendChat);
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  // ===== ACTION BUTTONS =====
  document.querySelectorAll('.lobby-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = (btn as HTMLElement).dataset.action!;

      // Actions that open shop
      if (['buy-provisions', 'buy-scroll', 'buy-potion', 'buy-herbs', 'buy-item'].includes(action)) {
        document.getElementById('shop-overlay')?.classList.remove('hidden');
        loadShopItems(locationId, 'buy');
        return;
      }

      // Craft actions
      if (['craft-item', 'craft-potion', 'craft-scroll'].includes(action)) {
        openCraftUI(locationId);
        return;
      }

      // Actions that require API call
      try {
        (btn as HTMLElement).classList.add('lobby-action-btn--loading');
        const result = await api.post('/api/city/action', { locationId, action, heroId: currentHero?._id });
        (btn as HTMLElement).classList.remove('lobby-action-btn--loading');

        if (result.success) {
          currentHero = result.hero;
          updateHeroBalance();
          showActionToast(result.message);
          addChatMessage('⚡ ' + result.message, 'system');
        }
      } catch (err: any) {
        (btn as HTMLElement).classList.remove('lobby-action-btn--loading');
        showActionToast(err.error || 'Ошибка', true);
        addChatMessage('❌ ' + (err.error || 'Ошибка действия'), 'error');
      }
    });
  });
}

function connectCitySocket(locationId: string) {
  const token = getToken();
  citySocket = io('/city', {
    auth: { token, userId: '', displayName: '' },
    reconnection: true,
  });

  citySocket.emit('city-join', { locationId, heroId: currentHero?._id });

  citySocket.on('city-player-joined', (data: any) => {
    addChatMessage(`${data.displayName} вошёл в локацию`, 'system');
    // Add to players list
    const list = document.getElementById('players-list');
    if (list) {
      const el = document.createElement('div');
      el.className = 'lobby-player';
      el.dataset.userId = data.userId;
      el.innerHTML = `<span class="lobby-player-name">${data.heroName || data.displayName}</span><span class="lobby-player-meta">${data.cls || ''} Ур.${data.level || 1}</span>`;
      list.appendChild(el);
    }
    updatePlayerCount(1);
  });

  citySocket.on('city-player-left', (data: any) => {
    addChatMessage(`${data.displayName} покинул локацию`, 'system');
    document.querySelector(`.lobby-player[data-user-id="${data.userId}"]`)?.remove();
    updatePlayerCount(-1);
  });

  citySocket.on('city-player-moved', (data: any) => {
    // Update player position and re-render grid
    const players = lobbyState?.players || [];
    const p = players.find((pl: any) => pl.userId === data.userId);
    if (p) { p.position = { x: data.x, y: data.y }; }
    renderLobbyGrid(lobbyState?.npcShop, players);
  });

  citySocket.on('city-chat-message', (data: any) => {
    addChatMessage(`${data.displayName}: ${data.text}`);
  });

  citySocket.on('npc-buy-result', (data: any) => {
    currentHero = data.hero;
    updateHeroBalance();
    addChatMessage('✅ Покупка совершена!', 'system');
  });

  citySocket.on('npc-sell-result', (data: any) => {
    currentHero = data.hero;
    updateHeroBalance();
    addChatMessage(`✅ Продано за ${data.sellPrice} серебра!`, 'system');
  });

  citySocket.on('npc-state-update', (data: any) => {
    const balEl = document.getElementById('shop-balance');
    if (balEl) balEl.textContent = `Баланс торговца: 🪙 ${data.npcState.gold} 🥈 ${data.npcState.silver}`;
  });

  citySocket.on('error', (data: any) => {
    addChatMessage('❌ ' + (data.message || 'Ошибка'), 'error');
  });
}

// Grid settings
const GRID_COLS = 12;
const GRID_ROWS = 10;

// Player position on grid
let playerPos = { x: 5, y: GRID_ROWS - 2 }; // bottom center
const NPC_POS = { x: 2, y: 2 }; // upper left, not at edge

function renderLobbyGrid(npcShop: any, players: any[]) {
  const gridEl = document.getElementById('lobby-grid');
  if (!gridEl) return;

  gridEl.style.setProperty('--grid-cols', String(GRID_COLS));
  gridEl.style.setProperty('--grid-rows', String(GRID_ROWS));

  let html = '';
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const isPlayer = col === playerPos.x && row === playerPos.y;
      const isNpc = npcShop && col === NPC_POS.x && row === NPC_POS.y;

      // Check if other player is here
      const otherPlayer = players.find(p => p.position?.x === col && p.position?.y === row && p.userId !== currentHero?.userId);

      let content = '';
      let cellClass = 'grid-cell';

      if (isPlayer) {
        cellClass += ' grid-cell--player';
        content = `<div class="grid-token grid-token--player" title="${currentHero?.name || 'Вы'}">🧙</div>`;
      } else if (isNpc) {
        cellClass += ' grid-cell--npc';
        content = `<div class="grid-token grid-token--npc" id="btn-open-shop" title="${npcShop.npcName}">🧑‍💼</div>`;
      } else if (otherPlayer) {
        cellClass += ' grid-cell--other';
        content = `<div class="grid-token grid-token--other" title="${otherPlayer.heroName || otherPlayer.displayName}">🧝</div>`;
      }

      // Highlight reachable cells (adjacent to player)
      const dist = Math.abs(col - playerPos.x) + Math.abs(row - playerPos.y);
      if (!isPlayer && !isNpc && !otherPlayer && dist <= 2 && dist > 0) {
        cellClass += ' grid-cell--reachable';
      }

      html += `<div class="${cellClass}" data-x="${col}" data-y="${row}">${content}</div>`;
    }
  }

  gridEl.innerHTML = html;

  // Click to move
  gridEl.querySelectorAll('.grid-cell--reachable, .grid-cell--npc').forEach(cell => {
    cell.addEventListener('click', () => {
      const x = parseInt((cell as HTMLElement).dataset.x!);
      const y = parseInt((cell as HTMLElement).dataset.y!);

      // If clicking NPC cell, open interaction menu
      if (x === NPC_POS.x && y === NPC_POS.y) {
        // Move adjacent to NPC first
        playerPos = { x: NPC_POS.x + 1, y: NPC_POS.y };
        citySocket?.emit('city-move', playerPos);
        renderLobbyGrid(npcShop, players);
        // Open NPC interaction menu
        document.getElementById('npc-menu')?.classList.remove('hidden');
        return;
      }

      playerPos = { x, y };
      citySocket?.emit('city-move', playerPos);
      renderLobbyGrid(npcShop, players);
    });
  });
}

function renderPlayersList(players: any[]) {
  const list = document.getElementById('players-list');
  if (!list) return;
  list.innerHTML = players.map(p => `
    <div class="lobby-player" data-user-id="${p.userId}">
      <span class="lobby-player-name">${p.heroName || p.displayName}</span>
      <span class="lobby-player-meta">${p.cls || ''} Ур.${p.level || 1}</span>
    </div>
  `).join('');
}

function sendChat() {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  citySocket?.emit('city-chat', { text });
  input.value = '';
}

function addChatMessage(text: string, type = 'normal') {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg--${type}`;
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

async function loadShopItems(locationId: string, tab: string) {
  const content = document.getElementById('shop-content')!;
  content.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';

  const rarityColors: Record<string, string> = { common: '#9D9D9D', uncommon: '#1EFF00', rare: '#0070FF', epic: '#A335EE', legendary: '#FF8000' };
  const SELL_PRICES: Record<string, number> = { common: 1, uncommon: 10, rare: 50, epic: 200, legendary: 5000 };
  const rarityNames: Record<string, string> = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

  if (tab === 'buy') {
    try {
      const data = await api.get(`/api/city/npc/${locationId}/shop`);

      // Update NPC balance display
      const balEl = document.getElementById('shop-balance');
      if (balEl) balEl.textContent = `Баланс торговца: 🪙 ${data.goldBalance} 🥈 ${data.silverBalance}`;

      if (!data.items?.length) {
        content.innerHTML = '<p class="dash-empty">Товары отсутствуют</p>';
        return;
      }

      content.innerHTML = data.items.map((item: any) => {
        const price = item.price || item.sellPrice || 1;
        const color = rarityColors[item.rarity] || '#e8e6e0';
        const canAfford = (currentHero?.silver || 0) >= price;
        return `
          <div class="shop-item">
            <div class="shop-item-icon">${item.img ? `<img src="${item.img}" class="shop-item-img" alt="" />` : getShopItemEmoji(item.type)}</div>
            <div class="shop-item-info">
              <span class="shop-item-name" style="color:${color}">${item.name}</span>
              <span class="shop-item-type">${rarityNames[item.rarity] || 'Обычный'}${item.source === 'player' ? ' · от игрока' : ''}</span>
              ${item.description ? `<span class="shop-item-desc">${item.description}</span>` : ''}
            </div>
            <div class="shop-item-right">
              <div class="shop-item-price ${!canAfford ? 'shop-item-price--expensive' : ''}">🥈 ${price}</div>
              <button class="btn btn-primary btn-sm shop-buy-btn ${!canAfford ? 'shop-buy-btn--disabled' : ''}" data-item-id="${item.itemId}" ${!canAfford ? 'title="Недостаточно серебра"' : ''}>
                ${canAfford ? 'Купить' : '🔒'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      content.querySelectorAll('.shop-buy-btn:not(.shop-buy-btn--disabled)').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = (btn as HTMLElement).dataset.itemId!;
          (btn as HTMLElement).textContent = '...';
          (btn as HTMLElement).classList.add('shop-buy-btn--loading');
          try {
            const result = await api.post(`/api/city/npc/${locationId}/buy`, {
              itemId, quantity: 1, heroId: currentHero?._id,
            });
            currentHero = result.hero;
            updateHeroBalance();
            showActionToast('✅ Куплено!');
            addChatMessage(`🛒 Куплен предмет у торговца`, 'system');
            // Reload shop to update NPC balance and afford state
            loadShopItems(locationId, 'buy');
          } catch (err: any) {
            showActionToast(err.error || 'Ошибка покупки', true);
            (btn as HTMLElement).textContent = 'Купить';
            (btn as HTMLElement).classList.remove('shop-buy-btn--loading');
          }
        });
      });
    } catch {
      content.innerHTML = '<p style="color:var(--red)">Ошибка загрузки магазина</p>';
    }
  } else {
    // === SELL TAB ===
    // Refresh hero data
    try {
      const heroData = await api.get('/api/heroes');
      currentHero = heroData.heroes?.[0];
    } catch {}

    if (!currentHero?.inventory?.length) {
      content.innerHTML = '<p class="dash-empty">Инвентарь пуст — нечего продавать</p>';
      return;
    }

    content.innerHTML = currentHero.inventory.map((item: any, idx: number) => {
      const color = rarityColors[item.rarity] || '#e8e6e0';
      const sellPrice = SELL_PRICES[item.rarity] || 1;
      return `
        <div class="shop-item">
          <div class="shop-item-icon">${item.img ? `<img src="${item.img}" class="shop-item-img" alt="" />` : getShopItemEmoji(item.type)}</div>
          <div class="shop-item-info">
            <span class="shop-item-name" style="color:${color}">${item.name}${(item.quantity || 1) > 1 ? ` (×${item.quantity})` : ''}</span>
            <span class="shop-item-type">${item.type || ''} · ${rarityNames[item.rarity] || 'Обычный'}</span>
          </div>
          <div class="shop-item-right">
            <div class="shop-item-price shop-item-price--sell">+ 🥈 ${sellPrice}</div>
            <button class="btn btn-danger btn-sm shop-sell-btn" data-idx="${idx}">Продать</button>
          </div>
        </div>
      `;
    }).join('');

    content.querySelectorAll('.shop-sell-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemIndex = parseInt((btn as HTMLElement).dataset.idx!);
        const itemName = currentHero.inventory[itemIndex]?.name || 'предмет';
        (btn as HTMLElement).textContent = '...';

        try {
          const result = await api.post(`/api/city/npc/${locationId}/sell`, {
            itemIndex, heroId: currentHero?._id,
          });
          currentHero = result.hero;
          updateHeroBalance();
          showActionToast(`✅ ${itemName} продан за ${result.sellPrice} 🥈`);
          addChatMessage(`💰 Продано: ${itemName} за ${result.sellPrice} серебра`, 'system');
          // Reload sell tab to update inventory list
          loadShopItems(locationId, 'sell');
        } catch (err: any) {
          showActionToast(err.error || 'Ошибка продажи', true);
          (btn as HTMLElement).textContent = 'Продать';
        }
      });
    });
  }
}

function getShopItemEmoji(type: string): string {
  const map: Record<string, string> = {
    weapon: '⚔️', armor: '🛡️', helmet: '⛑️', boots: '👢', pants: '👖',
    shield: '🛡️', ring: '💍', amulet: '📿', potion: '🧪', scroll: '📜',
    tool: '🔧', food: '🍖', junk: '💎', quest: '⭐', jewelry: '💎',
  };
  return map[type] || '📦';
}

function updateHeroBalance() {
  // Update in trade panel
  const el = document.getElementById('hero-trade-balance');
  if (el) el.textContent = `Ваши средства: 🪙 ${currentHero?.gold || 0} 🥈 ${currentHero?.silver || 0}`;
  // Update in header
  const goldEl = document.getElementById('hero-gold-val');
  const silverEl = document.getElementById('hero-silver-val');
  if (goldEl) goldEl.textContent = String(currentHero?.gold || 0);
  if (silverEl) silverEl.textContent = String(currentHero?.silver || 0);
}

function updatePlayerCount(delta: number) {
  const el = document.getElementById('lobby-count');
  if (!el) return;
  const parts = el.textContent?.split('/') || ['0', '50'];
  const current = parseInt(parts[0]) + delta;
  el.textContent = `${current} / ${parts[1].trim()}`;
}

function showActionToast(message: string, isError = false) {
  const toast = document.getElementById('action-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `lobby-toast ${isError ? 'lobby-toast--error' : 'lobby-toast--success'}`;
  setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'drink-ale': '🍺 Выпить эля (10 🥈)',
    'buy-provisions': '🍖 Провизия',
    'blessing': '✝️ Благословение (10 🥈)',
    'buy-scroll': '📜 Свитки',
    'craft-scroll': '✨ Создать свиток',
    'upgrade-weapon': '⚔️ Улучшить оружие (20 🥈)',
    'repair-armor': '🛡️ Починить броню (20 🥈)',
    'craft-item': '🔨 Создать предмет',
    'buy-potion': '🧪 Зелья',
    'craft-potion': '⚗️ Создать зелье',
    'buy-herbs': '🌿 Травы',
    'buy-item': '📦 Товары',
  };
  return labels[action] || action;
}

// ==============================
// CRAFT UI
// ==============================
async function openCraftUI(locationId: string) {
  // Create overlay if not exists
  let overlay = document.getElementById('craft-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'craft-overlay';
    overlay.className = 'craft-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="craft-panel">
      <div class="craft-header">
        <h3>🔨 Мастерская</h3>
        <button class="craft-close" id="craft-close">✕</button>
      </div>
      <div class="craft-body">
        <div class="craft-list" id="craft-list">
          <div style="color:var(--text-dim);padding:20px;text-align:center">⏳ Загрузка рецептов...</div>
        </div>
        <div class="craft-detail" id="craft-detail">
          <div style="color:var(--text-dim);padding:20px;text-align:center">← Выберите предмет для крафта</div>
        </div>
      </div>
    </div>
  `;
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';

  document.getElementById('craft-close')?.addEventListener('click', () => {
    overlay!.style.display = 'none';
  });

  // Load recipes for this location
  try {
    const data = await api.get(`/api/city/craft/recipes?locationId=${locationId}&heroId=${currentHero?._id || ''}`);
    const recipes = data.recipes || [];

    const listEl = document.getElementById('craft-list')!;
    if (recipes.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-dim);padding:20px">Нет доступных рецептов для этой локации</div>';
      return;
    }

    listEl.innerHTML = recipes.map((r: any) => {
      const rName = r.result?.name || r.resultName || r.name || 'Предмет';
      const rRarity = r.result?.rarity || r.resultRarity || 'legendary';
      const rImg = r.result?.img || r.resultImg || '';
      const rDesc = r.result?.description || r.description || '';
      const ings = r.ingredientStatus || r.ingredients || [];
      const ingCount = ings.length;
      const haveCount = ings.filter((i: any) => i.hasEnough).length;
      const canCraft = r.canCraft || (haveCount === ingCount && ingCount > 0);
      return `
        <div class="craft-recipe-card ${canCraft ? 'craft-recipe--ready' : ''}" data-recipe="${r.recipeId}">
          <div class="craft-recipe-img">${rImg ? `<img src="${rImg}" alt="" />` : '🔨'}</div>
          <div class="craft-recipe-info">
            <div class="craft-recipe-name rarity-${rRarity}">${rName}</div>
            <div class="craft-recipe-meta">${rDesc}</div>
            <div class="craft-recipe-ings-bar">
              <span class="${haveCount === ingCount ? 'craft-ings-ok' : 'craft-ings-partial'}">${haveCount}/${ingCount} ингр.</span>
              ${r.craftLimit > 0 ? `<span class="craft-limit-badge ${r.soldOut ? 'craft-limit--out' : ''}">${r.soldOut ? '⛔ Распродано' : `${r.craftCount || 0}/${r.craftLimit}`}</span>` : ''}
              ${canCraft && !r.soldOut ? '<span class="craft-ready-badge">✓ Можно создать</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Recipe click → show details
    listEl.querySelectorAll('.craft-recipe-card').forEach(card => {
      card.addEventListener('click', () => {
        listEl.querySelectorAll('.craft-recipe-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        loadRecipeDetail((card as HTMLElement).dataset.recipe!);
      });
    });
  } catch (err: any) {
    document.getElementById('craft-list')!.innerHTML = `<div style="color:var(--red);padding:20px">❌ ${err.error || 'Ошибка'}</div>`;
  }
}

async function loadRecipeDetail(recipeId: string) {
  const detailEl = document.getElementById('craft-detail');
  if (!detailEl) return;
  detailEl.innerHTML = '<div style="padding:20px;color:var(--text-dim)">⏳ Загрузка...</div>';

  try {
    const data = await api.get(`/api/city/craft/recipes/${recipeId}?heroId=${currentHero?._id}`);
    const recipe = data.recipe;
    const ingredients = data.ingredientStatus?.length ? data.ingredientStatus : (recipe.ingredients || []);
    const allHaveEnough = ingredients.length > 0 && ingredients.every((i: any) => i.hasEnough === true);
    const rName = recipe.result?.name || recipe.name || 'Предмет';
    const rRarity = recipe.result?.rarity || 'legendary';
    const rImg = recipe.result?.img || '';
    const rDesc = recipe.result?.description || recipe.description || '';
    const rChars = recipe.result?.characteristics || '';
    const rAdvantages = recipe.result?.advantages || '';
    const craftCost = recipe.craftCostSilver || 0;
    const reqLevel = recipe.level || recipe.requiredLevel || 1;
    const canAfford = craftCost > 0 ? (currentHero?.silver || 0) >= craftCost : true;
    const levelOk = (currentHero?.level || 1) >= reqLevel;
    const canCraft = allHaveEnough && canAfford && levelOk;

    detailEl.innerHTML = `
      <div class="craft-detail-header">
        <div class="craft-detail-img">${rImg ? `<img src="${rImg}" alt="" />` : '🔨'}</div>
        <div>
          <h4 class="rarity-${rRarity}">${rName}</h4>
          <p class="craft-detail-desc">${rDesc}</p>
          ${rChars ? `<p class="craft-detail-stats">${rChars}</p>` : ''}
          ${rAdvantages ? `<p class="craft-detail-bonus">✦ ${rAdvantages}</p>` : ''}
        </div>
      </div>

      <div class="craft-ingredients-title">Ингредиенты:</div>
      <div class="craft-ingredients">
        ${ingredients.map((ing: any) => {
          const has = ing.hasEnough !== false;
          const owned = ing.owned ?? '?';
          return `
            <div class="craft-ingredient ${has ? 'has' : 'missing'}" title="${ing.hint || 'Ингредиент'}">
              <div class="craft-ing-row">
                ${ing.img ? `<img src="${ing.img}" class="craft-ing-icon" alt="" />` : '<span class="craft-ing-icon-placeholder">📦</span>'}
                <div class="craft-ing-info">
                  <div class="craft-ing-name">${ing.name} <span class="craft-ing-qty-inline">×${ing.quantity}</span></div>
                  <div class="craft-ing-qty">${owned} / ${ing.quantity}</div>
                </div>
              </div>
              ${ing.hint ? `<div class="craft-ing-hint">📍 ${ing.hint}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      ${craftCost > 0 ? `
      <div class="craft-cost">
        <span>Стоимость: <strong>${craftCost}</strong> 🥈</span>
        <span class="${canAfford ? '' : 'craft-cost-fail'}">У вас: ${currentHero?.silver || 0} 🥈</span>
      </div>
      ` : ''}

      <button class="craft-btn ${canCraft ? '' : 'craft-btn--disabled'}" id="btn-do-craft" ${canCraft ? '' : 'disabled'}>
        ${canCraft ? '🔨 Создать!' : '❌ Не хватает ресурсов'}
      </button>
    `;

    // Craft button
    document.getElementById('btn-do-craft')?.addEventListener('click', async () => {
      if (!canCraft) return;
      try {
        const result = await api.post('/api/city/craft', { recipeId, heroId: currentHero?._id });
        if (result.success) {
          currentHero = result.hero;
          updateHeroBalance();
          showActionToast(`✅ ${result.message}`);
          addChatMessage(`🔨 ${result.message}`, 'system');
          // Refresh detail
          loadRecipeDetail(recipeId);
        }
      } catch (err: any) {
        const msg = err.error || 'Ошибка крафта';
        const missing = err.missing;
        if (missing?.length) {
          alert(`❌ ${msg}\n\nНе хватает:\n${missing.join('\n')}`);
        } else {
          alert(`❌ ${msg}`);
        }
        showActionToast(msg, true);
      }
    });
  } catch (err: any) {
    detailEl.innerHTML = `<div style="color:var(--red);padding:20px">❌ ${err.error || 'Ошибка'}</div>`;
  }
}

function addCraftStyles() {
  if (document.getElementById('craft-styles')) return;
  const s = document.createElement('style');
  s.id = 'craft-styles';
  s.textContent = `
    .craft-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center; }
    .craft-panel { background:var(--panel-solid,#131825);border:1px solid rgba(201,162,78,0.3);border-radius:12px;width:700px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden; }
    .craft-header { display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06); }
    .craft-header h3 { color:var(--gold,#f6c86d);font-size:1rem;margin:0; }
    .craft-close { background:none;border:none;color:var(--text-dim,#9a9a9e);font-size:1.2rem;cursor:pointer; }
    .craft-body { display:flex;flex:1;overflow:hidden; }
    .craft-list { width:240px;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;padding:8px; }
    .craft-detail { flex:1;overflow-y:auto;padding:16px; }
    .craft-recipe-card { display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:6px;cursor:pointer;transition:all 0.15s;border:1px solid transparent;margin-bottom:4px;opacity:0.7; }
    .craft-recipe-card:hover { background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);opacity:1; }
    .craft-recipe-card.active { background:rgba(246,200,109,0.08);border-color:rgba(246,200,109,0.3);opacity:1; }
    .craft-recipe--ready { opacity:1 !important;border-color:rgba(58,204,96,0.2);background:rgba(58,204,96,0.04); }
    .craft-recipe--ready:hover { border-color:rgba(58,204,96,0.4); }
    .craft-recipe-img { width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.2rem; }
    .craft-recipe-img img { width:36px;height:36px;object-fit:contain; }
    .craft-recipe-name { font-size:0.82rem;font-weight:600; }
    .craft-recipe-meta { font-size:0.68rem;color:var(--text-dim,#9a9a9e);margin-top:2px; }
    .craft-recipe-ings-bar { display:flex;gap:8px;align-items:center;margin-top:3px; }
    .craft-ings-ok { font-size:0.65rem;color:#3acc60;font-weight:600; }
    .craft-ings-partial { font-size:0.65rem;color:var(--text-muted,#7a7a84); }
    .craft-ready-badge { font-size:0.6rem;background:rgba(58,204,96,0.15);color:#3acc60;padding:1px 6px;border-radius:3px;font-weight:600; }
    .craft-limit-badge { font-size:0.6rem;background:rgba(255,140,66,0.12);color:#ff8c42;padding:1px 6px;border-radius:3px;font-weight:600; }
    .craft-limit--out { background:rgba(255,77,77,0.12);color:#ff4d4d; }
    .craft-detail-header { display:flex;gap:14px;align-items:flex-start;margin-bottom:16px; }
    .craft-detail-img { width:56px;height:56px;flex-shrink:0; }
    .craft-detail-img img { width:56px;height:56px;object-fit:contain; }
    .craft-detail-header h4 { font-size:1rem;margin:0 0 4px; }
    .craft-detail-desc { font-size:0.8rem;color:var(--text-dim,#9a9a9e);line-height:1.4; }
    .craft-ingredients-title { font-size:0.75rem;color:var(--text-dim,#9a9a9e);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;font-weight:600; }
    .craft-ingredients { display:flex;flex-direction:column;gap:6px;margin-bottom:16px; }
    .craft-ingredient { padding:10px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);transition:all 0.15s;cursor:default; }
    .craft-ingredient.has { background:rgba(58,204,96,0.1);border-color:rgba(58,204,96,0.3);box-shadow:0 0 6px rgba(58,204,96,0.1); }
    .craft-ingredient.has .craft-ing-name { color:#3acc60; }
    .craft-ingredient.has .craft-ing-qty { color:#50e878; }
    .craft-ingredient.missing { background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.06);opacity:0.5; }
    .craft-ingredient.missing .craft-ing-name { color:var(--text-dim,#9a9a9e); }
    .craft-ingredient:hover { opacity:1 !important; }
    .craft-ing-row { display:flex;gap:10px;align-items:center; }
    .craft-ing-icon { width:32px;height:32px;object-fit:contain;border-radius:4px;flex-shrink:0;border:1px solid rgba(255,255,255,0.08); }
    .craft-ing-icon-placeholder { width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0; }
    .craft-ing-info { flex:1; }
    .craft-ing-name { font-size:0.85rem;font-weight:600;color:var(--text,#e8e6e0); }
    .craft-ing-qty { font-size:0.75rem;color:var(--text-dim,#9a9a9e);margin-top:2px; }
    .craft-ing-hint { font-size:0.7rem;color:var(--gold-dim,#c9a24e);margin-top:4px;font-style:italic; }
    .craft-ingredient.missing .craft-ing-hint { display:block; }
    .craft-ingredient.has .craft-ing-hint { display:none; }
    .craft-ingredient:hover .craft-ing-hint { display:block !important; }
    .craft-cost { display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:6px;color:var(--text,#e8e6e0); }
    .craft-cost-fail { color:var(--red,#ff4d4d) !important; }
    .craft-level { font-size:0.78rem;color:var(--text-dim,#9a9a9e);margin-bottom:16px; }
    .craft-btn { width:100%;padding:12px;border:none;border-radius:8px;background:linear-gradient(135deg,var(--gold-dim,#c9a24e),var(--gold,#f6c86d));color:#0b0f15;font-weight:700;font-size:0.9rem;cursor:pointer;font-family:inherit; }
    .craft-btn:hover { filter:brightness(1.1); }
    .craft-btn--disabled { background:#333 !important;color:#666 !important;cursor:not-allowed; }
    .rarity-common { color:#9D9D9D; } .rarity-uncommon { color:#1EFF00; } .rarity-rare { color:#0070FF; } .rarity-epic { color:#A335EE; } .rarity-legendary { color:#FF8000; }
  `;
  document.head.appendChild(s);
}

// Initialize craft styles on module load
addCraftStyles();
