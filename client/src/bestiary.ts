/**
 * Bestiary — Бестиарий Taloria
 */
import './styles/variables.css';
import './styles/animations.css';

const TABS = [
  { id: 'monsters', label: 'Монстры' },
  { id: 'spells', label: 'Заклинания' },
  { id: 'abilities', label: 'Способности' },
  { id: 'potions', label: 'Зелья' },
  { id: 'weapons', label: 'Оружие' },
  { id: 'artifacts', label: 'Артефакты' },
  { id: 'equipment', label: 'Экипировка' },
  { id: 'scrolls', label: 'Свитки' },
  { id: 'tools', label: 'Разное' },
];

const CLASSES = [
  { id: '', label: 'Все классы' },
  { id: 'warrior', label: 'Воин' },
  { id: 'mage', label: 'Маг' },
  { id: 'priest', label: 'Жрец' },
  { id: 'bard', label: 'Бард' },
];

let currentTab = 'monsters';
let currentPage = 1;
let searchQuery = '';
let classFilter = '';
const app = document.getElementById('bestiary-app')!;

async function fetchBestiary(tab: string, page = 1, search = '', cls = '') {
  const params = new URLSearchParams({ tab, page: String(page), limit: '50' });
  if (search) params.set('search', search);
  if (cls) params.set('cls', cls);
  return fetch(`/api/bestiary?${params}`).then(r => r.json());
}

async function render() {
  app.innerHTML = `
    <div class="best">
      <!-- Header -->
      <header class="best-header">
        <a href="/" class="best-logo">Taloria</a>
        <a href="/" class="best-back">← В игру</a>
      </header>

      <!-- Banner -->
      <div class="best-banner">
        <h1 class="best-title">БЕСТИАРИЙ TALORIA</h1>
        <p class="best-subtitle">Монстры, заклинания, артефакты и всё, что встретится на пути</p>
      </div>

      <!-- Tabs -->
      <nav class="best-tabs" id="best-tabs">
        ${TABS.map(t => `
          <button class="best-tab ${t.id === currentTab ? 'best-tab--active' : ''}" data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </nav>

      <!-- Filters -->
      <div class="best-filters">
        <input type="text" class="best-search" id="best-search" placeholder="Поиск по названию..." value="${searchQuery}" />
        <select class="best-class-filter" id="best-class-filter">
          ${CLASSES.map(c => `<option value="${c.id}" ${classFilter === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
      </div>

      <!-- Grid -->
      <div class="best-grid" id="best-grid">
        <div class="best-loading"><div class="spinner"></div></div>
      </div>

      <!-- Pagination -->
      <div class="best-pagination" id="best-pagination"></div>
    </div>
  `;

  addBestiaryStyles();

  // Tab switching
  document.querySelectorAll('.best-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = (btn as HTMLElement).dataset.tab!;
      currentPage = 1;
      document.querySelectorAll('.best-tab').forEach(t => t.classList.remove('best-tab--active'));
      btn.classList.add('best-tab--active');
      loadData();
    });
  });

  // Search
  let searchTimer: any;
  document.getElementById('best-search')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = (e.target as HTMLInputElement).value;
      currentPage = 1;
      loadData();
    }, 300);
  });

  // Class filter
  document.getElementById('best-class-filter')?.addEventListener('change', (e) => {
    classFilter = (e.target as HTMLSelectElement).value;
    currentPage = 1;
    loadData();
  });

  loadData();
}

