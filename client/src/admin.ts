/**
 * Admin Panel — Full CRUD for all entities
 */
import './styles/variables.css';

const SECTION_NAMES: Record<string, string> = {
  maps: 'Карты', addons: 'Дополнения', heroes: 'Герои',
  subscriptions: 'Подписки', mint: 'Монетный двор',
};

let adminToken: string | null = localStorage.getItem('adminToken');
const app = document.getElementById('admin-app')!;

function apiHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` };
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const resp = await fetch(url, { ...options, headers: { ...apiHeaders(), ...(options.headers as any || {}) } });
  if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw d; }
  return resp.json();
}

// ===========================
// AUTH
// ===========================
function renderAuth() {
  app.innerHTML = `
    <div class="admin-auth-wrap">
      <div class="admin-auth-card">
        <h2>Админ-панель</h2>
        <input type="email" id="auth-email" placeholder="Email" />
        <input type="password" id="auth-password" placeholder="Пароль" />
        <div id="auth-error" class="auth-error"></div>
        <button class="btn-primary" id="btn-login">Войти</button>
      </div>
    </div>
  `;
  document.getElementById('btn-login')?.addEventListener('click', login);
  document.getElementById('auth-password')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
}

async function login() {
  const email = (document.getElementById('auth-email') as HTMLInputElement).value;
  const password = (document.getElementById('auth-password') as HTMLInputElement).value;
  const errorEl = document.getElementById('auth-error')!;
  try {
    const data = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json());
    if (!data.token) { errorEl.textContent = data.error || 'Ошибка'; errorEl.style.display = 'block'; return; }
    adminToken = data.token;
    const check = await fetch('/api/admin/store-stats', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    if (!check.ok) { errorEl.textContent = 'Нет прав администратора'; errorEl.style.display = 'block'; adminToken = null; return; }
    localStorage.setItem('adminToken', adminToken!);
    renderAdmin();
  } catch (err: any) { errorEl.textContent = err.error || 'Ошибка входа'; errorEl.style.display = 'block'; }
}

// ===========================
// MAIN LAYOUT
// ===========================
let currentPanel = 'dashboard';

function renderAdmin() {
  app.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <h3 class="sidebar-title">Taloria Admin</h3>
        <nav class="sidebar-nav" id="sidebar-nav">
          <button class="nav-btn active" data-panel="dashboard">📊 Дашборд</button>
          <button class="nav-btn" data-panel="catalog">🛒 Каталог</button>
          <button class="nav-btn" data-panel="heroes">⚔️ Герои</button>
          <button class="nav-btn" data-panel="sessions">🎮 Сессии</button>
          <button class="nav-btn" data-panel="orders">📦 Заказы</button>
          <button class="nav-btn" data-panel="users">👤 Пользователи</button>
          <button class="nav-btn" data-panel="metrics">📈 Метрика</button>
          <div class="nav-separator"></div>
          <div class="nav-section-label">Игровой контент</div>
          <button class="nav-btn" data-panel="maps">🗺️ Карты</button>
          <button class="nav-btn" data-panel="scenarios">📜 Сценарии</button>
          <button class="nav-btn" data-panel="monsters">👹 Монстры</button>
          <button class="nav-btn" data-panel="items">🎒 Предметы</button>
          <button class="nav-btn" data-panel="abilities">✨ Способности</button>
        </nav>
        <div class="sidebar-footer">
          <a href="/" class="back-link">← На сайт</a>
          <button class="btn-sm" id="btn-admin-logout">Выйти</button>
        </div>
      </aside>
      <main class="admin-content" id="admin-content"></main>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-container"></div>
    </div>
  `;
  addAdminStyles();
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPanel = (btn as HTMLElement).dataset.panel!;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPanel(currentPanel);
    });
  });
  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    adminToken = null; localStorage.removeItem('adminToken'); renderAuth();
  });
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'modal-overlay') closeModal();
  });
  loadPanel('dashboard');
}

// ===========================
// PANELS
// ===========================
async function loadPanel(panel: string) {
  const el = document.getElementById('admin-content')!;
  el.innerHTML = '<div class="loading">Загрузка...</div>';
  try {
    switch (panel) {
      case 'dashboard': await loadDashboard(el); break;
      case 'catalog': await loadCatalog(el); break;
      case 'heroes': await loadReadonlyTable(el, '/api/admin/heroes', 'Герои', ['name', 'cls', 'race', 'level', 'gold', 'silver'], 'heroes'); break;
      case 'sessions': await loadReadonlyTable(el, '/api/admin/sessions', 'Сессии', ['scenarioId', 'status', 'maxPlayers', 'inviteCode'], 'sessions'); break;
      case 'orders': await loadReadonlyTable(el, '/api/admin/store-orders', 'Заказы', ['status', 'amountKopecks', 'paidAt'], 'orders'); break;
      case 'users': await loadUsers(el); break;
      case 'metrics': await loadMetrics(el); break;
      case 'maps': await loadGameCrud(el, '/api/admin/game/maps', 'Игровые карты', FIELDS_MAP); break;
      case 'scenarios': await loadGameCrud(el, '/api/admin/game/scenarios', 'Сценарии', FIELDS_SCENARIO); break;
      case 'monsters': await loadGameCrud(el, '/api/admin/game/monsters', 'Монстры', FIELDS_MONSTER); break;
      case 'items': await loadItemsPanel(el); break;
      case 'abilities': await loadGameCrud(el, '/api/admin/game/abilities', 'Способности', FIELDS_ABILITY); break;
    }
  } catch (err: any) {
    el.innerHTML = `<p class="error">Ошибка: ${err.error || err.message || JSON.stringify(err)}</p>`;
  }
}

// ===========================
// FIELD DEFINITIONS
// ===========================
interface FieldDef { key: string; label: string; type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'json' | 'grid-editor' | 'scenario-map'; options?: string[]; required?: boolean; tableCol?: boolean; }

const FIELDS_CATALOG: FieldDef[] = [
  { key: 'slug', label: 'Slug', type: 'text', required: true, tableCol: true },
  { key: 'title', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'section', label: 'Раздел', type: 'select', options: ['subscriptions', 'maps', 'addons', 'heroes', 'mint'], required: true, tableCol: true },
  { key: 'productType', label: 'Тип продукта', type: 'select', options: ['one_time', 'subscription', 'wallet_topup', 'account_upgrade'], required: true },
  { key: 'description', label: 'Описание', type: 'textarea' },
  { key: 'priceKopecks', label: 'Цена (копейки)', type: 'number', required: true, tableCol: true },
  { key: 'originalPriceKopecks', label: 'Старая цена', type: 'number' },
  { key: 'badge', label: 'Бейдж', type: 'text' },
  { key: 'subscriptionTier', label: 'Тариф', type: 'select', options: ['', 'stranger', 'seeker', 'legend'] },
  { key: 'subscriptionPeriodMonths', label: 'Период (мес)', type: 'number' },
  { key: 'walletGoldAmount', label: 'Золото', type: 'number' },
  { key: 'walletSilverAmount', label: 'Серебро', type: 'number' },
  { key: 'heroSlotsGrant', label: 'Слоты героев', type: 'number' },
  { key: 'entitlementKey', label: 'Entitlement key', type: 'text' },
  { key: 'limitPerUser', label: 'Лимит/юзер', type: 'number' },
  { key: 'sortOrder', label: 'Сортировка', type: 'number' },
  { key: 'featured', label: 'Featured', type: 'checkbox' },
  { key: 'active', label: 'Активен', type: 'checkbox', tableCol: true },
];

const FIELDS_MAP: FieldDef[] = [
  { key: 'mapId', label: 'ID карты', type: 'text', required: true, tableCol: true },
  { key: 'name', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'description', label: 'Описание', type: 'textarea' },
  { key: 'maxPlayers', label: 'Макс. игроков', type: 'number', tableCol: true },
  { key: 'bgImage', label: 'Фон (URL)', type: 'text' },
  { key: 'mapData', label: 'Карта (terrain)', type: 'grid-editor' },
  { key: 'roadMap', label: 'Дороги (road)', type: 'grid-editor' },
  { key: 'active', label: 'Активна', type: 'checkbox', tableCol: true },
];

const FIELDS_SCENARIO: FieldDef[] = [
  { key: 'scenarioId', label: 'ID сценария', type: 'text', required: true, tableCol: true },
  { key: 'name', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'description', label: 'Описание', type: 'textarea' },
  { key: 'mapId', label: 'ID карты (выберите → загрузится превью)', type: 'text', required: true },
  { key: 'difficulty', label: 'Сложность', type: 'select', options: ['easy', 'medium', 'hard', 'nightmare'], tableCol: true },
  { key: 'playerLevel', label: 'Мин. уровень', type: 'number' },
  { key: 'maxPlayers', label: 'Макс. игроков', type: 'number' },
  { key: '_scenarioMap', label: 'Расстановка на карте', type: 'scenario-map' },
  { key: 'monsterPool', label: 'Пул монстров (JSON — заполняется автоматически)', type: 'json' },
  { key: 'bossType', label: 'Босс (type)', type: 'text' },
  { key: 'zones', label: 'Зоны (JSON — startZone заполняется автоматически)', type: 'json' },
  { key: 'objectives', label: 'Цели (JSON)', type: 'json' },
  { key: 'rewards', label: 'Награды (JSON)', type: 'json' },
  { key: 'briefing', label: 'Брифинг (JSON)', type: 'json' },
  { key: 'traders', label: 'NPC-торговцы (JSON — заполняется автоматически)', type: 'json' },
  { key: 'friendlyNpcs', label: 'Мирные NPC (JSON — заполняется автоматически)', type: 'json' },
  { key: 'introNarration', label: 'Вступительный текст', type: 'textarea' },
  { key: 'active', label: 'Активен', type: 'checkbox', tableCol: true },
];

const FIELDS_MONSTER: FieldDef[] = [
  { key: 'type', label: 'Type (уникальный)', type: 'text', required: true, tableCol: true },
  { key: 'name', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'label', label: 'Подпись', type: 'text' },
  { key: 'hp', label: 'HP', type: 'number', required: true, tableCol: true },
  { key: 'armor', label: 'Броня', type: 'number' },
  { key: 'attack', label: 'Атака', type: 'number', tableCol: true },
  { key: 'agility', label: 'Ловкость', type: 'number' },
  { key: 'moveRange', label: 'Дальность хода', type: 'number' },
  { key: 'vision', label: 'Обзор', type: 'number' },
  { key: 'attackRange', label: 'Дальность атаки', type: 'number' },
  { key: 'damageDie', label: 'Кубик урона', type: 'select', options: ['d4', 'd6', 'd8', 'd10'] },
  { key: 'xpReward', label: 'XP награда', type: 'number' },
  { key: 'goldMin', label: 'Золото мин.', type: 'number' },
  { key: 'goldMax', label: 'Золото макс.', type: 'number' },
  { key: 'aiType', label: 'AI тип', type: 'select', options: ['aggressive', 'defensive', 'support', 'coward', 'boss'] },
  { key: 'canTalk', label: 'Может говорить', type: 'checkbox' },
  { key: 'abilities', label: 'Способности (JSON)', type: 'json' },
  { key: 'img', label: 'Изображение (URL)', type: 'text' },
  { key: 'tokenImg', label: 'Токен (URL)', type: 'text' },
  { key: 'active', label: 'Активен', type: 'checkbox', tableCol: true },
];

const FIELDS_ITEM: FieldDef[] = [
  { key: 'itemId', label: 'ID предмета', type: 'text', required: true, tableCol: true },
  { key: 'name', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'type', label: 'Тип', type: 'select', options: ['weapon', 'armor', 'helmet', 'boots', 'pants', 'shield', 'ring', 'amulet', 'potion', 'scroll', 'tool', 'food', 'junk', 'quest', 'jewelry'], required: true, tableCol: true },
  { key: 'slot', label: 'Слот', type: 'select', options: ['none', 'weapon', 'shield', 'helmet', 'armor', 'boots', 'pants', 'ring', 'amulet'] },
  { key: 'rarity', label: 'Редкость', type: 'select', options: ['common', 'uncommon', 'rare', 'epic', 'legendary'], tableCol: true },
  { key: 'description', label: 'Описание', type: 'textarea' },
  { key: 'characteristics', label: 'Характеристики', type: 'text' },
  { key: 'advantages', label: 'Преимущества', type: 'text' },
  { key: 'damage', label: 'Урон (JSON: {die,bonus})', type: 'json' },
  { key: 'range', label: 'Дальность', type: 'number' },
  { key: 'weight', label: 'Вес', type: 'number' },
  { key: 'stats', label: 'Бонусы (JSON: {attack,armor,...})', type: 'json' },
  { key: 'stackable', label: 'Стакается', type: 'checkbox' },
  { key: 'maxStack', label: 'Макс. стак', type: 'number' },
  { key: 'usable', label: 'Используемый', type: 'checkbox' },
  { key: 'effect', label: 'Эффект (JSON)', type: 'json' },
  { key: 'shopLocation', label: 'Локация торговца', type: 'select', options: ['', 'smithy', 'tavern-1', 'herbalist', 'alchemist', 'shop-1', 'temple', 'shop-2', 'shop-4'] },
  { key: 'img', label: 'Изображение (URL)', type: 'text' },
  { key: 'isCraftable', label: '🔨 Крафтовый предмет', type: 'checkbox' },
  { key: 'craftLimit', label: 'Лимит крафта (0 = безлимит)', type: 'number' },
  { key: 'craftCount', label: 'Скрафчено (текущее)', type: 'number' },
  { key: 'craftLocation', label: 'Локация крафта', type: 'select', options: ['', 'smithy', 'alchemist', 'temple', 'shop-1', 'shop-2', 'shop-4'] },
  { key: 'craftIngredients', label: 'Ингредиенты крафта', type: 'craft-ingredients' },
  { key: 'active', label: 'Активен', type: 'checkbox', tableCol: true },
];

const FIELDS_ABILITY: FieldDef[] = [
  { key: 'abilityId', label: 'ID способности', type: 'text', required: true, tableCol: true },
  { key: 'name', label: 'Название', type: 'text', required: true, tableCol: true },
  { key: 'type', label: 'Тип', type: 'select', options: ['class_ability', 'skill', 'spell', 'focus', 'passive'], required: true, tableCol: true },
  { key: 'cls', label: 'Класс', type: 'select', options: ['any', 'warrior', 'mage', 'priest', 'bard'], tableCol: true },
  { key: 'branch', label: 'Ветка', type: 'text' },
  { key: 'unlockLevel', label: 'Уровень разблокировки', type: 'number' },
  { key: 'manaCost', label: 'Стоимость маны', type: 'number' },
  { key: 'cooldown', label: 'Кулдаун (ходов)', type: 'number' },
  { key: 'description', label: 'Описание', type: 'textarea' },
  { key: 'difficulty', label: 'Сложность (1-6)', type: 'number' },
  { key: 'pattern', label: 'Паттерн', type: 'text' },
  { key: 'effect', label: 'Эффект (JSON)', type: 'json' },
  { key: 'img', label: 'Изображение (URL)', type: 'text' },
  { key: 'active', label: 'Активна', type: 'checkbox', tableCol: true },
];

// ===========================
// DASHBOARD
// ===========================
async function loadDashboard(el: HTMLElement) {
  const [stats, ordersData] = await Promise.all([
    apiFetch('/api/admin/store-stats'),
    apiFetch('/api/admin/store-orders?limit=50'),
  ]);

  const orders = ordersData.orders || [];
  const statusLabels: Record<string, string> = { paid: '✅ Оплачен', pending: '⏳ Ожидает', failed: '❌ Ошибка', refunded: '↩ Возврат' };
  const statusColors: Record<string, string> = { paid: '#3acc60', pending: '#ff8c42', failed: '#ff4d4d', refunded: '#9a9a9e' };

  function fmtDate(d: string) {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + dt.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  }

  el.innerHTML = `
    <h2 class="page-title">📊 Дашборд</h2>

    <!-- Stats cards -->
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${((stats.totalRevenueKopecks || 0) / 100).toLocaleString('ru')} ₽</div><div class="stat-label">Выручка</div></div>
      <div class="stat-card"><div class="stat-value">${stats.totalOrders}</div><div class="stat-label">Оплачено заказов</div></div>
      <div class="stat-card"><div class="stat-value">${stats.activeSubscriptions}</div><div class="stat-label">Активных подписок</div></div>
      <div class="stat-card"><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">Пользователей</div></div>
    </div>

    <!-- Orders table -->
    <h3 style="color:var(--gold);margin:24px 0 12px;font-size:1rem">📋 Последние заказы (${orders.length})</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Покупатель</th>
            <th>Товар</th>
            <th>Раздел</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>ID заказа</th>
          </tr>
        </thead>
        <tbody>
          ${orders.length ? orders.map((o: any) => {
            const user = o.userId || {};
            const product = o.productSnapshot || {};
            const sectionLabels: Record<string, string> = { subscriptions: '📋 Подписка', maps: '🗺 Карта', addons: '🔧 Дополнение', heroes: '⚔ Герой', mint: '💰 Валюта' };
            return `
              <tr>
                <td style="white-space:nowrap;font-size:0.75rem">${fmtDate(o.paidAt || o.createdAt)}</td>
                <td>
                  <strong>${user.displayName || '—'}</strong>
                  <br><span style="font-size:0.68rem;color:var(--text-muted)">${user.email || '—'}</span>
                </td>
                <td>
                  <strong>${product.title || '—'}</strong>
                  <br><span style="font-size:0.68rem;color:var(--text-muted)">${product.slug || ''}</span>
                </td>
                <td style="font-size:0.78rem">${sectionLabels[product.section] || product.section || '—'}</td>
                <td style="font-weight:700;color:var(--gold)">${((o.amountKopecks || 0) / 100).toLocaleString('ru')} ₽</td>
                <td style="color:${statusColors[o.status] || 'var(--text-dim)'};font-size:0.78rem;font-weight:600">${statusLabels[o.status] || o.status}</td>
                <td style="font-size:0.65rem;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis">${o.tbankOrderId || o._id}</td>
              </tr>
            `;
          }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:20px">Нет заказов</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// ===========================
// GENERIC GAME CRUD
// ===========================
async function loadGameCrud(el: HTMLElement, apiUrl: string, title: string, fields: FieldDef[]) {
  const data = await apiFetch(apiUrl);
  const items = data.items || [];
  const tableCols = fields.filter(f => f.tableCol);

  el.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">${title} (${data.total || items.length})</h2>
      <button class="btn-primary" id="btn-add-new">+ Добавить</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          ${tableCols.map(c => `<th>${c.label}</th>`).join('')}
          <th>Действия</th>
        </tr></thead>
        <tbody>
          ${items.map((item: any) => `
            <tr data-id="${item._id}">
              ${tableCols.map(c => `<td>${formatCellValue(item[c.key], c)}</td>`).join('')}
              <td class="actions-cell">
                <button class="btn-sm btn-edit" data-id="${item._id}">✏️</button>
                <button class="btn-sm btn-delete" data-id="${item._id}">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-add-new')?.addEventListener('click', () => openEditModal(apiUrl, fields, null, title));
  el.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', async () => {
    const id = (b as HTMLElement).dataset.id!;
    const item = await apiFetch(`${apiUrl}/${id}`);
    openEditModal(apiUrl, fields, item, title);
  }));
  el.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Деактивировать элемент?')) return;
    try {
      await apiFetch(`${apiUrl}/${(b as HTMLElement).dataset.id}`, { method: 'DELETE' });
    } catch (err: any) {
      alert('Ошибка: ' + (err.error || JSON.stringify(err)));
      return;
    }
    loadPanel(currentPanel);
  }));
}