async function loadData() {
  const grid = document.getElementById('best-grid')!;
  grid.innerHTML = '<div class="best-loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchBestiary(currentTab, currentPage, searchQuery, classFilter);

    if (!data.data?.length) {
      grid.innerHTML = '<p class="best-empty">Ничего не найдено</p>';
      return;
    }

    const rarityColors: Record<string, string> = {
      common: 'var(--rarity-common)', uncommon: 'var(--rarity-uncommon)',
      rare: 'var(--rarity-rare)', epic: 'var(--rarity-epic)', legendary: 'var(--rarity-legendary)',
    };

    // Store items for popup
    (window as any).__bestiaryItems = data.data;

    grid.innerHTML = data.data.map((item: any, idx: number) => {
      const isMonster = currentTab === 'monsters';
      const isAbility = ['spells', 'abilities'].includes(currentTab);
      const nameColor = item.rarity ? rarityColors[item.rarity] || 'var(--text)' : 'var(--text)';

      return `
        <div class="best-card" data-idx="${idx}">
          <div class="best-card-top">
            <div class="best-card-icon">${item.img ? `<img src="${item.img}" class="best-card-img" alt="" />` : getIcon(currentTab, item)}</div>
            <div class="best-card-info">
              <h4 class="best-card-name" style="color:${nameColor}">${item.name}</h4>
              <p class="best-card-desc">${item.description || getAutoDesc(item, currentTab)}</p>
            </div>
          </div>
          <div class="best-card-badges">
            ${isMonster ? `
              <span class="best-badge best-badge--red">❤ ${item.hp}</span>
              <span class="best-badge best-badge--orange">⚔ ${item.attack}</span>
              <span class="best-badge best-badge--blue">🛡 ${item.armor}</span>
              <span class="best-badge best-badge--green">✦ ${item.xpReward} XP</span>
            ` : ''}
            ${isAbility ? `
              ${item.manaCost ? `<span class="best-badge best-badge--blue">💧 ${item.manaCost} MP</span>` : ''}
              ${item.unlockLevel ? `<span class="best-badge best-badge--gold">★ Ур. ${item.unlockLevel}</span>` : ''}
              ${item.cls && item.cls !== 'any' ? `<span class="best-badge best-badge--dim">${getClsLabel(item.cls)}</span>` : ''}
            ` : ''}
            ${!isMonster && !isAbility ? `
              ${item.rarity ? `<span class="best-badge best-badge--rarity-${item.rarity}">${getRarityLabel(item.rarity)}</span>` : ''}
              ${item.damage?.die ? `<span class="best-badge best-badge--red">⚔ ${item.damage.die}${item.damage.bonus ? '+' + item.damage.bonus : ''}</span>` : ''}
              ${item.stats?.armor ? `<span class="best-badge best-badge--blue">🛡 +${item.stats.armor}</span>` : ''}
              ${item.stats?.attack ? `<span class="best-badge best-badge--orange">⚔ +${item.stats.attack}</span>` : ''}
              ${item.effect?.heal ? `<span class="best-badge best-badge--green">❤ +${item.effect.heal}</span>` : ''}
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Card click → popup
    grid.querySelectorAll('.best-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt((card as HTMLElement).dataset.idx || '0');
        const item = (window as any).__bestiaryItems?.[idx];
        if (item) openDetailPopup(item, currentTab);
      });
    });

    // Pagination
    const pagination = document.getElementById('best-pagination')!;
    if (data.pages > 1) {
      let paginationHtml = '';
      for (let p = 1; p <= data.pages; p++) {
        paginationHtml += `<button class="best-page-btn ${p === data.page ? 'best-page-btn--active' : ''}" data-page="${p}">${p}</button>`;
      }
      pagination.innerHTML = paginationHtml;
      pagination.querySelectorAll('.best-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          currentPage = parseInt((btn as HTMLElement).dataset.page!);
          loadData();
        });
      });
    } else {
      pagination.innerHTML = '';
    }
  } catch {
    grid.innerHTML = '<p class="best-empty" style="color:var(--red)">Ошибка загрузки</p>';
  }
}

function getIcon(tab: string, item: any): string {
  const map: Record<string, string> = {
    monsters: '👹', spells: '⚡', abilities: '⚡', potions: '🧪',
    weapons: '⚔️', artifacts: '💎', equipment: '🛡️', scrolls: '📜', tools: '🔧',
  };
  return map[tab] || '📦';
}