// ===========================
// CATALOG (SPECIAL)
// ===========================
async function loadCatalog(el: HTMLElement) {
  await loadGameCrud(el, '/api/admin/catalog', 'Каталог товаров', FIELDS_CATALOG);
}

// ===========================
// USERS
// ===========================
async function loadUsers(el: HTMLElement) {
  const data = await apiFetch('/api/admin/users');
  const users = data.users || [];
  el.innerHTML = `
    <h2 class="page-title">👤 Пользователи (${data.total || users.length})</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Имя</th><th>Email</th><th>Админ</th><th>Золото</th><th>Серебро</th><th>Подписка</th><th>Действия</th></tr></thead>
        <tbody>
          ${users.map((u: any) => `
            <tr>
              <td>${u.displayName}</td>
              <td>${u.email || '—'}</td>
              <td>${u.isAdmin ? '✅' : '—'}</td>
              <td>${u.walletGold || 0}</td>
              <td>${u.walletSilver || 0}</td>
              <td>${u.activeSubscriptionTier || 'none'}</td>
              <td class="actions-cell">
                <button class="btn-sm btn-grant" data-id="${u._id}" data-name="${u.displayName}">💰 Выдать</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  el.querySelectorAll('.btn-grant').forEach(b => b.addEventListener('click', () => {
    openGrantModal((b as HTMLElement).dataset.id!, (b as HTMLElement).dataset.name!);
  }));
}

// ===========================
// ITEMS PANEL (with filters + pagination)
// ===========================
const ITEM_TYPES = [
  { id: '', label: 'Все типы' },
  { id: 'weapon', label: '⚔ Оружие' },
  { id: 'armor', label: '🛡 Броня' },
  { id: 'helmet', label: '⛑ Шлемы' },
  { id: 'boots', label: '👢 Обувь' },
  { id: 'pants', label: '👖 Штаны' },
  { id: 'shield', label: '🛡 Щиты' },
  { id: 'potion', label: '🧪 Зелья/Реагенты' },
  { id: 'scroll', label: '📜 Свитки' },
  { id: 'jewelry', label: '💎 Украшения' },
  { id: 'food', label: '🌿 Растения' },
  { id: 'tool', label: '🔧 Инструменты' },
  { id: 'junk', label: '🗑 Барахло' },
  { id: 'quest', label: '⭐ Квестовые' },
];

const ITEM_RARITIES = [
  { id: '', label: 'Все редкости' },
  { id: 'common', label: 'Обычный' },
  { id: 'uncommon', label: 'Необычный' },
  { id: 'rare', label: 'Редкий' },
  { id: 'epic', label: 'Эпический' },
  { id: 'legendary', label: 'Легендарный' },
];

const ITEM_SHOPS = [
  { id: '', label: 'Все локации' },
  { id: 'smithy', label: '🔨 Кузница' },
  { id: 'tavern-1', label: '🍺 Таверна' },
  { id: 'herbalist', label: '🌿 Травница' },
  { id: 'alchemist', label: '⚗️ Алхимик' },
  { id: 'shop-1', label: '📚 Книжная' },
  { id: 'temple', label: '⛪ Храм' },
  { id: 'shop-2', label: '💎 Ювелир' },
  { id: 'shop-4', label: '🏪 Лавка Брона' },
];

let itemsPage = 1;
let itemsTypeFilter = '';
let itemsRarityFilter = '';
let itemsShopFilter = '';
let itemsSearch = '';
let itemsCraftFilter = '';

async function loadItemsPanel(el: HTMLElement) {
  const params = new URLSearchParams({ page: String(itemsPage), limit: '50' });
  if (itemsTypeFilter) params.set('type', itemsTypeFilter);
  if (itemsRarityFilter) params.set('rarity', itemsRarityFilter);
  if (itemsShopFilter) params.set('shopLocation', itemsShopFilter);
  if (itemsSearch) params.set('search', itemsSearch);
  if (itemsCraftFilter) params.set('isCraftable', itemsCraftFilter);

  const data = await apiFetch(`/api/admin/game/items?${params}`);
  const items = data.data || data.items || [];
  const total = data.total || items.length;
  const pages = data.pages || Math.ceil(total / 50);

  const rarityColors: Record<string, string> = {
    common: '#9D9D9D', uncommon: '#1EFF00', rare: '#0070FF', epic: '#A335EE', legendary: '#FF8000',
  };

  el.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">🎒 Предметы (${total})</h2>
      <button class="btn-add" id="btn-add-item">+ Добавить</button>
    </div>

    <!-- Filters -->
    <div class="items-filters">
      <input type="text" class="items-search" id="items-search" placeholder="Поиск по названию..." value="${escHtml(itemsSearch)}" />
      <select class="items-filter" id="items-type-filter">
        ${ITEM_TYPES.map(t => `<option value="${t.id}" ${itemsTypeFilter === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <select class="items-filter" id="items-rarity-filter">
        ${ITEM_RARITIES.map(r => `<option value="${r.id}" ${itemsRarityFilter === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
      <select class="items-filter" id="items-shop-filter">
        ${ITEM_SHOPS.map(s => `<option value="${s.id}" ${itemsShopFilter === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select class="items-filter" id="items-craft-filter">
        <option value="" ${!itemsCraftFilter ? 'selected' : ''}>Все предметы</option>
        <option value="true" ${itemsCraftFilter === 'true' ? 'selected' : ''}>🔨 Только крафтовые</option>
        <option value="false" ${itemsCraftFilter === 'false' ? 'selected' : ''}>📦 Только обычные</option>
      </select>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:36px">Фото</th>
            <th>Название</th>
            <th>Тип</th>
            <th>Редкость</th>
            <th>Локация</th>
            <th>Стат</th>
            <th style="width:100px">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item: any) => {
            const rc = rarityColors[item.rarity] || '#9D9D9D';
            const shopName = ITEM_SHOPS.find(s => s.id === item.shopLocation)?.label || item.shopLocation || '—';
            const typeName = ITEM_TYPES.find(t => t.id === item.type)?.label || item.type || '—';
            const stat = item.damage?.die ? `⚔${item.damage.die}${item.damage.bonus ? '+' + item.damage.bonus : ''}` : item.stats?.armor ? `🛡+${item.stats.armor}` : item.effect?.heal ? `❤+${item.effect.heal}` : '—';
            return `<tr>
              <td>${item.img ? `<img src="${item.img}" style="width:28px;height:28px;object-fit:contain;border-radius:3px" />` : '📦'}</td>
              <td><strong style="color:${rc}">${item.name}</strong>${item.isCraftable ? ` <span style="font-size:0.6rem;background:rgba(246,200,109,0.15);color:var(--gold);padding:1px 5px;border-radius:3px">🔨 крафт${item.craftLimit > 0 ? ` ${item.craftCount || 0}/${item.craftLimit}` : ''}</span>` : ''}<br><span style="font-size:0.7rem;color:var(--text-muted)">${item.itemId}</span></td>
              <td style="font-size:0.78rem">${typeName}</td>
              <td style="color:${rc};font-size:0.78rem">${item.rarity || '—'}</td>
              <td style="font-size:0.72rem">${shopName}</td>
              <td style="font-size:0.78rem">${stat}</td>
              <td>
                <button class="btn-sm btn-edit" data-id="${item._id}">✏</button>
                <button class="btn-sm btn-del" data-id="${item._id}">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    ${pages > 1 ? `
    <div class="items-pagination">
      ${Array.from({ length: pages }, (_, i) => i + 1).map(p =>
        `<button class="page-btn ${p === itemsPage ? 'page-btn--active' : ''}" data-page="${p}">${p}</button>`
      ).join('')}
    </div>
    ` : ''}
  `;

  // Filter handlers
  let searchTimer: any;
  document.getElementById('items-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      itemsSearch = (e.target as HTMLInputElement).value;
      itemsPage = 1;
      loadItemsPanel(el);
    }, 300);
  });

  document.getElementById('items-type-filter')?.addEventListener('change', (e) => {
    itemsTypeFilter = (e.target as HTMLSelectElement).value;
    itemsPage = 1;
    loadItemsPanel(el);
  });

  document.getElementById('items-rarity-filter')?.addEventListener('change', (e) => {
    itemsRarityFilter = (e.target as HTMLSelectElement).value;
    itemsPage = 1;
    loadItemsPanel(el);
  });

  document.getElementById('items-shop-filter')?.addEventListener('change', (e) => {
    itemsShopFilter = (e.target as HTMLSelectElement).value;
    itemsPage = 1;
    loadItemsPanel(el);
  });

  document.getElementById('items-craft-filter')?.addEventListener('change', (e) => {
    itemsCraftFilter = (e.target as HTMLSelectElement).value;
    itemsPage = 1;
    loadItemsPanel(el);
  });

  // Pagination
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      itemsPage = parseInt((btn as HTMLElement).dataset.page!);
      loadItemsPanel(el);
    });
  });

  // Add button
  document.getElementById('btn-add-item')?.addEventListener('click', () => {
    openEditModal('/api/admin/game/items', FIELDS_ITEM, null, 'Предмет');
  });

  // Edit/Delete
  el.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      const item = items.find((i: any) => i._id === id);
      if (item) openEditModal('/api/admin/game/items', FIELDS_ITEM, item, 'Предмет');
    });
  });

  el.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить предмет?')) return;
      const id = (btn as HTMLElement).dataset.id;
      try {
        await apiFetch(`/api/admin/game/items/${id}`, { method: 'DELETE' });
        // Remove row immediately for instant feedback
        (btn as HTMLElement).closest('tr')?.remove();
      } catch (err: any) {
        alert('Ошибка удаления: ' + (err.error || JSON.stringify(err)));
      }
    });
  });
}

// ===========================
// READONLY TABLE
// ===========================
async function loadReadonlyTable(el: HTMLElement, url: string, title: string, cols: string[], dataKey: string) {
  const data = await apiFetch(url);
  const items = data[dataKey] || data.items || [];
  el.innerHTML = `
    <h2 class="page-title">${title} (${data.total || items.length})</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${items.map((item: any) => `
          <tr>${cols.map(c => {
            let val = item[c];
            if (Array.isArray(val)) val = val.length;
            if (typeof val === 'boolean') val = val ? '✅' : '❌';
            if (c.includes('Kopecks') || c === 'amountKopecks') val = val != null ? `${(val / 100).toFixed(0)} ₽` : '—';
            return `<td>${val ?? '—'}</td>`;
          }).join('')}</tr>
        `).join('')}</tbody>
      </table>
    </div>
  `;
}

// ===========================
// METRICS
// ===========================
async function loadMetrics(el: HTMLElement) {
  const data = await apiFetch('/api/admin/metrics?period=7d');
  el.innerHTML = `
    <h2 class="page-title">📈 Метрика (7 дней)</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${data.totalViews}</div><div class="stat-label">Просмотров</div></div>
      <div class="stat-card"><div class="stat-value">${data.uniqueVisitors}</div><div class="stat-label">Уникальных</div></div>
    </div>
  `;
}

// ===========================
// EDIT MODAL
// ===========================
function openEditModal(apiUrl: string, fields: FieldDef[], item: any | null, title: string) {
  const isNew = !item;
  const modal = document.getElementById('modal-container')!;
  const overlay = document.getElementById('modal-overlay')!;

  modal.innerHTML = `
    <div class="modal-header">
      <h3>${isNew ? 'Создать' : 'Редактировать'}: ${title}</h3>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <form id="edit-form" class="edit-form">
      ${fields.map(f => {
        const val = item?.[f.key];
        switch (f.type) {
          case 'text':
            // Add upload button for image URL fields
            const isImgField = f.key === 'img' || f.key === 'bgImage' || f.key === 'tokenImg' || f.key === 'npcImg';
            return `<div class="form-group">
              <label>${f.label}${f.required ? ' *' : ''}</label>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="text" name="${f.key}" value="${escHtml(String(val ?? ''))}" ${f.required ? 'required' : ''} style="flex:1" />
                ${isImgField ? `<label class="btn-upload" style="cursor:pointer;padding:6px 12px;background:rgba(246,200,109,0.15);border:1px solid rgba(246,200,109,0.3);border-radius:4px;color:var(--gold);font-size:0.75rem;white-space:nowrap">
                  📷 Загрузить
                  <input type="file" accept="image/*" class="img-upload-input" data-target="${f.key}" style="display:none" />
                </label>` : ''}
              </div>
              ${isImgField && val ? `<img src="${val}" style="max-width:80px;max-height:80px;margin-top:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1)" />` : ''}
            </div>`;
          case 'number':
            return `<div class="form-group">
              <label>${f.label}</label>
              <input type="number" name="${f.key}" value="${val ?? ''}" />
            </div>`;
          case 'textarea':
            return `<div class="form-group">
              <label>${f.label}</label>
              <textarea name="${f.key}" rows="3">${escHtml(String(val ?? ''))}</textarea>
            </div>`;
          case 'select':
            return `<div class="form-group">
              <label>${f.label}${f.required ? ' *' : ''}</label>
              <select name="${f.key}">${(f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select>
            </div>`;
          case 'checkbox':
            return `<div class="form-group form-group-check">
              <label><input type="checkbox" name="${f.key}" ${val ? 'checked' : ''} /> ${f.label}</label>
            </div>`;
          case 'json':
            return `<div class="form-group">
              <label>${f.label}</label>
              <textarea name="${f.key}" rows="5" class="json-editor">${val != null ? JSON.stringify(val, null, 2) : ''}</textarea>
            </div>`;
          case 'craft-ingredients': {
            const ings = Array.isArray(val) ? val : [];
            return `<div class="form-group">
              <label>${f.label}</label>
              <div class="craft-ings-editor" id="craft-ings-editor">
                <div class="craft-ings-list" id="craft-ings-list">
                  ${ings.map((ing: any, idx: number) => `
                    <div class="craft-ing-row" data-idx="${idx}">
                      <select class="craft-ing-select" data-idx="${idx}">
                        <option value="">Загрузка...</option>
                      </select>
                      <input type="number" class="craft-ing-qty" data-idx="${idx}" value="${ing.quantity || 1}" min="1" max="99" style="width:60px" />
                      <button type="button" class="btn-sm craft-ing-remove" data-idx="${idx}">✕</button>
                    </div>
                  `).join('')}
                </div>
                <button type="button" class="btn-sm" id="btn-add-craft-ing" style="margin-top:8px">+ Добавить ингредиент</button>
              </div>
              <input type="hidden" name="${f.key}" id="craft-ings-hidden" value='${JSON.stringify(ings)}' />
            </div>`;
          }
          case 'scenario-map':
            return `<div class="form-group">
              <label>${f.label}</label>
              <div class="scenario-map-controls">
                <button type="button" class="btn-sm" id="btn-load-scenario-map" onclick="window._loadScenarioMap && window._loadScenarioMap()">📥 Загрузить карту</button>
                <span class="scenario-map-status" id="scenario-map-status">Укажите ID карты выше и нажмите «Загрузить»</span>
              </div>
              <div class="sme-doc-upload">
                <label>📄 Загрузить документ сценария (txt/md — авторасстановка + реплики):</label>
                <input type="file" id="sme-doc-file" accept=".txt,.md,.doc,.docx" />
                <div id="sme-doc-status" class="sme-doc-status"></div>
              </div>
              <div class="scenario-map-legend">
                <button type="button" class="sme-brush active" data-brush="start" style="background:#3acc60">🟢 Старт</button>
                <button type="button" class="sme-brush" data-brush="monster" style="background:#ff4d4d">👹 Монстр</button>
                <button type="button" class="sme-brush" data-brush="questNpc" style="background:#22d3ee">🛡 Квестовый NPC</button>
                <button type="button" class="sme-brush" data-brush="npc" style="background:#5b8fff">🧑 Торговец</button>
                <button type="button" class="sme-brush" data-brush="chest" style="background:#f6c86d">📦 Сундук</button>
                <button type="button" class="sme-brush" data-brush="trap" style="background:#a855f7">⚡ Ловушка</button>
                <button type="button" class="sme-brush" data-brush="rune" style="background:#ff8c42">🔮 Руна</button>
                <button type="button" class="sme-brush" data-brush="erase" style="background:#555">✕ Стереть</button>
              </div>
              <div class="sme-entity-select" id="scenario-monster-select" style="display:none">
                <label>Выберите монстра: <select id="scenario-monster-type" class="sme-select"></select></label>
              </div>
              <div class="sme-entity-select" id="scenario-npc-name-wrap" style="display:none">
                <label>Имя NPC: <input type="text" id="scenario-npc-name" class="sme-input" placeholder="Имя торговца/NPC" value="Торговец" /></label>
              </div>
              <div class="sme-entity-select" id="scenario-quest-npc-wrap" style="display:none">
                <label>Имя квестового NPC: <input type="text" id="scenario-quest-npc-name" class="sme-input" placeholder="Пленник / Раненый воин" value="Пленник" /></label>
              </div>
              <div class="grid-canvas-wrap" id="scenario-map-wrap" style="max-height:500px">
                <div class="scenario-grid" id="scenario-map-grid" style="display:grid;gap:1px"></div>
              </div>
              <div class="sme-placed-list" id="sme-placed-list"></div>
            </div>`;
          case 'grid-editor': {
            const grid = val as any[][] || [];
            const h = grid.length || 10;
            const w = grid[0]?.length || 15;
            const cellTypes = f.key === 'roadMap'
              ? [{ v: 0, label: 'Пусто', color: '#1a1a1a' }, { v: 1, label: 'Дорога', color: '#8B7355' }, { v: 2, label: 'Бездорожье', color: '#4a5e3a' }]
              : [{ v: 0, label: 'Проходимо', color: '#3a3228' }, { v: 1, label: 'Стена', color: '#0a0806' }, { v: 2, label: 'С помехой', color: '#5a4d3a' }, { v: 3, label: 'Вода', color: '#1a3050' }, { v: 4, label: 'Огонь', color: '#8B2500' }];
            return `<div class="form-group">
              <label>${f.label}</label>
              <div class="grid-editor-controls">
                <label>Ширина: <input type="number" class="grid-width-input" data-grid="${f.key}" value="${w}" min="5" max="50" style="width:60px" /></label>
                <span class="grid-size-info" id="grid-info-${f.key}">${w}×${h} клеток</span>
                <span class="grid-brush-label">Кисть:</span>
                ${cellTypes.map((ct, i) => `<button type="button" class="grid-brush-btn ${i === 0 ? 'active' : ''}" data-grid="${f.key}" data-val="${ct.v}" style="background:${ct.color}" title="${ct.label}">${ct.label}</button>`).join('')}
              </div>
              <div class="grid-canvas-wrap">
                <div class="grid-canvas" id="grid-${f.key}" data-field="${f.key}" style="grid-template-columns:repeat(${w},18px);display:grid;gap:1px"></div>
              </div>
              <textarea name="${f.key}" class="grid-data-hidden" style="display:none">${val != null ? JSON.stringify(val) : '[]'}</textarea>
            </div>`;
          }
          default: return '';
        }
      }).join('')}
      <div class="form-group" style="margin-top:8px">
        <label>Загрузить изображение</label>
        <input type="file" id="upload-file" accept="image/*" />
        <div id="upload-result" style="font-size:0.75rem;color:var(--cta);margin-top:4px"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="modal-cancel">Отмена</button>
        <button type="submit" class="btn-primary">${isNew ? 'Создать' : 'Сохранить'}</button>
      </div>
    </form>
  `;

  overlay.style.display = 'flex';

  // === Grid editors ===
  initGridEditors(modal, item);

  // === Scenario map editor ===
  initScenarioMapEditor(modal, item, fields);

  // Upload handler
  document.getElementById('upload-file')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('/api/admin/game/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: fd });
      const data = await res.json();
      const resultEl = document.getElementById('upload-result')!;
      resultEl.textContent = `✅ ${data.url}`;
      // Auto-fill img field if exists
      const imgInput = modal.querySelector('input[name="img"], input[name="bgImage"]') as HTMLInputElement;
      if (imgInput) imgInput.value = data.url;
    } catch { document.getElementById('upload-result')!.textContent = '❌ Ошибка загрузки'; }
  });

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

  // === IMAGE UPLOAD HANDLERS ===
  document.querySelectorAll('.img-upload-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const targetField = (input as HTMLElement).dataset.target!;
      const textInput = document.querySelector(`input[name="${targetField}"]`) as HTMLInputElement;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const resp = await fetch('/api/admin/game/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` },
          body: formData,
        });
        const data = await resp.json();
        if (data.url) {
          textInput.value = data.url;
          // Update preview
          const preview = textInput.closest('.form-group')?.querySelector('img');
          if (preview) {
            (preview as HTMLImageElement).src = data.url;
          } else {
            const img = document.createElement('img');
            img.src = data.url;
            img.style.cssText = 'max-width:80px;max-height:80px;margin-top:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.1)';
            textInput.closest('.form-group')?.appendChild(img);
          }
        } else {
          alert('Ошибка загрузки: ' + (data.error || 'неизвестная'));
        }
      } catch { alert('Ошибка загрузки файла'); }
    });
  });

  // === CRAFT INGREDIENTS EDITOR ===
  setupCraftIngredientsEditor(item);

  document.getElementById('edit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const body: any = {};

    fields.forEach(f => {
      const el = form.elements.namedItem(f.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!el) return;
      if (f.type === 'checkbox') { body[f.key] = (el as HTMLInputElement).checked; }
      else if (f.type === 'number') { const v = el.value; body[f.key] = v !== '' ? Number(v) : undefined; }
      else if (f.type === 'scenario-map') { return; /* handled separately */ }
      else if (f.type === 'craft-ingredients') {
        const hidden = document.getElementById('craft-ings-hidden') as HTMLInputElement;
        if (hidden?.value) try { body[f.key] = JSON.parse(hidden.value); } catch {}
        return;
      }
      else if (f.type === 'json' || f.type === 'grid-editor') {
        try { if (el.value.trim()) body[f.key] = JSON.parse(el.value); } catch { alert(`Невалидный JSON в поле ${f.label}`); throw new Error('bad json'); }
      }
      else { body[f.key] = el.value; }
    });

    try {
      if (isNew) {
        await apiFetch(apiUrl, { method: 'POST', body: JSON.stringify(body) });
      } else {
        await apiFetch(`${apiUrl}/${item._id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      closeModal();
      loadPanel(currentPanel);
    } catch (err: any) {
      alert(err.error || 'Ошибка сохранения');
    }
  });
}

// ===========================
// CRAFT INGREDIENTS EDITOR
// ===========================
let _allItemsCache: any[] | null = null;

async function setupCraftIngredientsEditor(item: any) {
  const editor = document.getElementById('craft-ings-editor');
  if (!editor) return;

  // Load all items for dropdown
  if (!_allItemsCache) {
    try {
      const data = await apiFetch('/api/admin/game/items?limit=500&isCraftable=false');
      _allItemsCache = (data.data || data.items || []).sort((a: any, b: any) => a.name.localeCompare(b.name, 'ru'));
    } catch { _allItemsCache = []; }
  }

  const allItems = _allItemsCache!;
  let ingredients: any[] = Array.isArray(item?.craftIngredients) ? [...item.craftIngredients] : [];

  function renderIngredients() {
    const list = document.getElementById('craft-ings-list')!;
    list.innerHTML = ingredients.map((ing: any, idx: number) => `
      <div class="craft-ing-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <select class="craft-ing-select" data-idx="${idx}" style="flex:1;padding:6px;background:rgba(0,0,0,0.3);border:1px solid var(--panel-border);border-radius:4px;color:var(--text);font-size:0.82rem">
          <option value="">— Выберите предмет —</option>
          ${allItems.map((it: any) => `<option value="${it.itemId}" ${ing.itemId === it.itemId ? 'selected' : ''}>${it.name} (${it.rarity})</option>`).join('')}
        </select>
        <input type="number" class="craft-ing-qty" data-idx="${idx}" value="${ing.quantity || 1}" min="1" max="99" style="width:55px;padding:6px;background:rgba(0,0,0,0.3);border:1px solid var(--panel-border);border-radius:4px;color:var(--text);text-align:center" />
        <button type="button" class="craft-ing-remove" data-idx="${idx}" style="background:rgba(255,77,77,0.15);border:1px solid rgba(255,77,77,0.3);color:#ff6b6b;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.8rem">✕</button>
      </div>
    `).join('');

    // Handlers
    list.querySelectorAll('.craft-ing-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt((sel as HTMLElement).dataset.idx!);
        const itemId = (e.target as HTMLSelectElement).value;
        const found = allItems.find((it: any) => it.itemId === itemId);
        ingredients[idx] = { itemId, name: found?.name || itemId, quantity: ingredients[idx]?.quantity || 1 };
        syncHidden();
      });
    });

    list.querySelectorAll('.craft-ing-qty').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt((inp as HTMLElement).dataset.idx!);
        ingredients[idx].quantity = parseInt((e.target as HTMLInputElement).value) || 1;
        syncHidden();
      });
    });

    list.querySelectorAll('.craft-ing-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        ingredients.splice(idx, 1);
        renderIngredients();
        syncHidden();
      });
    });
  }

  function syncHidden() {
    const hidden = document.getElementById('craft-ings-hidden') as HTMLInputElement;
    if (hidden) hidden.value = JSON.stringify(ingredients);
  }

  // Add button
  document.getElementById('btn-add-craft-ing')?.addEventListener('click', () => {
    ingredients.push({ itemId: '', name: '', quantity: 1 });
    renderIngredients();
    syncHidden();
  });

  // Initial render
  renderIngredients();
  syncHidden();
}

// ===========================
// GRANT MODAL
// ===========================
function openGrantModal(userId: string, userName: string) {
  const modal = document.getElementById('modal-container')!;
  const overlay = document.getElementById('modal-overlay')!;
  modal.innerHTML = `
    <div class="modal-header">
      <h3>💰 Выдать ресурсы: ${userName}</h3>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <form id="grant-form" class="edit-form">
      <div class="form-group"><label>Золото</label><input type="number" name="gold" value="0" /></div>
      <div class="form-group"><label>Серебро</label><input type="number" name="silver" value="0" /></div>
      <div class="form-group"><label>Слоты героев</label><input type="number" name="heroSlots" value="0" /></div>
      <div class="form-group"><label>Причина</label><input type="text" name="reason" value="Admin grant" /></div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="modal-cancel">Отмена</button>
        <button type="submit" class="btn-primary">Выдать</button>
      </div>
    </form>
  `;
  overlay.style.display = 'flex';
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('grant-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const body = {
      gold: Number((f.elements.namedItem('gold') as HTMLInputElement).value) || 0,
      silver: Number((f.elements.namedItem('silver') as HTMLInputElement).value) || 0,
      heroSlots: Number((f.elements.namedItem('heroSlots') as HTMLInputElement).value) || 0,
      reason: (f.elements.namedItem('reason') as HTMLInputElement).value,
    };
    try {
      await apiFetch(`/api/admin/users/${userId}/grant`, { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      loadPanel(currentPanel);
    } catch (err: any) { alert(err.error || 'Ошибка'); }
  });
}

// ===========================
// GRID EDITOR
// ===========================
function initGridEditors(modal: HTMLElement, item: any | null) {
  const CELL_COLORS_MAP: Record<number, string> = { 0: '#3a3228', 1: '#0a0806', 2: '#5a4d3a', 3: '#1a3050' };
  const CELL_COLORS_ROAD: Record<number, string> = { 0: '#1a1a1a', 1: '#8B7355', 2: '#4a5e3a' };

  modal.querySelectorAll('.grid-canvas').forEach(canvasEl => {
    const fieldKey = (canvasEl as HTMLElement).dataset.field!;
    const isRoad = fieldKey === 'roadMap';
    const colors = isRoad ? CELL_COLORS_ROAD : CELL_COLORS_MAP;
    const hiddenTextarea = modal.querySelector(`textarea[name="${fieldKey}"]`) as HTMLTextAreaElement;

    // Parse existing data
    let gridData: number[][] = [];
    try { gridData = JSON.parse(hiddenTextarea.value || '[]'); } catch { gridData = []; }

    const widthInput = modal.querySelector(`.grid-width-input[data-grid="${fieldKey}"]`) as HTMLInputElement;
    let width = parseInt(widthInput?.value || '15');
    let height = gridData.length || Math.ceil(width * 0.75); // auto-height based on aspect ratio

    // Ensure grid has proper dimensions
    if (!gridData.length || gridData[0]?.length !== width) {
      gridData = buildGrid(width, height, gridData);
    }
    height = gridData.length;

    let currentBrush = 0;
    let isDrawing = false;

    // Get background image from form
    const bgInput = modal.querySelector('input[name="bgImage"]') as HTMLInputElement;
    const wrapEl = canvasEl.parentElement as HTMLElement;
    let cellOpacity = 0.55;

    function applyBgImage() {
      const bgUrl = bgInput?.value || '';
      if (bgUrl && wrapEl) {
        wrapEl.style.backgroundImage = `url(${bgUrl})`;
        wrapEl.style.backgroundSize = '100% 100%';
        wrapEl.style.backgroundPosition = 'center';
        wrapEl.style.backgroundRepeat = 'no-repeat';
      } else if (wrapEl) {
        wrapEl.style.backgroundImage = '';
      }
    }
    applyBgImage();
    bgInput?.addEventListener('input', applyBgImage);

    // Opacity control — add slider dynamically
    const opacityWrap = document.createElement('div');
    opacityWrap.className = 'grid-editor-controls';
    opacityWrap.innerHTML = `<label>Прозрачность сетки: <input type="range" min="0" max="100" value="${Math.round(cellOpacity*100)}" class="grid-opacity-slider" data-grid="${fieldKey}" style="width:100px" /> <span class="opacity-val">${Math.round(cellOpacity*100)}%</span></label>`;
    canvasEl.parentElement?.parentElement?.insertBefore(opacityWrap, canvasEl.parentElement);
    const opacitySlider = opacityWrap.querySelector('.grid-opacity-slider') as HTMLInputElement;
    const opacityLabel = opacityWrap.querySelector('.opacity-val') as HTMLElement;
    opacitySlider?.addEventListener('input', () => {
      cellOpacity = parseInt(opacitySlider.value) / 100;
      opacityLabel.textContent = `${opacitySlider.value}%`;
      (canvasEl as HTMLElement).style.opacity = String(cellOpacity);
    });

    // Render grid
    function renderGrid() {
      const el = canvasEl as HTMLElement;
      const cellSize = 22;
      el.style.gridTemplateColumns = `repeat(${width}, ${cellSize}px)`;
      el.style.opacity = String(cellOpacity);
      el.innerHTML = '';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const val = gridData[y]?.[x] || 0;
          const cell = document.createElement('div');
          cell.className = 'ge-cell';
          cell.style.background = colors[val] || colors[0];
          cell.style.width = cellSize + 'px';
          cell.style.height = cellSize + 'px';
          cell.dataset.x = String(x);
          cell.dataset.y = String(y);

          cell.addEventListener('mousedown', (e) => { e.preventDefault(); isDrawing = true; paintCell(x, y); });
          cell.addEventListener('mouseenter', () => { if (isDrawing) paintCell(x, y); });
          el.appendChild(cell);
        }
      }
      const info = modal.querySelector(`#grid-info-${fieldKey}`);
      if (info) info.textContent = `${width}×${height} клеток`;
      hiddenTextarea.value = JSON.stringify(gridData);
      applyBgImage();
    }

    function paintCell(x: number, y: number) {
      if (!gridData[y]) return;
      gridData[y][x] = currentBrush;
      const cell = canvasEl.querySelector(`[data-x="${x}"][data-y="${y}"]`) as HTMLElement;
      if (cell) cell.style.background = colors[currentBrush] || colors[0];
      hiddenTextarea.value = JSON.stringify(gridData);
    }

    // Mouse up globally
    document.addEventListener('mouseup', () => { isDrawing = false; });

    // Brush buttons
    modal.querySelectorAll(`.grid-brush-btn[data-grid="${fieldKey}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        currentBrush = parseInt((btn as HTMLElement).dataset.val || '0');
        modal.querySelectorAll(`.grid-brush-btn[data-grid="${fieldKey}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Width change → resize grid, auto-calculate height
    widthInput?.addEventListener('change', () => {
      const newWidth = Math.max(5, Math.min(50, parseInt(widthInput.value) || 15));
      width = newWidth;
      height = Math.max(5, Math.ceil(width * 0.75)); // 4:3 aspect ratio
      gridData = buildGrid(width, height, gridData);
      renderGrid();
    });

    renderGrid();
  });
}

function buildGrid(w: number, h: number, old: number[][]): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(old[y]?.[x] ?? 0);
    }
    grid.push(row);
  }
  return grid;
}