function getAutoDesc(item: any, tab: string): string {
  if (tab === 'monsters') {
    const aiLabels: Record<string, string> = { aggressive: 'Агрессивный', defensive: 'Оборонительный', support: 'Поддержка', coward: 'Трусливый', boss: 'Босс', scout: 'Разведчик', warrior: 'Воин', archer: 'Лучник', flanker: 'Фланкер' };
    return `${aiLabels[item.aiType] || item.aiType || 'Враждебный'} · Обзор ${item.vision || 0} · Ход ${item.moveRange || 0}`;
  }
  if (['spells', 'abilities'].includes(tab)) return item.description || (item.effect ? formatEffect(item.effect).slice(0, 80) : '');
  // Beautiful description for items
  if (item.description && !item.description.includes('категории') && !item.description.includes('продаётся')) return item.description;
  if (item.characteristics) return item.characteristics;
  if (item.advantages) return item.advantages;
  // Generate description from effects
  if (item.effect) return formatEffect(item.effect).slice(0, 80);
  if (item.damage?.die) return `Урон: ${item.damage.die}${item.damage.bonus ? '+' + item.damage.bonus : ''}`;
  if (item.stats) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(item.stats as Record<string, number>)) {
      const labels: Record<string, string> = { attack: 'Атака', armor: 'Защита', agility: 'Ловкость', intellect: 'Интеллект', wisdom: 'Мудрость', charisma: 'Харизма', quality: 'Качество', durability: 'Прочность' };
      if (v) parts.push(`${labels[k] || k} +${v}`);
    }
    return parts.join(' · ');
  }
  return '';
}

function getClsLabel(cls: string): string {
  return { warrior: 'Воин', mage: 'Маг', priest: 'Жрец', bard: 'Бард', any: 'Все' }[cls] || cls;
}