// ===========================
// SCENARIO MAP EDITOR
// ===========================
function initScenarioMapEditor(modal: HTMLElement, item: any | null, fields: FieldDef[]) {
  const loadBtn = modal.querySelector('#btn-load-scenario-map');
  const gridEl = modal.querySelector('#scenario-map-grid') as HTMLElement;
  const wrapEl = modal.querySelector('#scenario-map-wrap') as HTMLElement;
  const statusEl = modal.querySelector('#scenario-map-status') as HTMLElement;
  const monsterSelectWrap = modal.querySelector('#scenario-monster-select') as HTMLElement;
  const monsterTypeSelect = modal.querySelector('#scenario-monster-type') as HTMLSelectElement;
  const npcNameWrap = modal.querySelector('#scenario-npc-name-wrap') as HTMLElement;
  const npcNameInput = modal.querySelector('#scenario-npc-name') as HTMLInputElement;
  const questNpcWrap = modal.querySelector('#scenario-quest-npc-wrap') as HTMLElement;
  const questNpcNameInput = modal.querySelector('#scenario-quest-npc-name') as HTMLInputElement;
  const placedListEl = modal.querySelector('#sme-placed-list') as HTMLElement;
  const docFileInput = modal.querySelector('#sme-doc-file') as HTMLInputElement;
  const docStatusEl = modal.querySelector('#sme-doc-status') as HTMLElement;
  if (!loadBtn || !gridEl) return;

  type PlacedEntity = { x: number; y: number; type: string; monsterType?: string; label?: string; dialog?: string };
  let placements: PlacedEntity[] = [];
  let currentBrush = 'start';
  let mapData: number[][] = [];
  let mapWidth = 0;
  let mapHeight = 0;
  let isDrawing = false;
  let monstersLoaded: any[] = [];

  // Restore existing placements
  if (item) {
    const zones = item.zones || {};
    (zones.startZone || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'start' }));
    (zones.chests || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'chest' }));
    (zones.traps || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'trap' }));
    (zones.runes || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'rune' }));
    (zones.questNpcs || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'questNpc', label: p.name, dialog: p.dialog }));
    (item.monsterPool || []).forEach((m: any) => {
      (m.positions || []).forEach((p: any) => placements.push({ x: p.x, y: p.y, type: 'monster', monsterType: m.type }));
    });
    (item.friendlyNpcs || []).forEach((n: any) => {
      if (n.x != null) placements.push({ x: n.x, y: n.y, type: 'npc', label: n.name, dialog: n.dialog });
    });
    (item.traders || []).forEach((n: any) => {
      if (n.x != null) placements.push({ x: n.x, y: n.y, type: 'npc', label: n.name, dialog: n.dialog });
    });
  }

  // Brush selection
  modal.querySelectorAll('.sme-brush').forEach(btn => {
    btn.addEventListener('click', () => {
      currentBrush = (btn as HTMLElement).dataset.brush!;
      modal.querySelectorAll('.sme-brush').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      monsterSelectWrap.style.display = currentBrush === 'monster' ? 'block' : 'none';
      npcNameWrap.style.display = currentBrush === 'npc' ? 'block' : 'none';
      questNpcWrap.style.display = currentBrush === 'questNpc' ? 'block' : 'none';
    });
  });

  // Document upload for scenario auto-fill
  docFileInput?.addEventListener('change', async () => {
    const file = docFileInput.files?.[0];
    if (!file) return;
    docStatusEl.textContent = '⏳ Обработка документа...';
    try {
      const text = await file.text();
      parseScenarioDocument(text);
      docStatusEl.textContent = `✅ Документ загружен: ${file.name}`;
    } catch (err) {
      docStatusEl.textContent = '❌ Ошибка чтения файла';
    }
  });

  function parseScenarioDocument(text: string) {
    // Auto-fill form fields from document
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Try to extract name
    const nameMatch = text.match(/(?:Название|Name|Сценарий)[:\s]*(.+)/i);
    if (nameMatch) {
      const nameInput = modal.querySelector('input[name="name"]') as HTMLInputElement;
      if (nameInput && !nameInput.value) nameInput.value = nameMatch[1].trim();
    }

    // Description
    const descMatch = text.match(/(?:Описание|Description)[:\s]*(.+)/i);
    if (descMatch) {
      const descInput = modal.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
      if (descInput && !descInput.value) descInput.value = descMatch[1].trim();
    }

    // Intro narration — look for section
    const introMatch = text.match(/(?:Вступление|Intro|Нарратив|Narration)[:\s]*\n?([\s\S]*?)(?:\n\n|\n#|$)/i);
    if (introMatch) {
      const introInput = modal.querySelector('textarea[name="introNarration"]') as HTMLTextAreaElement;
      if (introInput && !introInput.value) introInput.value = introMatch[1].trim();
    }

    // Parse monster placements: "Гоблин: x=5 y=3" or "goblin (5,3)"
    const monsterRegex = /(?:Монстр|Monster)[:\s]*(\w[\w\-]*)\s*(?:at|на|pos|@)\s*\(?(\d+)[,;\s]+(\d+)\)?/gi;
    let mm;
    while ((mm = monsterRegex.exec(text)) !== null) {
      const existing = placements.find(p => p.x === parseInt(mm[2]) && p.y === parseInt(mm[3]));
      if (!existing) {
        placements.push({ x: parseInt(mm[2]), y: parseInt(mm[3]), type: 'monster', monsterType: mm[1].toLowerCase() });
      }
    }

    // Parse start positions: "Старт: (2,14)" or "Start: 2,14"
    const startRegex = /(?:Старт|Start|Spawn)[:\s]*\(?(\d+)[,;\s]+(\d+)\)?/gi;
    let sm;
    while ((sm = startRegex.exec(text)) !== null) {
      const existing = placements.find(p => p.x === parseInt(sm[1]) && p.y === parseInt(sm[2]));
      if (!existing) {
        placements.push({ x: parseInt(sm[1]), y: parseInt(sm[2]), type: 'start' });
      }
    }

    // Parse NPC: "NPC: Торговец at (3,2) - Добро пожаловать!"
    const npcRegex = /(?:NPC|НПС|Торговец|Trader)[:\s]*(\S+)\s*(?:at|на|@)\s*\(?(\d+)[,;\s]+(\d+)\)?(?:\s*[-–]\s*(.+))?/gi;
    let nm;
    while ((nm = npcRegex.exec(text)) !== null) {
      const existing = placements.find(p => p.x === parseInt(nm[2]) && p.y === parseInt(nm[3]));
      if (!existing) {
        placements.push({ x: parseInt(nm[2]), y: parseInt(nm[3]), type: 'npc', label: nm[1], dialog: nm[4]?.trim() });
      }
    }

    // Parse quest NPC: "Квестовый NPC: Пленник at (8,5)"
    const questRegex = /(?:Квестовый|Quest|Спасти|Rescue)[:\s]*(\S+)\s*(?:at|на|@)\s*\(?(\d+)[,;\s]+(\d+)\)?(?:\s*[-–]\s*(.+))?/gi;
    let qm;
    while ((qm = questRegex.exec(text)) !== null) {
      const existing = placements.find(p => p.x === parseInt(qm[2]) && p.y === parseInt(qm[3]));
      if (!existing) {
        placements.push({ x: parseInt(qm[2]), y: parseInt(qm[3]), type: 'questNpc', label: qm[1], dialog: qm[4]?.trim() });
      }
    }

    // Parse briefing
    const briefMatch = text.match(/(?:Брифинг|Briefing|Миссия|Mission)[:\s]*\n?([\s\S]*?)(?:\n\n|\n#|$)/i);
    if (briefMatch) {
      const briefField = modal.querySelector('textarea[name="briefing"]') as HTMLTextAreaElement;
      if (briefField && !briefField.value) {
        briefField.value = JSON.stringify({ text: briefMatch[1].trim() }, null, 2);
      }
    }

    // Parse objectives
    const objMatch = text.match(/(?:Цели|Objectives|Задачи)[:\s]*\n?([\s\S]*?)(?:\n\n|\n#|$)/i);
    if (objMatch) {
      const objField = modal.querySelector('textarea[name="objectives"]') as HTMLTextAreaElement;
      if (objField && !objField.value) {
        const objectives = objMatch[1].split('\n').filter((l: string) => l.trim()).map((l: string) => l.replace(/^[-*•]\s*/, '').trim());
        objField.value = JSON.stringify({ primary: objectives }, null, 2);
      }
    }

    if (mapWidth > 0) renderScenarioGrid();
    syncPlacementsToForm();
    updatePlacedList();
  }

  // Load map
  async function loadMapForScenario() {
    const mapIdInput = modal.querySelector('input[name="mapId"]') as HTMLInputElement;
    const mapId = mapIdInput?.value?.trim();
    if (!mapId) { statusEl.textContent = '❌ Введите ID карты'; return; }

    statusEl.textContent = '⏳ Загрузка...';
    try {
      const maps = await apiFetch(`/api/admin/game/maps?search=${encodeURIComponent(mapId)}`);
      const map = (maps.items || []).find((m: any) => m.mapId === mapId);
      if (!map) { statusEl.textContent = '❌ Карта не найдена'; return; }

      mapData = map.mapData || [];
      mapHeight = mapData.length;
      mapWidth = mapData[0]?.length || 0;

      if (map.bgImage && wrapEl) {
        wrapEl.style.backgroundImage = `url(${map.bgImage})`;
        wrapEl.style.backgroundSize = '100% 100%';
      }

      // Load monsters for dropdown
      const monstersData = await apiFetch('/api/admin/game/monsters');
      monstersLoaded = monstersData.items || [];
      monsterTypeSelect.innerHTML = monstersLoaded.map((m: any) =>
        `<option value="${m.type}">${m.name} (${m.type}) HP:${m.hp} ATK:${m.attack}</option>`
      ).join('');

      statusEl.textContent = `✅ ${map.name} — ${mapWidth}×${mapHeight}`;
      renderScenarioGrid();
      updatePlacedList();
    } catch (err: any) {
      statusEl.textContent = `❌ ${err.error || 'Ошибка загрузки'}`;
    }
  }

  loadBtn.addEventListener('click', loadMapForScenario);
  (window as any)._loadScenarioMap = loadMapForScenario;

  function renderScenarioGrid() {
    const cellSize = 24;
    gridEl.style.gridTemplateColumns = `repeat(${mapWidth}, ${cellSize}px)`;
    gridEl.style.opacity = '0.7';
    gridEl.innerHTML = '';

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const cellVal = mapData[y]?.[x] || 0;
        const isWall = cellVal === 1;
        const cell = document.createElement('div');
        cell.className = `ge-cell ${isWall ? 'sme-wall' : 'sme-floor'}`;
        cell.style.width = cellSize + 'px';
        cell.style.height = cellSize + 'px';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);

        const placed = placements.find(p => p.x === x && p.y === y);
        if (placed) {
          cell.innerHTML = getPlacementIcon(placed);
          cell.classList.add(`sme-placed-${placed.type}`);
        }

        cell.addEventListener('mousedown', (e) => { e.preventDefault(); isDrawing = true; handleClick(x, y); });
        cell.addEventListener('mouseenter', () => { if (isDrawing) handleClick(x, y); });
        gridEl.appendChild(cell);
      }
    }
    document.addEventListener('mouseup', () => { isDrawing = false; });
    syncPlacementsToForm();
  }

  function handleClick(x: number, y: number) {
    if (currentBrush === 'erase') {
      placements = placements.filter(p => !(p.x === x && p.y === y));
    } else {
      const cellVal = mapData[y]?.[x] || 0;
      if (cellVal === 1 && currentBrush !== 'erase') return;
      placements = placements.filter(p => !(p.x === x && p.y === y));
      const entity: PlacedEntity = { x, y, type: currentBrush };
      if (currentBrush === 'monster') {
        entity.monsterType = monsterTypeSelect?.value || 'goblin';
        const m = monstersLoaded.find(m => m.type === entity.monsterType);
        entity.label = m?.name || entity.monsterType;
      }
      if (currentBrush === 'npc') {
        entity.label = npcNameInput?.value || 'Торговец';
      }
      if (currentBrush === 'questNpc') {
        entity.label = questNpcNameInput?.value || 'Пленник';
      }
      placements.push(entity);
    }
    renderScenarioGrid();
    updatePlacedList();
  }

  function getPlacementIcon(p: PlacedEntity): string {
    const icons: Record<string, string> = {
      start: '🟢', monster: '👹', npc: '🧑', questNpc: '🛡', chest: '📦', trap: '⚡', rune: '🔮',
    };
    const title = p.label || p.monsterType || p.type;
    return `<span class="sme-icon" title="${title}">${icons[p.type] || '❓'}</span>`;
  }

  function updatePlacedList() {
    if (!placedListEl) return;
    const grouped: Record<string, PlacedEntity[]> = {};
    placements.forEach(p => { if (!grouped[p.type]) grouped[p.type] = []; grouped[p.type].push(p); });

    const typeLabels: Record<string, string> = {
      start: '🟢 Старт игроков', monster: '👹 Монстры', npc: '🧑 Торговцы',
      questNpc: '🛡 Квестовые NPC', chest: '📦 Сундуки', trap: '⚡ Ловушки', rune: '🔮 Руны',
    };

    let html = '<div class="sme-summary"><strong>Расставлено:</strong>';
    for (const [type, items] of Object.entries(grouped)) {
      html += `<div class="sme-summary-row">${typeLabels[type] || type}: `;
      html += items.map(p => {
        const detail = p.monsterType || p.label || '';
        return `<span class="sme-tag">(${p.x},${p.y})${detail ? ' ' + detail : ''}</span>`;
      }).join(' ');
      html += '</div>';
    }
    html += '</div>';
    placedListEl.innerHTML = placements.length ? html : '<div class="sme-summary" style="color:var(--text-dim)">Нет объектов на карте</div>';
  }

  function syncPlacementsToForm() {
    const startZone = placements.filter(p => p.type === 'start').map(p => ({ x: p.x, y: p.y }));
    const chests = placements.filter(p => p.type === 'chest').map(p => ({ x: p.x, y: p.y }));
    const traps = placements.filter(p => p.type === 'trap').map(p => ({ x: p.x, y: p.y }));
    const runes = placements.filter(p => p.type === 'rune').map(p => ({ x: p.x, y: p.y }));
    const questNpcs = placements.filter(p => p.type === 'questNpc').map(p => ({ x: p.x, y: p.y, name: p.label || 'Пленник', dialog: p.dialog || '' }));

    const monstersByType: Record<string, { x: number; y: number }[]> = {};
    placements.filter(p => p.type === 'monster').forEach(p => {
      const t = p.monsterType || 'unknown';
      if (!monstersByType[t]) monstersByType[t] = [];
      monstersByType[t].push({ x: p.x, y: p.y });
    });
    const monsterPool = Object.entries(monstersByType).map(([type, positions]) => ({ type, positions }));

    const friendlyNpcs = placements.filter(p => p.type === 'npc').map(p => ({ x: p.x, y: p.y, name: p.label || 'NPC', dialog: p.dialog || '' }));

    const zonesField = modal.querySelector('textarea[name="zones"]') as HTMLTextAreaElement;
    const mpField = modal.querySelector('textarea[name="monsterPool"]') as HTMLTextAreaElement;
    const npcField = modal.querySelector('textarea[name="friendlyNpcs"]') as HTMLTextAreaElement;
    const tradersField = modal.querySelector('textarea[name="traders"]') as HTMLTextAreaElement;

    const zones: any = {};
    try { Object.assign(zones, JSON.parse(zonesField?.value || '{}')); } catch {}
    zones.startZone = startZone;
    zones.chests = chests;
    zones.traps = traps;
    zones.runes = runes;
    zones.questNpcs = questNpcs;

    if (zonesField) zonesField.value = JSON.stringify(zones, null, 2);
    if (mpField) mpField.value = JSON.stringify(monsterPool, null, 2);
    if (npcField) npcField.value = JSON.stringify(friendlyNpcs, null, 2);
    if (tradersField) tradersField.value = JSON.stringify(friendlyNpcs, null, 2);
  }

  if (item?.mapId) {
    setTimeout(() => loadMapForScenario(), 500);
  }
}

function closeModal() {
  document.getElementById('modal-overlay')!.style.display = 'none';
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatCellValue(val: any, field: FieldDef): string {
  if (val == null) return '—';
  if (typeof val === 'boolean') return val ? '✅' : '❌';
  if (field.key === 'priceKopecks' || field.key === 'amountKopecks') return `${(val / 100).toFixed(0)} ₽`;
  if (Array.isArray(val)) return String(val.length);
  return String(val);
}

// ===========================
// STYLES
// ===========================
function addAdminStyles() {
  if (document.getElementById('admin-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-styles';
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; }

    .admin-auth-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg); }
    .admin-auth-card { background: var(--panel-solid); border: 1px solid var(--panel-border); border-radius: 12px; padding: 40px; max-width: 400px; width: 90%; }
    .admin-auth-card h2 { color: var(--gold); text-align: center; margin-bottom: 24px; font-family: 'Inter', sans-serif; }
    .admin-auth-card input { width: 100%; padding: 10px 14px; background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); border-radius: 6px; color: var(--text); font-size: 0.9rem; margin-bottom: 12px; }
    .admin-auth-card input:focus { border-color: rgba(201,162,78,0.4); outline: none; }
    .auth-error { color: var(--red); font-size: 0.8rem; margin-bottom: 12px; display: none; }

    .admin-layout { display: flex; min-height: 100vh; }
    .admin-sidebar { width: 220px; background: rgba(16,20,30,0.95); border-right: 1px solid var(--panel-border); padding: 16px; display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-title { color: var(--gold); margin-bottom: 24px; font-size: 1.1rem; }
    .sidebar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .nav-btn { background: none; border: none; color: var(--text-dim); text-align: left; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; transition: all 0.15s; font-family: 'Inter', sans-serif; }
    .nav-btn:hover { background: rgba(255,255,255,0.05); color: var(--text); }
    .nav-btn.active { background: var(--gold-bg); color: var(--gold); }
    .nav-separator { border-top: 1px solid var(--panel-border); margin: 12px 0; }
    .nav-section-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 12px; }
    .sidebar-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--panel-border); display: flex; flex-direction: column; gap: 8px; }
    .back-link { color: var(--text-dim); font-size: 0.8rem; text-decoration: none; }
    .back-link:hover { color: var(--text); }

    .admin-content { flex: 1; padding: 24px; overflow-y: auto; }

    .page-title { color: var(--gold); margin-bottom: 20px; font-size: 1.3rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }

    /* Items filters */
    .items-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .items-search { flex: 1; min-width: 200px; max-width: 300px; padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 6px; color: var(--text); font-size: 0.82rem; font-family: var(--font-body); }
    .items-search:focus { outline: none; border-color: var(--gold-dim); }
    .items-search::placeholder { color: var(--text-muted); }
    .items-filter { padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 6px; color: var(--text); font-size: 0.82rem; font-family: var(--font-body); cursor: pointer; }
    .items-filter:focus { outline: none; border-color: var(--gold-dim); }
    .items-filter option { background: #1a1d24; color: var(--text); }
    .items-pagination { display: flex; gap: 4px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
    .page-btn { background: var(--panel); border: 1px solid var(--panel-border); color: var(--text-dim); width: 32px; height: 32px; border-radius: 4px; cursor: pointer; font-size: 0.78rem; font-family: var(--font-body); }
    .page-btn:hover { border-color: var(--gold-dim); color: var(--text); }
    .page-btn--active { background: var(--gold-bg); color: var(--gold); border-color: var(--gold-dim); }
    .loading { color: var(--text-dim); padding: 40px; text-align: center; }
    .error { color: var(--red); }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .stat-card { background: var(--panel-solid); border: 1px solid var(--panel-border); border-radius: 10px; padding: 20px; text-align: center; }
    .stat-value { font-size: 1.8rem; color: var(--gold); font-weight: 700; }
    .stat-label { color: var(--text-dim); margin-top: 8px; font-size: 0.85rem; }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 8px 12px; color: var(--text-dim); font-size: 0.75rem; font-weight: 600; border-bottom: 1px solid var(--panel-border); text-transform: uppercase; letter-spacing: 0.04em; }
    .data-table td { padding: 8px 12px; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .data-table tr:hover { background: rgba(255,255,255,0.02); }
    .actions-cell { white-space: nowrap; }

    .btn-primary { background: linear-gradient(135deg, var(--gold-dim), var(--gold)); color: #0b0f15; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; font-family: 'Inter', sans-serif; }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-secondary { background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); color: var(--text-dim); padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: 'Inter', sans-serif; }
    .btn-secondary:hover { border-color: rgba(255,255,255,0.2); }
    .btn-sm { background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); color: var(--text-dim); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem; font-family: 'Inter', sans-serif; }
    .btn-sm:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }

    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: flex-start; justify-content: center; z-index: 100; overflow-y: auto; padding: 40px 0; }
    .modal { background: var(--panel-solid); border: 1px solid rgba(201,162,78,0.3); border-radius: 12px; padding: 0; width: 600px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--panel-border); position: sticky; top: 0; background: var(--panel-solid); z-index: 1; }
    .modal-header h3 { color: var(--gold); font-size: 1rem; }
    .modal-close { background: none; border: none; color: var(--text-dim); font-size: 1.2rem; cursor: pointer; }

    .edit-form { padding: 20px 24px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; color: var(--text-dim); font-size: 0.78rem; margin-bottom: 4px; font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; padding: 8px 12px; background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border);
      border-radius: 6px; color: var(--text); font-size: 0.85rem; font-family: 'Inter', monospace;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: rgba(201,162,78,0.4); outline: none; }
    .form-group-check label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; color: var(--text); }
    .form-group-check input[type="checkbox"] { accent-color: var(--cta); width: 16px; height: 16px; }
    .json-editor { font-family: 'Courier New', monospace; font-size: 0.78rem; min-height: 80px; }

    /* Grid Editor */
    .grid-editor-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
    .grid-editor-controls label { font-size: 0.78rem; color: var(--text-dim); display: flex; align-items: center; gap: 4px; }
    .grid-editor-controls input[type="number"] { background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); border-radius: 4px; color: var(--text); padding: 4px 8px; font-size: 0.82rem; }
    .grid-size-info { font-size: 0.72rem; color: var(--gold-dim); font-weight: 600; }
    .grid-brush-label { font-size: 0.72rem; color: var(--text-dim); margin-left: 8px; }
    .grid-brush-btn { border: 2px solid transparent; border-radius: 4px; padding: 3px 8px; font-size: 0.68rem; color: #fff; cursor: pointer; font-family: 'Inter', sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
    .grid-brush-btn.active { border-color: var(--gold); box-shadow: 0 0 6px rgba(246,200,109,0.4); }
    .grid-brush-btn:hover { filter: brightness(1.3); }
    .grid-canvas-wrap { max-height: 500px; overflow: auto; border: 1px solid var(--panel-border); border-radius: 6px; padding: 0; position: relative; background-color: rgba(0,0,0,0.3); }
    .grid-canvas { user-select: none; cursor: crosshair; position: relative; z-index: 1; }
    .ge-cell { width: 22px; height: 22px; border: 1px solid rgba(255,255,255,0.15); transition: background 0.05s; box-sizing: border-box; }
    .ge-cell:hover { outline: 2px solid rgba(246,200,109,0.7); z-index: 2; }
    .grid-opacity-slider { accent-color: var(--gold); }

    /* Scenario Map Editor */
    .scenario-map-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .scenario-map-status { font-size: 0.75rem; color: var(--text-dim); }
    .scenario-map-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .sme-brush { border: 2px solid transparent; border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; color: #fff; cursor: pointer; font-family: 'Inter', sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
    .sme-brush.active { border-color: var(--gold); box-shadow: 0 0 8px rgba(246,200,109,0.5); }
    .sme-brush:hover { filter: brightness(1.2); }
    .scenario-map-monster-select { margin-bottom: 10px; }
    .scenario-map-monster-select label { font-size: 0.78rem; color: var(--text-dim); display: flex; align-items: center; gap: 8px; }
    .scenario-map-monster-select select { background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); color: var(--text); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; }
    .sme-wall { background: rgba(10,8,6,0.7) !important; }
    .sme-floor { background: rgba(50,45,35,0.3); }
    .sme-placed-start { background: rgba(58,204,96,0.3) !important; }
    .sme-placed-monster { background: rgba(255,77,77,0.3) !important; }
    .sme-placed-npc { background: rgba(91,143,255,0.3) !important; }
    .sme-placed-chest { background: rgba(246,200,109,0.3) !important; }
    .sme-placed-trap { background: rgba(168,85,247,0.3) !important; }
    .sme-placed-questNpc { background: rgba(34,211,238,0.3) !important; }
    .sme-placed-rune { background: rgba(255,140,66,0.3) !important; }
    .sme-icon { font-size: 14px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    .sme-doc-upload { margin-bottom: 12px; padding: 10px; border: 1px dashed var(--panel-border); border-radius: 6px; background: rgba(20,25,35,0.3); }
    .sme-doc-upload label { font-size: 0.78rem; color: var(--text-dim); display: block; margin-bottom: 6px; }
    .sme-doc-upload input { font-size: 0.82rem; }
    .sme-doc-status { font-size: 0.75rem; margin-top: 4px; }
    .sme-entity-select { margin-bottom: 8px; }
    .sme-entity-select label { font-size: 0.78rem; color: var(--text-dim); display: flex; align-items: center; gap: 8px; }
    .sme-select, .sme-input { background: rgba(20,25,35,0.6); border: 1px solid var(--panel-border); color: var(--text); padding: 4px 8px; border-radius: 4px; font-size: 0.82rem; min-width: 200px; }
    .sme-summary { font-size: 0.75rem; color: var(--text-dim); margin-top: 10px; padding: 8px; background: rgba(20,25,35,0.4); border-radius: 6px; }
    .sme-summary-row { margin-top: 4px; }
    .sme-tag { display: inline-block; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 3px; margin: 1px 2px; font-size: 0.7rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--panel-border); }
  `;
  document.head.appendChild(style);
}

// ===========================
// INIT
// ===========================
async function init() {
  if (adminToken) {
    try {
      const r = await fetch('/api/admin/store-stats', { headers: { 'Authorization': `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error();
      renderAdmin();
    } catch {
      localStorage.removeItem('adminToken'); adminToken = null; renderAuth();
    }
  } else { renderAuth(); }
}

init();