function getRarityLabel(rarity: string): string {
  return { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' }[rarity] || rarity;
}

function addBestiaryStyles() {
  if (document.getElementById('best-styles')) return;
  const style = document.createElement('style');
  style.id = 'best-styles';
  style.textContent = `
    .best { background: var(--bg); min-height: 100vh; color: var(--text); }

    /* Header */
    .best-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: rgba(11,13,18,0.97); border-bottom: 1px solid var(--panel-border); }
    .best-logo { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: #d4a84b; text-decoration: none; letter-spacing: 0.12em; }
    .best-back { color: var(--text-dim); font-size: 0.82rem; text-decoration: none; }
    .best-back:hover { color: var(--text); }

    /* Banner */
    .best-banner { text-align: center; padding: 40px 24px 20px; background: radial-gradient(ellipse at center, rgba(91,143,255,0.04), transparent); }
    .best-title { font-family: var(--font-heading); font-size: 2.2rem; font-weight: 900; color: #d4a84b; letter-spacing: 0.08em; margin-bottom: 8px; }
    .best-subtitle { color: var(--text-dim); font-size: 0.88rem; }

    /* Tabs */
    .best-tabs { display: flex; justify-content: center; gap: 0; border-bottom: 1px solid var(--panel-border); padding: 0 24px; flex-wrap: wrap; }
    .best-tab { background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-dim); padding: 12px 16px; font-size: 0.82rem; cursor: pointer; font-family: var(--font-body); font-weight: 500; transition: all 0.2s; }
    .best-tab:hover { color: var(--text); }
    .best-tab--active { color: var(--text); border-bottom-color: var(--gold); }

    /* Filters */
    .best-filters { display: flex; gap: 12px; max-width: 1100px; margin: 20px auto; padding: 0 24px; }
    .best-search { flex: 1; max-width: 400px; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 6px; color: var(--text); font-size: 0.85rem; font-family: var(--font-body); }
    .best-search:focus { outline: none; border-color: var(--gold-dim); }
    .best-search::placeholder { color: var(--text-muted); }
    .best-class-filter { padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 6px; color: var(--text); font-size: 0.85rem; font-family: var(--font-body); cursor: pointer; }
    .best-class-filter:focus { outline: none; border-color: var(--gold-dim); }
    .best-class-filter option { background: #1a1d24; color: var(--text); }

    /* Grid — compact 4 columns */
    .best-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-width: 1100px; margin: 0 auto; padding: 0 24px 40px; }

    /* Card — compact */
    .best-card {
      background: rgba(16, 20, 30, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 14px 16px;
      transition: border-color 0.2s;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .best-card { cursor: pointer; }
    .best-card:hover { border-color: rgba(201, 162, 78, 0.3); transform: translateY(-1px); }
    .best-card-img { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; }

    .best-card-top { display: flex; gap: 12px; align-items: flex-start; }
    .best-card-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
    .best-card-info { flex: 1; min-width: 0; }
    .best-card-name { font-family: var(--font-heading); font-size: 0.88rem; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .best-card-desc { color: var(--text-dim); font-size: 0.72rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    /* Badges */
    .best-card-badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .best-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .best-badge--red { background: rgba(255,77,77,0.12); color: #ff6b6b; }
    .best-badge--orange { background: rgba(255,140,66,0.12); color: #ff8c42; }
    .best-badge--blue { background: rgba(91,143,255,0.12); color: #7daaff; }
    .best-badge--green { background: rgba(58,204,96,0.12); color: #50e878; }
    .best-badge--gold { background: rgba(201,162,78,0.12); color: #e8c85a; }
    .best-badge--dim { background: rgba(255,255,255,0.05); color: var(--text-dim); }
    .best-badge--rarity-common { background: rgba(157,157,157,0.1); color: #9D9D9D; }
    .best-badge--rarity-uncommon { background: rgba(30,255,0,0.08); color: #1EFF00; }
    .best-badge--rarity-rare { background: rgba(0,112,255,0.1); color: #0070FF; }
    .best-badge--rarity-epic { background: rgba(163,53,238,0.1); color: #A335EE; }
    .best-badge--rarity-legendary { background: rgba(255,128,0,0.1); color: #FF8000; }

    /* Loading / Empty */
    .best-loading { grid-column: 1 / -1; display: flex; justify-content: center; padding: 60px 0; }
    .best-empty { grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 60px 0; font-size: 0.9rem; }

    /* Pagination */
    .best-pagination { display: flex; justify-content: center; gap: 6px; padding: 0 24px 40px; max-width: 1100px; margin: 0 auto; }
    .best-page-btn { background: var(--panel); border: 1px solid var(--panel-border); color: var(--text-dim); width: 32px; height: 32px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-family: var(--font-body); transition: all 0.2s; }
    .best-page-btn:hover { border-color: var(--gold-dim); color: var(--text); }
    .best-page-btn--active { background: var(--gold-bg); color: var(--gold); border-color: var(--gold-dim); }

    /* Detail Popup */
    .best-popup-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px; }
    .best-popup { background:var(--panel-solid,#131825);border:1px solid rgba(201,162,78,0.3);border-radius:14px;padding:28px;max-width:480px;width:100%;max-height:85vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.6); }
    .best-popup-close { position:absolute;top:12px;right:16px;background:none;border:none;color:var(--text-dim,#9a9a9e);font-size:1.4rem;cursor:pointer;z-index:1; }
    .best-popup-close:hover { color:var(--text,#e8e6e0); }
    .best-popup-img-wrap { text-align:center;margin-bottom:16px; }
    .best-popup-img { max-width:160px;max-height:160px;object-fit:contain;border-radius:8px;border:2px solid rgba(201,162,78,0.2); }
    .best-popup-icon { font-size:4rem;text-align:center; }
    .best-popup-name { font-family:var(--font-heading);font-size:1.4rem;font-weight:800;text-align:center;margin:0 0 4px; }
    .best-popup-label { text-align:center;font-size:0.78rem;color:var(--text-dim,#9a9a9e);margin-bottom:4px; }
    .best-popup-rarity { text-align:center;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px; }
    .best-popup-desc { color:var(--text-dim,#9a9a9e);font-size:0.85rem;line-height:1.6;text-align:center;margin-bottom:20px; }
    .best-popup-stats { display:flex;flex-direction:column;gap:6px; }
    .bps-row { display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:4px; }
    .bps-row:nth-child(odd) { background:rgba(255,255,255,0.04); }
    .bps-row--wide { flex-direction:column;align-items:flex-start;gap:4px; }
    .bps-label { font-size:0.78rem;color:var(--text-dim,#9a9a9e); }
    .bps-val { font-size:0.82rem;font-weight:600;color:var(--text,#e8e6e0); }
    .bps-effect { font-size:0.78rem;color:var(--gold-dim,#c9a24e);line-height:1.5; }
    .bps-section { margin-top:16px; }
    .bps-section-title { font-size:0.72rem;font-weight:700;color:var(--text-dim,#9a9a9e);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06); }
    .bps-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px; }
    .bps-stat { text-align:center;padding:8px 4px;background:rgba(255,255,255,0.02);border-radius:6px; }
    .bps-stat-val { display:block;font-size:1.1rem;font-weight:800;font-family:var(--font-heading,serif); }
    .bps-stat-lbl { display:block;font-size:0.6rem;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.04em; }
    .bps-stat--red { color:#ff6b6b; } .bps-stat--orange { color:#ff8c42; } .bps-stat--blue { color:#7daaff; }
    .bps-stat--green { color:#50e878; } .bps-stat--gold { color:#e8c85a; }
    .bps-effect-text { font-size:0.82rem;color:var(--gold-dim,#c9a24e);line-height:1.6;margin:0; }

    @media (max-width: 900px) { .best-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 500px) { .best-grid { grid-template-columns: 1fr; } .best-tabs { justify-content: flex-start; overflow-x: auto; } .best-tab { font-size: 0.75rem; padding: 10px 12px; white-space: nowrap; } }
  `;
  document.head.appendChild(style);
}

// ==============================
// EFFECT FORMATTER — человекочитаемый текст вместо JSON
// ==============================
function formatEffect(effect: any): string {
  if (!effect || typeof effect !== 'object') return String(effect || '—');
  const parts: string[] = [];

  // Healing / Mana
  if (effect.heal) parts.push(`Восстанавливает ${effect.heal} HP`);
  if (effect.mana) parts.push(`Восстанавливает ${effect.mana} маны`);
  if (effect.healPercent) parts.push(`Лечит ${effect.healPercent}% от макс. HP`);

  // Damage
  if (effect.damage) parts.push(`Наносит ${effect.damage} урона`);
  if (effect.damageDie) parts.push(`Урон: ${effect.damageDie}${effect.damageBonus ? ' +' + effect.damageBonus : ''}`);
  if (effect.damageType) parts.push(`Тип урона: ${effect.damageType}`);

  // AoE
  if (effect.aoe) parts.push(`Область: ${effect.aoe} ${effect.aoeRadius ? '(радиус ' + effect.aoeRadius + ')' : ''}`);
  if (effect.radius) parts.push(`Радиус: ${effect.radius} клеток`);
  if (effect.range) parts.push(`Дальность: ${effect.range} клеток`);

  // Status effects
  if (effect.stun) parts.push(`Оглушает на ${effect.stun} ход(ов)`);
  if (effect.slow) parts.push(`Замедляет на ${effect.slow} ход(ов)`);
  if (effect.poison) parts.push(`Отравление: ${effect.poison} урона/ход`);
  if (effect.poisonDuration) parts.push(`Длительность яда: ${effect.poisonDuration} ходов`);
  if (effect.burn) parts.push(`Горение: ${effect.burn} урона/ход`);
  if (effect.freeze) parts.push(`Замораживает на ${effect.freeze} ход(ов)`);
  if (effect.confusion) parts.push(`Дезориентация на ${effect.confusion} ход(ов)`);
  if (effect.weaken) parts.push(`Ослабление: −${effect.weaken} атаки`);
  if (effect.vulnerability) parts.push(`Уязвимость: +${effect.vulnerability}% получаемого урона`);
  if (effect.blind) parts.push(`Ослепление на ${effect.blind} ход(ов)`);
  if (effect.fear) parts.push(`Страх на ${effect.fear} ход(ов)`);
  if (effect.charm) parts.push(`Очарование на ${effect.charm} ход(ов)`);
  if (effect.silence) parts.push(`Безмолвие на ${effect.silence} ход(ов)`);

  // Buffs
  if (effect.shield) parts.push(`Щит: ${effect.shield} HP`);
  if (effect.shieldDuration) parts.push(`Длительность щита: ${effect.shieldDuration} ходов`);
  if (effect.attackBonus) parts.push(`+${effect.attackBonus} к атаке`);
  if (effect.armorBonus) parts.push(`+${effect.armorBonus} к броне`);
  if (effect.speedBonus) parts.push(`+${effect.speedBonus} к скорости`);
  if (effect.visionBonus) parts.push(`+${effect.visionBonus} к обзору`);
  if (effect.inspired) parts.push(`Вдохновение: +${effect.inspired} к урону`);
  if (effect.precision) parts.push(`Точность: +${effect.precision} к попаданию`);
  if (effect.evasion) parts.push(`Уклонение: +${effect.evasion}%`);
  if (effect.regen) parts.push(`Регенерация: ${effect.regen} HP/ход`);
  if (effect.manaRegen) parts.push(`Восст. маны: ${effect.manaRegen}/ход`);

  // Movement
  if (effect.knockback) parts.push(`Отталкивание: ${effect.knockback} клетка(и)`);
  if (effect.pull) parts.push(`Притягивание: ${effect.pull} клетка(и)`);
  if (effect.teleport) parts.push(`Телепортация: ${effect.teleport} клеток`);
  if (effect.charge) parts.push(`Рывок к цели`);

  // Duration
  if (effect.duration) parts.push(`Длительность: ${effect.duration} ходов`);
  if (effect.cooldown) parts.push(`Перезарядка: ${effect.cooldown} ходов`);

  // Special
  if (effect.resurrect) parts.push(`Воскрешение с ${effect.resurrect}% HP`);
  if (effect.taunt) parts.push(`Провокация на ${effect.taunt} ход(ов)`);
  if (effect.stealth) parts.push(`Невидимость на ${effect.stealth} ход(ов)`);
  if (effect.reflect) parts.push(`Отражение ${effect.reflect}% урона`);
  if (effect.lifesteal) parts.push(`Вампиризм: ${effect.lifesteal}%`);
  if (effect.manaDrain) parts.push(`Поглощение ${effect.manaDrain} маны`);
  if (effect.dispel) parts.push(`Снятие эффектов`);
  if (effect.revealHidden) parts.push(`Раскрывает скрытые объекты`);
  if (effect.type) parts.push(`Тип: ${effect.type}`);

  // Fallback — если ничего не распознали, перебираем оставшиеся ключи
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(effect)) {
      if (v !== null && v !== undefined && v !== false && v !== 0) {
        parts.push(`${k}: ${v}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('. ') + '.' : '—';
}

// ==============================
// DETAIL POPUP
// ==============================
function openDetailPopup(item: any, tab: string) {
  // Remove existing popup
  document.getElementById('best-popup-overlay')?.remove();

  const isMonster = tab === 'monsters';
  const isAbility = ['spells', 'abilities'].includes(tab);
  const isItem = !isMonster && !isAbility;
  const rarityColor: Record<string, string> = {
    common: '#9D9D9D', uncommon: '#1EFF00', rare: '#0070FF', epic: '#A335EE', legendary: '#FF8000',
  };
  const nColor = item.rarity ? rarityColor[item.rarity] || '#e8e6e0' : '#e8e6e0';

  const overlay = document.createElement('div');
  overlay.id = 'best-popup-overlay';
  overlay.className = 'best-popup-overlay';
  overlay.innerHTML = `
    <div class="best-popup">
      <button class="best-popup-close" id="best-popup-close">✕</button>

      <!-- Image -->
      <div class="best-popup-img-wrap">
        ${item.img ? `<img src="${item.img}" class="best-popup-img" alt="${item.name}" />` :
          (item.tokenImg ? `<img src="${item.tokenImg}" class="best-popup-img" alt="${item.name}" />` :
          `<div class="best-popup-icon">${getIcon(tab, item)}</div>`)}
      </div>

      <!-- Name & Rarity -->
      <h2 class="best-popup-name" style="color:${nColor}">${item.name}</h2>
      ${item.label && item.label !== item.name ? `<div class="best-popup-label">${item.label}</div>` : ''}
      ${item.rarity ? `<div class="best-popup-rarity" style="color:${nColor}">${getRarityLabel(item.rarity)}</div>` : ''}

      <!-- Description -->
      <p class="best-popup-desc">${(() => {
        // Beautiful text description (no raw type/slot)
        const desc = item.description || '';
        // Filter out auto-generated ugly descriptions
        if (desc && !desc.includes('категории') && !desc.includes('продаётся в')) return desc;
        if (item.characteristics) return item.characteristics;
        if (item.advantages) return item.advantages;
        return '';
      })()}</p>

      ${isMonster ? `
      <!-- Monster: Characteristics -->
      <div class="bps-section"><h4 class="bps-section-title">⚔ Боевые характеристики</h4>
        <div class="bps-grid">
          <div class="bps-stat"><span class="bps-stat-val bps-stat--red">${item.hp}</span><span class="bps-stat-lbl">Здоровье</span></div>
          <div class="bps-stat"><span class="bps-stat-val bps-stat--orange">${item.attack}</span><span class="bps-stat-lbl">Атака</span></div>
          <div class="bps-stat"><span class="bps-stat-val bps-stat--blue">${item.armor}</span><span class="bps-stat-lbl">Броня</span></div>
          <div class="bps-stat"><span class="bps-stat-val">${item.agility || 0}</span><span class="bps-stat-lbl">Ловкость</span></div>
          <div class="bps-stat"><span class="bps-stat-val">${item.damageDie || 'd6'}</span><span class="bps-stat-lbl">Урон</span></div>
          <div class="bps-stat"><span class="bps-stat-val bps-stat--green">${item.xpReward || 0}</span><span class="bps-stat-lbl">XP</span></div>
        </div>
      </div>
      <div class="bps-section"><h4 class="bps-section-title">📋 Параметры</h4>
        <div class="best-popup-stats">
          <div class="bps-row"><span class="bps-label">Обзор</span><span class="bps-val">${item.vision || 0} клеток</span></div>
          <div class="bps-row"><span class="bps-label">Дальность хода</span><span class="bps-val">${item.moveRange || 0} клеток</span></div>
          <div class="bps-row"><span class="bps-label">Дальность атаки</span><span class="bps-val">${item.attackRange || 1} клетка</span></div>
          <div class="bps-row"><span class="bps-label">Добыча</span><span class="bps-val">${item.goldMin || 0}–${item.goldMax || 0} монет</span></div>
          ${item.canTalk ? '<div class="bps-row"><span class="bps-label">Диалог</span><span class="bps-val">Можно поговорить</span></div>' : ''}
        </div>
      </div>
      ${item.abilities?.length ? `<div class="bps-section"><h4 class="bps-section-title">✨ Способности</h4><p class="bps-effect-text">${item.abilities.join(', ')}</p></div>` : ''}
      ` : ''}

      ${isAbility ? `
      <!-- Ability: Info -->
      <div class="bps-section"><h4 class="bps-section-title">📋 Параметры</h4>
        <div class="best-popup-stats">
          ${item.cls && item.cls !== 'any' ? `<div class="bps-row"><span class="bps-label">Класс</span><span class="bps-val">${getClsLabel(item.cls)}</span></div>` : ''}
          ${item.branch ? `<div class="bps-row"><span class="bps-label">Ветка развития</span><span class="bps-val">${item.branch}</span></div>` : ''}
          ${item.manaCost ? `<div class="bps-row"><span class="bps-label">Стоимость маны</span><span class="bps-val bps-stat--blue">${item.manaCost} MP</span></div>` : ''}
          ${item.cooldown ? `<div class="bps-row"><span class="bps-label">Перезарядка</span><span class="bps-val">${item.cooldown} ходов</span></div>` : ''}
          ${item.unlockLevel ? `<div class="bps-row"><span class="bps-label">Доступно с уровня</span><span class="bps-val bps-stat--gold">${item.unlockLevel}</span></div>` : ''}
          ${item.difficulty ? `<div class="bps-row"><span class="bps-label">Сложность</span><span class="bps-val">${'★'.repeat(item.difficulty)}${'☆'.repeat(6 - item.difficulty)}</span></div>` : ''}
        </div>
      </div>
      ${item.effect ? `<div class="bps-section"><h4 class="bps-section-title">⚡ Эффект</h4><p class="bps-effect-text">${formatEffect(item.effect)}</p></div>` : ''}
      ` : ''}

      ${isItem ? `
      <!-- Item: Characteristics -->
      ${(item.damage?.die || item.stats || item.range || item.weight) ? `
      <div class="bps-section"><h4 class="bps-section-title">📋 Характеристики</h4>
        <div class="best-popup-stats">
          ${item.damage?.die ? `<div class="bps-row"><span class="bps-label">Урон</span><span class="bps-val bps-stat--red">${item.damage.die}${item.damage.bonus ? ' +' + item.damage.bonus : ''}</span></div>` : ''}
          ${item.range ? `<div class="bps-row"><span class="bps-label">Дальность</span><span class="bps-val">${item.range} клеток</span></div>` : ''}
          ${item.weight ? `<div class="bps-row"><span class="bps-label">Вес</span><span class="bps-val">${item.weight} кг</span></div>` : ''}
          ${item.stats ? Object.entries(item.stats).map(([k, v]) => {
            const statLabels: Record<string, string> = { attack: 'Атака', armor: 'Защита', agility: 'Ловкость', intellect: 'Интеллект', wisdom: 'Мудрость', charisma: 'Харизма', quality: 'Качество', durability: 'Прочность', hp: 'Здоровье' };
            return v ? '<div class="bps-row"><span class="bps-label">' + (statLabels[k] || k) + '</span><span class="bps-val bps-stat--green">+' + v + '</span></div>' : '';
          }).join('') : ''}
        </div>
      </div>` : ''}

      <!-- Item: Effects -->
      ${item.effect ? `
      <div class="bps-section"><h4 class="bps-section-title">⚡ Эффект при использовании</h4>
        <p class="bps-effect-text">${formatEffect(item.effect)}</p>
      </div>` : ''}

      <!-- Item: Advantages -->
      ${item.advantages && !item.advantages.includes('Повышает эффективность') ? `
      <div class="bps-section"><h4 class="bps-section-title">✨ Преимущества</h4>
        <p class="bps-effect-text">${item.advantages}</p>
      </div>` : ''}
      ` : ''}
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  document.getElementById('best-popup-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } });
}

render();
