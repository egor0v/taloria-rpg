import { api } from '../../core/api';
import { clearElement } from '../../utils/safeRender';
import { getSelectedHeroId, setSelectedHeroId } from '../../core/heroSelection';
import './InventoryScreen.css';

const STAT_NAMES: Record<string, string> = { attack: 'СИЛ', agility: 'ЛОВ', armor: 'ВЫН', intellect: 'ИНТ', wisdom: 'МУД', charisma: 'ХАР' };
const SLOT_NAMES: Record<string, string> = { weapon: 'ОРУЖИЕ', shield: 'ЩИТ', helmet: 'ШЛЕМ', cloak: 'ПЛАЩ', armor: 'БРОНЯ', pants: 'ШТАНЫ', boots: 'ОБУВЬ', gloves: 'ПЕРЧАТКИ / ПРЕДМЕТ', ring: 'КОЛЬЦО / БРАСЛЕТ', amulet: 'АМУЛЕТ / ОЖЕРЕЛЬЕ' };
const CLS_NAMES: Record<string, Record<string, string>> = {
  warrior: { male: 'Воин', female: 'Воительница' }, mage: { male: 'Маг', female: 'Магесса' },
  priest: { male: 'Жрец', female: 'Жрица' }, bard: { male: 'Бард', female: 'Бардесса' },
};
const BASE_STATS = 6;

const RACE_NAMES: Record<string, Record<string, string>> = {
  human: { male: 'Человек', female: 'Человек' }, elf: { male: 'Эльф', female: 'Эльфийка' }, dwarf: { male: 'Дварф', female: 'Дварфийка' },
};

let allHeroes: any[] = [];
let selectedHeroIdx = 0;

export async function renderInventory(container: HTMLElement): Promise<void> {
  clearElement(container);
  container.innerHTML = `<div class="inv-page"><div class="loading-screen"><div class="spinner"></div></div></div>`;

  try {
    const data = await api.get('/api/heroes');
    allHeroes = data.heroes || [];
    if (!allHeroes.length) {
      container.innerHTML = '<div class="inv-page"><p class="dash-empty">Нет героев. Создайте первого!</p></div>';
      return;
    }
    // Restore selected hero from localStorage
    const savedId = getSelectedHeroId();
    if (savedId) {
      const idx = allHeroes.findIndex((h: any) => h._id === savedId);
      if (idx >= 0) selectedHeroIdx = idx;
    }
    renderWithTabs(container);

    // Check if new hero setup needed
    const setupHeroId = sessionStorage.getItem('new_hero_setup');
    if (setupHeroId) {
      sessionStorage.removeItem('new_hero_setup');
      const setupHero = allHeroes.find((h: any) => h._id === setupHeroId);
      if (setupHero && !setupHero.weaponChosen) {
        selectedHeroIdx = allHeroes.indexOf(setupHero);
        renderWithTabs(container);
        showWeaponChoicePopup(setupHero, container);
      }
    } else {
      // Check any hero with weaponChosen=false
      const hero = allHeroes[selectedHeroIdx];
      if (hero && !hero.weaponChosen) {
        showWeaponChoicePopup(hero, container);
      }
    }
  } catch {
    container.innerHTML = '<div class="inv-page"><p class="dash-empty">Ошибка загрузки</p></div>';
  }
}

function showWeaponChoicePopup(hero: any, container: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.className = 'inv-setup-overlay';
  overlay.innerHTML = `
    <div class="inv-setup-popup">
      <div class="inv-setup-icon">⚔️</div>
      <h3 class="inv-setup-title">Выберите начальное оружие</h3>
      <p class="inv-setup-text">Каждый герой начинает путь с одним оружием. Выберите то, что подходит вашему стилю.</p>
      <div class="inv-setup-options">
        <div class="inv-setup-option" data-weapon="short-blade">
          <div class="inv-setup-option-icon">🗡️</div>
          <h4 class="inv-setup-option-name">Короткий клинок</h4>
          <p class="inv-setup-option-desc">Ближний бой · d6 урона</p>
          <p class="inv-setup-option-meta">Быстрое и надёжное оружие для ближнего боя</p>
        </div>
        <div class="inv-setup-option" data-weapon="wooden-bow">
          <div class="inv-setup-option-icon">🏹</div>
          <h4 class="inv-setup-option-name">Деревянный лук</h4>
          <p class="inv-setup-option-desc">Дальний бой · d6 урона · 3 клетки</p>
          <p class="inv-setup-option-meta">Стреляйте издалека, оставаясь в безопасности</p>
        </div>
      </div>
    </div>
  `;
  container.appendChild(overlay);

  overlay.querySelectorAll('.inv-setup-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const weaponId = (opt as HTMLElement).dataset.weapon!;

      // Add weapon to inventory
      const weapon = weaponId === 'short-blade'
        ? { itemId: 'short-blade', name: 'Короткий клинок', type: 'weapon', slot: 'weapon', rarity: 'common', damage: { die: 'd6', bonus: 0 }, range: 1, weight: 2 }
        : { itemId: 'wooden-bow', name: 'Деревянный лук', type: 'weapon', slot: 'weapon', rarity: 'common', damage: { die: 'd6', bonus: 0 }, range: 3, weight: 2 };

      hero.inventory.push(weapon);
      hero.weaponChosen = true;

      try {
        await api.patch(`/api/heroes/${hero._id}`, {
          inventory: hero.inventory,
          weaponChosen: true,
        });
        allHeroes[selectedHeroIdx] = hero;
      } catch {}

      overlay.remove();
      showAbilityChoicePopup(hero, container);
    });
  });
}

function showAbilityChoicePopup(hero: any, container: HTMLElement) {
  // Get available abilities for this class at level 1
  const CLS_ABILITIES: Record<string, { id: string; name: string; desc: string }[]> = {
    warrior: [
      { id: 'shield-bash', name: 'Удар щитом', desc: 'Оглушает врага на 1 ход. Стоимость: 3 MP' },
      { id: 'war-cry', name: 'Боевой клич', desc: 'Вдохновляет союзников, +2 атака на 2 хода. Стоимость: 4 MP' },
    ],
    mage: [
      { id: 'fireball', name: 'Огненный шар', desc: 'AoE урон огнём на расстоянии. Стоимость: 5 MP' },
      { id: 'ice-shield', name: 'Ледяной щит', desc: 'Защитный барьер на 3 хода. Стоимость: 5 MP' },
    ],
    priest: [
      { id: 'heal', name: 'Лечение', desc: 'Восстанавливает HP союзнику. Стоимость: 5 MP' },
      { id: 'bless', name: 'Благословение', desc: '+2 к атаке и защите на 3 хода. Стоимость: 5 MP' },
    ],
    bard: [
      { id: 'inspire', name: 'Вдохновение', desc: 'Вдохновляет союзника, +2 все статы на 3 хода. Стоимость: 3 MP' },
      { id: 'lullaby', name: 'Колыбельная', desc: 'Усыпляет врага на 1 ход. Шанс 50%. Стоимость: 5 MP' },
    ],
  };

  const abilities = CLS_ABILITIES[hero.cls] || CLS_ABILITIES.warrior;

  const overlay = document.createElement('div');
  overlay.className = 'inv-setup-overlay';
  overlay.innerHTML = `
    <div class="inv-setup-popup">
      <div class="inv-setup-icon">✨</div>
      <h3 class="inv-setup-title">Выберите первую способность</h3>
      <p class="inv-setup-text">Вы получите одну активную способность. Остальные можно будет изучить при повышении уровня.</p>
      <div class="inv-setup-options">
        ${abilities.map(a => `
          <div class="inv-setup-option" data-ability="${a.id}">
            <div class="inv-setup-option-icon">⚡</div>
            <h4 class="inv-setup-option-name">${a.name}</h4>
            <p class="inv-setup-option-desc">${a.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  container.appendChild(overlay);

  overlay.querySelectorAll('.inv-setup-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const abilityId = (opt as HTMLElement).dataset.ability!;
      hero.abilities = hero.abilities || [];
      hero.abilities.push(abilityId);
      hero.abilityChosen = true;

      try {
        await api.patch(`/api/heroes/${hero._id}`, {
          abilities: hero.abilities,
          abilityChosen: true,
        });
        allHeroes[selectedHeroIdx] = hero;
      } catch {}

      overlay.remove();
      renderWithTabs(container);
    });
  });
}

function renderWithTabs(container: HTMLElement) {
  clearElement(container);

  // Build hero tabs
  const tabsHtml = allHeroes.map((h: any, i: number) => {
    const cls = CLS_NAMES[h.cls]?.[h.gender] || h.cls;
    const active = i === selectedHeroIdx;
    return `<button class="inv-hero-tab ${active ? 'inv-hero-tab--active' : ''}" data-idx="${i}">
      <img src="/uploads/heroes/${h.race}-${h.gender}-${h.cls}.png" class="inv-tab-avatar" onerror="this.style.display='none'" />
      <div class="inv-tab-info">
        <span class="inv-tab-name">${h.name}</span>
        <span class="inv-tab-meta">${cls} Ур.${h.level}</span>
      </div>
    </button>`;
  }).join('');

  const wrapper = document.createElement('div');
  wrapper.className = 'inv-page';
  wrapper.innerHTML = `<div class="inv-tabs-bar">${tabsHtml}</div><div id="inv-body"></div>`;
  container.appendChild(wrapper);

  // Tab click handlers
  wrapper.querySelectorAll('.inv-hero-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedHeroIdx = parseInt((tab as HTMLElement).dataset.idx!);
      if (allHeroes[selectedHeroIdx]) setSelectedHeroId(allHeroes[selectedHeroIdx]._id);
      renderWithTabs(container);
    });
  });

  // Render selected hero inventory
  const body = wrapper.querySelector('#inv-body') as HTMLElement;
  renderHeroBody(body, allHeroes[selectedHeroIdx], container);
}

/**
 * Stack identical items by itemId — group into single entries with quantity
 */
function stackItems(items: any[]): any[] {
  if (!items?.length) return [];
  const stacked: Record<string, any> = {};
  const result: any[] = [];

  for (const item of items) {
    const key = item.itemId || item.name || JSON.stringify(item);
    const isStackable = item.stackable || ['potion', 'scroll', 'food', 'tool', 'junk', 'quest'].includes(item.type);

    if (isStackable && stacked[key]) {
      stacked[key].quantity = (stacked[key].quantity || 1) + (item.quantity || 1);
    } else if (isStackable) {
      const entry = { ...item, quantity: item.quantity || 1 };
      stacked[key] = entry;
      result.push(entry);
    } else {
      // Non-stackable (equipment) — add as separate entry
      result.push({ ...item, quantity: 1 });
    }
  }

  return result;
}

// Normalize legacy slot names from DB to UI slot names
function normalizeEquipment(eq: any): any {
  if (!eq) return {};
  const out = { ...eq };
  // chest → armor (рубаха/броня хранились как "chest")
  if (out.chest && !out.armor) { out.armor = out.chest; delete out.chest; }
  // pants stored under "gloves" if item is actually pants
  if (out.gloves && !out.pants && (out.gloves.slot === 'gloves' && (out.gloves.type === 'pants' || out.gloves.name?.toLowerCase().includes('штан')))) {
    out.pants = out.gloves; delete out.gloves;
  }
  return out;
}

// Normalize item slot for equip matching
function normalizeSlot(slot: string): string {
  if (slot === 'chest') return 'armor';
  if (slot === 'necklace') return 'amulet';
  return slot;
}

function renderHeroBody(body: HTMLElement, hero: any, rootContainer: HTMLElement) {
  const clsName = CLS_NAMES[hero.cls]?.[hero.gender] || hero.cls;
  const raceName = RACE_NAMES[hero.race]?.[hero.gender] || hero.race;
  // Normalize equipment slots from DB
  hero.equipment = normalizeEquipment(hero.equipment);
  const equipment = hero.equipment;
  const inventory = stackItems(hero.inventory || []);
  const stash = stackItems(hero.stash || []);
  const abilities = hero.abilities || [];
  const baseAbilities = hero.baseAbilities || [];

  // Calculate weight (inventory + equipment)
  const invWeight = inventory.reduce((sum: number, item: any) => sum + (item.weight || 1) * (item.quantity || 1), 0);
  const equipWeight = Object.values(equipment).reduce((sum: number, item: any) => sum + (item?.weight || 0), 0);
  const totalWeight = invWeight + equipWeight;
  const maxWeight = 100 + hero.attack * 10;
  const weightPercent = Math.min(100, (totalWeight / maxWeight) * 100);

  // Slots layout: 2 columns × 5 rows = 10 slots
  const slotRows = [
    ['weapon', 'shield'],
    ['helmet', 'cloak'],
    ['armor', 'pants'],
    ['boots', 'gloves'],
    ['ring', 'amulet'],
  ];

  body.innerHTML = `
      <div class="inv-layout">
        <!-- Left: Portrait + Stats -->
        <div class="inv-left">
          <div class="inv-portrait" style="background-image: url('/uploads/heroes/${hero.race}-${hero.gender}-${hero.cls}.png')"></div>

          <div class="inv-stats">
            <h4 class="inv-section-title">ХАРАКТЕРИСТИКИ</h4>
            ${(() => {
              // Calculate equipment bonuses
              const equipBonus: Record<string, number> = {};
              for (const [slot, item] of Object.entries(equipment)) {
                if (!item?.stats) continue;
                for (const [stat, val] of Object.entries(item.stats as Record<string, number>)) {
                  equipBonus[stat] = (equipBonus[stat] || 0) + (val || 0);
                }
                // Weapon damage → attack bonus display
                if (slot === 'weapon' && item.damage?.bonus) {
                  equipBonus['attack'] = (equipBonus['attack'] || 0) + item.damage.bonus;
                }
              }

              // Calculate ability bonuses (passive effects)
              const abilityBonus: Record<string, number> = {};
              for (const ab of [...(hero.abilities || []), ...(hero.baseAbilities || [])]) {
                if (!ab?.effect) continue;
                const e = ab.effect;
                if (e.attackBonus) abilityBonus['attack'] = (abilityBonus['attack'] || 0) + e.attackBonus;
                if (e.armorBonus) abilityBonus['armor'] = (abilityBonus['armor'] || 0) + e.armorBonus;
                if (e.agilityBonus) abilityBonus['agility'] = (abilityBonus['agility'] || 0) + e.agilityBonus;
                if (e.intellectBonus) abilityBonus['intellect'] = (abilityBonus['intellect'] || 0) + e.intellectBonus;
                if (e.wisdomBonus) abilityBonus['wisdom'] = (abilityBonus['wisdom'] || 0) + e.wisdomBonus;
                if (e.charismaBonus) abilityBonus['charisma'] = (abilityBonus['charisma'] || 0) + e.charismaBonus;
                // Generic +all stats
                if (e.allStats) {
                  for (const s of ['attack','agility','armor','intellect','wisdom','charisma']) {
                    abilityBonus[s] = (abilityBonus[s] || 0) + e.allStats;
                  }
                }
              }

              return Object.entries(STAT_NAMES).map(([key, label]) => {
                const baseVal = hero[key] || BASE_STATS;
                const eqB = equipBonus[key] || 0;
                const abB = abilityBonus[key] || 0;
                const totalBonus = eqB + abB;
                const totalVal = baseVal + totalBonus;

                let bonusHtml = '';
                if (totalBonus > 0) {
                  const parts: string[] = [];
                  if (eqB > 0) parts.push(`<span class="inv-stat-bonus inv-stat-equip" title="Экипировка">+${eqB}</span>`);
                  if (abB > 0) parts.push(`<span class="inv-stat-bonus inv-stat-ability" title="Способности">+${abB}</span>`);
                  bonusHtml = parts.join(' ');
                } else if (totalBonus < 0) {
                  bonusHtml = `<span class="inv-stat-penalty">${totalBonus}</span>`;
                }

                return `<div class="inv-stat-row">
                  <span class="inv-stat-label">${label}</span>
                  <span class="inv-stat-val">${totalVal} ${bonusHtml}</span>
                </div>`;
              }).join('');
            })()}
          </div>

          <div class="inv-coins">
            <span class="inv-coin-gold">🪙 ${hero.gold || 0} зол.</span>
            <span class="inv-coin-silver">🥈 ${hero.silver || 0} сер.</span>
            <button class="inv-exchange-btn" id="btn-gold-to-silver" title="1 золото = 100 серебра">💱 Золото → Серебро</button>
          </div>

          <div class="inv-description" id="inv-description">
            <h4 class="inv-section-title" style="color:var(--gold)">Описание</h4>
            <p class="inv-desc-placeholder">Выберите предмет для просмотра</p>
          </div>
        </div>

        <!-- Center: Equipment -->
        <div class="inv-center">
          <h4 class="inv-section-title">ЭКИПИРОВКА</h4>
          <div class="inv-equip-grid">
            ${slotRows.map(row => row.map(slot => {
              if (!slot) return '<div class="inv-equip-slot inv-equip-slot--empty"><span class="inv-slot-label"></span></div>';
              const item = equipment[slot];
              return `<div class="inv-equip-slot ${item ? 'inv-equip-slot--filled' : ''}" data-slot="${slot}" data-item='${item ? JSON.stringify(item) : ''}'>
                ${item?.img ? `<img src="${item.img}" alt="${item.name}" class="inv-equip-img" />` :
                  item?.name ? `<div class="inv-equip-placeholder">${item.name}</div>` :
                  `<span class="inv-slot-label">${SLOT_NAMES[slot]}</span>`}
              </div>`;
            }).join('')).join('')}
          </div>
        </div>

        <!-- Right: Inventory Grid -->
        <div class="inv-right">
          <div class="inv-right-header">
            <h4 class="inv-section-title">ИНВЕНТАРЬ</h4>
            <div class="inv-weight">
              <span class="inv-weight-icon">⚖</span>
              <span>Вес: ${totalWeight.toFixed(1)} / ${maxWeight.toFixed(1)} кг</span>
            </div>
          </div>
          <div class="inv-weight-bar">
            <div class="inv-weight-fill ${weightPercent > 80 ? 'inv-weight-danger' : ''}" style="width:${weightPercent}%"></div>
          </div>
          <div class="inv-grid" id="inv-grid">
            ${renderInventoryGrid(inventory, 28)}
          </div>
        </div>
      </div>

      <!-- Abilities -->
      <div class="inv-abilities-row">
        <div class="inv-abilities-section">
          <h4 class="inv-section-title">БАЗОВЫЕ СПОСОБНОСТИ</h4>
          <div class="inv-abilities-grid">
            ${baseAbilities.length ? baseAbilities.map((a: string) =>
              `<div class="inv-ability-card" data-ability="${a}"><div class="inv-ability-icon">✦</div><div class="inv-ability-name">${a}</div></div>`
            ).join('') : '<p class="dash-empty">Нет базовых способностей</p>'}
          </div>
        </div>
        <div class="inv-abilities-section">
          <h4 class="inv-section-title">СПОСОБНОСТИ</h4>
          <div class="inv-abilities-grid">
            ${abilities.length ? abilities.map((a: string) =>
              `<div class="inv-ability-card" data-ability="${a}"><div class="inv-ability-icon">⚡</div><div class="inv-ability-name">${a}</div></div>`
            ).join('') :
            Array(6).fill('<div class="inv-ability-card inv-ability-card--empty"><div class="inv-ability-icon" style="opacity:0.2">🔒</div></div>').join('')}
          </div>
        </div>
      </div>

      <!-- Stash -->
      <div class="inv-stash-section">
        <h4 class="inv-section-title">СУНДУК <span class="inv-stash-slots">${(hero.stashRows || 2) * 10 + (hero.stashExtraSlots || 0)} слотов</span></h4>
        <p class="inv-stash-hint">В сундук вы можете положить предметы, которые могут понадобиться вам позже</p>
        <div class="inv-grid inv-stash-grid">
          ${renderInventoryGrid(stash, (hero.stashRows || 2) * 10 + (hero.stashExtraSlots || 0), 'stash')}
        </div>
        <div class="inv-stash-buy">
          <button class="inv-stash-buy-btn" id="btn-buy-stash-5">📦 +5 слотов <span class="inv-stash-price">99 ₽</span></button>
          <button class="inv-stash-buy-btn inv-stash-buy-btn--premium" id="btn-buy-stash-10">📦 +10 слотов <span class="inv-stash-price">149 ₽</span><span class="inv-stash-badge">ВЫГОДНО</span></button>
        </div>
      </div>
  `;

  // Click handlers for inventory items
  body.querySelectorAll('#inv-grid .inv-item[data-item]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const item = JSON.parse((el as HTMLElement).dataset.item || '{}');
        const idx = parseInt((el as HTMLElement).dataset.idx || '0');
        showItemDescription(item, 'inventory', idx, hero, rootContainer);
      } catch {}
    });
  });

  // Click handlers for stash items
  body.querySelectorAll('.inv-stash-grid .inv-item[data-item]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const item = JSON.parse((el as HTMLElement).dataset.item || '{}');
        const idx = parseInt((el as HTMLElement).dataset.idx || '0');
        showItemDescription(item, 'stash', idx, hero, rootContainer);
      } catch {}
    });
  });

  // Click handlers for equipped items
  body.querySelectorAll('.inv-equip-slot[data-item]').forEach(el => {
    el.addEventListener('click', () => {
      try {
        const itemStr = (el as HTMLElement).dataset.item;
        const slot = (el as HTMLElement).dataset.slot || '';
        if (itemStr) {
          const item = JSON.parse(itemStr);
          if (item.name) showItemDescription(item, 'equipment', 0, hero, rootContainer, slot);
        }
      } catch {}
    });
  });

  // Click handlers for abilities
  body.querySelectorAll('.inv-ability-card[data-ability]').forEach(el => {
    el.addEventListener('click', async () => {
      const abilityId = (el as HTMLElement).dataset.ability!;
      showAbilityDescription(abilityId);
    });
  });

  // ===== GOLD → SILVER EXCHANGE =====
  document.getElementById('btn-gold-to-silver')?.addEventListener('click', async () => {
    // Reload hero from server to get fresh gold/silver
    const token = localStorage.getItem('taloria_token');
    let freshHero = hero;
    try {
      const freshRes = await fetch(`/api/heroes/${hero._id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const freshData = await freshRes.json();
      if (freshData.hero) {
        freshHero = freshData.hero;
        hero.gold = freshHero.gold;
        hero.silver = freshHero.silver;
      }
    } catch {}

    if ((freshHero.gold || 0) < 1) {
      alert(`У ${freshHero.name} нет золота для обмена.\n\nЗолото можно получить:\n• В Главной Лавке за Талориены (100 Т = 1 золото)\n• Как награду за миссии\n• В сундуках на картах`);
      return;
    }

    const goldAmount = prompt(`Сколько золота обменять на серебро?\n1 золото = 100 серебра\nУ ${freshHero.name}: ${freshHero.gold || 0} золота`, '1');
    if (!goldAmount) return;
    const amount = parseInt(goldAmount);
    if (isNaN(amount) || amount < 1) { alert('Минимум 1 золото'); return; }
    if (amount > (freshHero.gold || 0)) { alert(`У ${freshHero.name} только ${freshHero.gold || 0} золота`); return; }

    try {
      const res = await fetch('/api/wallet/gold-to-silver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ heroId: hero._id, amount }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.goldSpent} золота → ${data.silverReceived} серебра для ${data.heroName}\n\nБаланс: 🪙 ${data.heroGold} зол. · 🥈 ${data.heroSilver} сер.`);
        hero.gold = data.heroGold;
        hero.silver = data.heroSilver;
        allHeroes[selectedHeroIdx] = hero;
        renderWithTabs(rootContainer);
      } else {
        alert('❌ ' + (data.error || 'Ошибка'));
      }
    } catch { alert('Ошибка подключения'); }
  });

  // ===== BUY STASH SLOTS =====
  const buyStash = async (slots: number) => {
    const token = localStorage.getItem('taloria_token');
    const slug = slots === 5 ? 'stash-5' : 'stash-10';
    try {
      const res = await fetch('/api/store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ catalogItemSlug: slug }),
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
    } catch {}

    // Dev mode / fallback: add slots directly
    // +5 = half row (5 extra slots), +10 = full row (stashRows + 1)
    const token2 = localStorage.getItem('taloria_token');
    const patch: any = {};
    if (slots === 5) {
      // Add 5 extra slots (stored as stashExtraSlots)
      patch.stashExtraSlots = (hero.stashExtraSlots || 0) + 5;
    } else {
      // Add full row (9 slots)
      patch.stashRows = (hero.stashRows || 2) + 1;
    }
    await fetch(`/api/heroes/${hero._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify(patch),
    });
    if (patch.stashExtraSlots !== undefined) hero.stashExtraSlots = patch.stashExtraSlots;
    if (patch.stashRows !== undefined) hero.stashRows = patch.stashRows;
    allHeroes[selectedHeroIdx] = hero;
    renderWithTabs(rootContainer);
    alert(`✅ Добавлено ${slots} слотов сундука!`);
  };

  document.getElementById('btn-buy-stash-5')?.addEventListener('click', () => {
    if (confirm('Купить +5 слотов сундука за 99 ₽?')) buyStash(5);
  });
  document.getElementById('btn-buy-stash-10')?.addEventListener('click', () => {
    if (confirm('Купить +10 слотов сундука за 149 ₽? (Выгоднее!)')) buyStash(10);
  });

  // ===== DRAG AND DROP =====
  setupDragDrop(body, hero, rootContainer);
}

function setupDragDrop(body: HTMLElement, hero: any, rootContainer: HTMLElement) {
  let dragData: { zone: string; idx: number; item: any } | null = null;

  // Drag start on items
  body.querySelectorAll('.inv-item[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', (e: Event) => {
      const de = e as DragEvent;
      const target = el as HTMLElement;
      dragData = {
        zone: target.dataset.zone || 'inventory',
        idx: parseInt(target.dataset.idx || '0'),
        item: JSON.parse(target.dataset.item || '{}'),
      };
      target.classList.add('inv-item--dragging');
      de.dataTransfer?.setData('text/plain', ''); // required for Firefox
    });

    el.addEventListener('dragend', () => {
      (el as HTMLElement).classList.remove('inv-item--dragging');
      body.querySelectorAll('.inv-item--dragover').forEach(d => d.classList.remove('inv-item--dragover'));
      body.querySelectorAll('.inv-equip-slot--dragover').forEach(d => d.classList.remove('inv-equip-slot--dragover'));
      dragData = null;
    });
  });

  // Drop on empty inventory/stash slots
  body.querySelectorAll('.inv-item--empty').forEach(el => {
    el.addEventListener('dragover', (e: Event) => { e.preventDefault(); (el as HTMLElement).classList.add('inv-item--dragover'); });
    el.addEventListener('dragleave', () => { (el as HTMLElement).classList.remove('inv-item--dragover'); });
    el.addEventListener('drop', async (e: Event) => {
      e.preventDefault();
      (el as HTMLElement).classList.remove('inv-item--dragover');
      if (!dragData) return;

      const targetZone = (el as HTMLElement).dataset.zone || 'inventory';
      await moveItem(hero, dragData.zone, dragData.idx, targetZone, rootContainer);
    });
  });

  // Drop on equipment slots
  body.querySelectorAll('.inv-equip-slot').forEach(el => {
    el.addEventListener('dragover', (e: Event) => { e.preventDefault(); (el as HTMLElement).classList.add('inv-equip-slot--dragover'); });
    el.addEventListener('dragleave', () => { (el as HTMLElement).classList.remove('inv-equip-slot--dragover'); });
    el.addEventListener('drop', async (e: Event) => {
      e.preventDefault();
      (el as HTMLElement).classList.remove('inv-equip-slot--dragover');
      if (!dragData) return;

      const slot = (el as HTMLElement).dataset.slot;
      if (!slot) return;
      if (dragData.zone !== 'inventory') return; // can only equip from inventory

      // Check slot compatibility
      const itemSlot = normalizeSlot(dragData.item.slot || 'none');
      const itemType = dragData.item.type || '';
      const SLOT_ACCEPTS: Record<string, (s: string, t: string) => boolean> = {
        weapon: (s, t) => s === 'weapon' || t === 'weapon',
        shield: (s, t) => s === 'shield' || t === 'shield',
        helmet: (s, t) => s === 'helmet' || t === 'helmet',
        armor: (s, t) => s === 'armor' || s === 'chest' || t === 'armor',
        boots: (s, t) => s === 'boots' || t === 'boots',
        pants: (s, t) => s === 'pants' || s === 'gloves' || t === 'pants',
        ring: (s, t) => s === 'ring' || t === 'jewelry' || t === 'ring',
        amulet: (s, t) => s === 'amulet' || s === 'necklace' || t === 'jewelry' || t === 'amulet',
        cloak: (s, t) => s === 'cloak' || t === 'cloak',
        gloves: (s, t) => s === 'gloves' || ['tool', 'potion', 'scroll', 'food'].includes(t),
      };
      const accepts = SLOT_ACCEPTS[slot];
      if (accepts && !accepts(itemSlot, itemType)) return;

      // Equip: swap current equipped with dragged item
      const currentEquipped = hero.equipment[slot];
      hero.equipment[slot] = { ...dragData.item };
      hero.inventory.splice(dragData.idx, 1);
      if (currentEquipped && currentEquipped.name) {
        hero.inventory.push(currentEquipped);
      }
      hero.markModified?.('equipment');
      await saveHero(hero);
      allHeroes[selectedHeroIdx] = hero;
      renderWithTabs(rootContainer);
    });
  });
}

async function moveItem(hero: any, fromZone: string, fromIdx: number, toZone: string, rootContainer: HTMLElement) {
  if (fromZone === toZone) return; // same zone, no move

  const fromArr = fromZone === 'inventory' ? hero.inventory : hero.stash;
  const toArr = toZone === 'inventory' ? hero.inventory : hero.stash;

  if (fromIdx >= fromArr.length) return;
  const item = fromArr.splice(fromIdx, 1)[0];
  if (!item) return;
  toArr.push(item);

  await saveHero(hero);
  allHeroes[selectedHeroIdx] = hero;
  renderWithTabs(rootContainer);
}

function renderInventoryGrid(items: any[], totalSlots: number, zone: string = 'inventory'): string {
  let html = '';
  for (let i = 0; i < totalSlots; i++) {
    const item = items[i];
    if (item) {
      const rarityClass = item.rarity ? `inv-item--${item.rarity}` : '';
      html += `<div class="inv-item ${rarityClass}" draggable="true" data-item='${JSON.stringify(item)}' data-idx="${i}" data-zone="${zone}" title="${item.name}">
        ${item.img ? `<img src="${item.img}" class="inv-item-img" alt="" draggable="false" />` : `<div class="inv-item-emoji">${getItemEmoji(item.type)}</div>`}
        ${(item.quantity || 1) > 1 ? `<span class="inv-item-qty">${item.quantity}</span>` : ''}
      </div>`;
    } else {
      html += `<div class="inv-item inv-item--empty" data-idx="${i}" data-zone="${zone}"></div>`;
    }
  }
  return html;
}

function showItemDescription(item: any, source: string = 'inventory', idx: number = 0, hero: any = null, container: HTMLElement | null = null, equipSlot: string = '') {
  const el = document.getElementById('inv-description');
  if (!el) return;

  const rarityNames: Record<string, string> = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
  const normalizedItemSlot = normalizeSlot(item.slot || 'none');
  const canEquip = normalizedItemSlot && normalizedItemSlot !== 'none' && source === 'inventory';
  const canUnequip = source === 'equipment';
  const canMoveToStash = source === 'inventory';
  const canMoveToInventory = source === 'stash';
  const canUse = item.usable && source === 'inventory';

  el.innerHTML = `
    <h4 class="inv-section-title" style="color:var(--rarity-${item.rarity || 'common'})">${item.name}</h4>
    <p class="inv-desc-type">${item.type || ''} · ${rarityNames[item.rarity] || 'Обычный'}</p>
    ${item.description ? `<p class="inv-desc-text">${item.description}</p>` : ''}
    ${item.damage ? `<p class="inv-desc-stat">Урон: ${item.damage.die}${item.damage.bonus ? '+' + item.damage.bonus : ''}</p>` : ''}
    ${item.stats ? Object.entries(item.stats).map(([k, v]) => `<p class="inv-desc-stat">${STAT_NAMES[k] || k}: <span class="inv-stat-bonus">+${v}</span></p>`).join('') : ''}
    ${item.effect?.heal ? `<p class="inv-desc-stat" style="color:var(--green)">Лечение: +${item.effect.heal} HP</p>` : ''}
    ${item.effect?.mana ? `<p class="inv-desc-stat" style="color:var(--blue)">Мана: +${item.effect.mana} MP</p>` : ''}
    <p class="inv-desc-weight">Вес: ${item.weight || 1} кг</p>

    <div class="inv-desc-actions">
      ${canEquip ? `<button class="inv-action-btn inv-action-btn--equip" id="btn-equip">⬆ Экипировать</button>` : ''}
      ${canUnequip ? `<button class="inv-action-btn inv-action-btn--unequip" id="btn-unequip">⬇ Снять</button>` : ''}
      ${canMoveToStash ? `<button class="inv-action-btn inv-action-btn--stash" id="btn-to-stash">📦 В сундук</button>` : ''}
      ${canMoveToInventory ? `<button class="inv-action-btn inv-action-btn--inv" id="btn-to-inv">🎒 В инвентарь</button>` : ''}
      ${canUse ? `<button class="inv-action-btn inv-action-btn--use" id="btn-use-item">✨ Использовать</button>` : ''}
    </div>
  `;

  // Equip
  document.getElementById('btn-equip')?.addEventListener('click', async () => {
    if (!hero || !container) return;
    const slot = normalizeSlot(item.slot);
    // Move current equipped item to inventory
    if (hero.equipment[slot] && hero.equipment[slot].name) {
      hero.inventory.push({ ...hero.equipment[slot] });
    }
    // Equip new item
    hero.equipment[slot] = { ...item };
    // Remove from inventory
    hero.inventory.splice(idx, 1);
    hero.markModified?.('equipment');
    await saveHero(hero);
    allHeroes[selectedHeroIdx] = hero; renderWithTabs(container);
  });

  // Unequip
  document.getElementById('btn-unequip')?.addEventListener('click', async () => {
    if (!hero || !container) return;
    const slot = equipSlot || item.slot;
    if (hero.equipment[slot]) {
      hero.inventory.push({ ...hero.equipment[slot] });
      hero.equipment[slot] = null;
      await saveHero(hero);
      allHeroes[selectedHeroIdx] = hero; renderWithTabs(container);
    }
  });

  // To stash
  document.getElementById('btn-to-stash')?.addEventListener('click', async () => {
    if (!hero || !container) return;
    const movedItem = hero.inventory.splice(idx, 1)[0];
    if (movedItem) {
      hero.stash.push(movedItem);
      await saveHero(hero);
      allHeroes[selectedHeroIdx] = hero; renderWithTabs(container);
    }
  });

  // To inventory
  document.getElementById('btn-to-inv')?.addEventListener('click', async () => {
    if (!hero || !container) return;
    const movedItem = hero.stash.splice(idx, 1)[0];
    if (movedItem) {
      hero.inventory.push(movedItem);
      await saveHero(hero);
      allHeroes[selectedHeroIdx] = hero; renderWithTabs(container);
    }
  });

  // Use item
  document.getElementById('btn-use-item')?.addEventListener('click', async () => {
    if (!hero || !container) return;
    const usedItem = hero.inventory[idx];
    if (!usedItem) return;
    // Apply effect locally
    if (usedItem.effect?.heal) hero.hp = Math.min(hero.maxHp, hero.hp + usedItem.effect.heal);
    if (usedItem.effect?.mana) hero.mp = Math.min(hero.maxMp, hero.mp + usedItem.effect.mana);
    // Remove item
    if (usedItem.stackable && (usedItem.quantity || 1) > 1) {
      hero.inventory[idx].quantity--;
    } else {
      hero.inventory.splice(idx, 1);
    }
    await saveHero(hero);
    allHeroes[selectedHeroIdx] = hero; renderWithTabs(container);
  });
}

// Ability info database (local fallback)
const ABILITY_DB: Record<string, { name: string; type: string; cls: string; manaCost: number; cooldown: number; desc: string; unlockLevel: number; difficulty: number; range?: number }> = {
  'shield-bash': { name: 'Удар щитом', type: 'class_ability', cls: 'warrior', manaCost: 3, cooldown: 0, desc: 'Оглушающий удар щитом. Наносит урон d4 и с 30% шансом оглушает на 1 ход.', unlockLevel: 2, difficulty: 1 },
  'war-cry': { name: 'Боевой клич', type: 'class_ability', cls: 'warrior', manaCost: 4, cooldown: 0, desc: 'Вдохновляет всех союзников в радиусе 3 клеток. +2 к атаке на 2 хода.', unlockLevel: 4, difficulty: 2, range: 3 },
  'berserk': { name: 'Берсерк', type: 'class_ability', cls: 'warrior', manaCost: 7, cooldown: 0, desc: '+50% к урону на 2 хода, но -2 к броне. Для агрессивного стиля боя.', unlockLevel: 7, difficulty: 3 },
  'whirlwind': { name: 'Вихрь', type: 'class_ability', cls: 'warrior', manaCost: 9, cooldown: 0, desc: 'AoE атака вокруг героя. Наносит d8 урона всем врагам в радиусе 1.', unlockLevel: 10, difficulty: 4, range: 1 },
  'shield-wall': { name: 'Стена щитов', type: 'class_ability', cls: 'warrior', manaCost: 9, cooldown: 0, desc: 'Создаёт щит для себя и ближайшего союзника. +3 брони на 2 хода.', unlockLevel: 15, difficulty: 4, range: 2 },
  'fireball': { name: 'Огненный шар', type: 'spell', cls: 'mage', manaCost: 5, cooldown: 0, desc: 'Огненный шар с AoE уроном. d6 урона основной цели + урон в радиусе 1.', unlockLevel: 2, difficulty: 2, range: 5 },
  'ice-shield': { name: 'Ледяной щит', type: 'spell', cls: 'mage', manaCost: 5, cooldown: 0, desc: 'Создаёт ледяную защиту. +3 к броне на 3 хода.', unlockLevel: 4, difficulty: 2 },
  'lightning': { name: 'Молния', type: 'spell', cls: 'mage', manaCost: 7, cooldown: 0, desc: 'Удар молнией с цепным эффектом. d8 урона, перескакивает на 2 ближайших врагов.', unlockLevel: 7, difficulty: 3, range: 5 },
  'teleport': { name: 'Телепортация', type: 'spell', cls: 'mage', manaCost: 9, cooldown: 0, desc: 'Мгновенное перемещение на 6 клеток. Игнорирует препятствия.', unlockLevel: 10, difficulty: 4, range: 6 },
  'heal': { name: 'Лечение', type: 'spell', cls: 'priest', manaCost: 5, cooldown: 0, desc: 'Восстанавливает d8+4 HP союзнику на расстоянии до 4 клеток.', unlockLevel: 2, difficulty: 2, range: 4 },
  'bless': { name: 'Благословение', type: 'spell', cls: 'priest', manaCost: 5, cooldown: 0, desc: '+2 к атаке и +2 к броне союзнику на 3 хода. Дальность 4 клетки.', unlockLevel: 4, difficulty: 2, range: 4 },
  'smite': { name: 'Кара', type: 'spell', cls: 'priest', manaCost: 7, cooldown: 0, desc: 'Святой урон d8 по одной цели. Дальность 5. Бонус против нежити.', unlockLevel: 7, difficulty: 3, range: 5 },
  'sanctuary': { name: 'Святилище', type: 'spell', cls: 'priest', manaCost: 9, cooldown: 0, desc: 'Зона защиты радиусом 2 на 3 хода. Союзники внутри получают -2 к входящему урону.', unlockLevel: 10, difficulty: 4, range: 2 },
  'mass-heal': { name: 'Массовое лечение', type: 'spell', cls: 'priest', manaCost: 12, cooldown: 0, desc: 'Лечит d10+5 HP всем союзникам в бою.', unlockLevel: 15, difficulty: 5 },
  'inspire': { name: 'Вдохновение', type: 'class_ability', cls: 'bard', manaCost: 3, cooldown: 0, desc: 'Вдохновляет союзника: +2 ко всем статам на 3 хода. Дальность 4 клетки.', unlockLevel: 2, difficulty: 1, range: 4 },
  'lullaby': { name: 'Колыбельная', type: 'class_ability', cls: 'bard', manaCost: 5, cooldown: 0, desc: 'С 50% шансом усыпляет врага на 1 ход. Дальность 4 клетки.', unlockLevel: 4, difficulty: 2, range: 4 },
  'discord': { name: 'Диссонанс', type: 'class_ability', cls: 'bard', manaCost: 7, cooldown: 0, desc: 'Ослабляет врагов в радиусе 2: -2 к атаке на 2 хода.', unlockLevel: 7, difficulty: 3, range: 4 },
  'song-of-rest': { name: 'Песнь отдыха', type: 'class_ability', cls: 'bard', manaCost: 9, cooldown: 0, desc: 'Восстанавливает d6+3 HP и 5 MP всем союзникам.', unlockLevel: 10, difficulty: 4 },
  'human-adaptability': { name: 'Адаптивность', type: 'passive', cls: 'any', manaCost: 0, cooldown: 0, desc: 'Расовая пассивка человека. +1 ко всем характеристикам.', unlockLevel: 1, difficulty: 0 },
  'elf-keen-sight': { name: 'Острое зрение', type: 'passive', cls: 'any', manaCost: 0, cooldown: 0, desc: 'Расовая пассивка эльфа. +1 к радиусу обзора.', unlockLevel: 1, difficulty: 0 },
  'dwarf-toughness': { name: 'Стойкость', type: 'passive', cls: 'any', manaCost: 0, cooldown: 0, desc: 'Расовая пассивка дварфа. +5 к максимальному HP.', unlockLevel: 1, difficulty: 0 },
};

async function showAbilityDescription(abilityId: string) {
  const el = document.getElementById('inv-description');
  if (!el) return;

  // Try local DB first
  let info = ABILITY_DB[abilityId];

  // Try fetching from API if not in local DB
  if (!info) {
    try {
      const data = await api.get(`/api/bestiary?tab=abilities&search=${encodeURIComponent(abilityId)}&limit=1`);
      const found = data.data?.[0];
      if (found) {
        info = {
          name: found.name,
          type: found.type,
          cls: found.cls,
          manaCost: found.manaCost || 0,
          cooldown: found.cooldown || 0,
          desc: found.description || '',
          unlockLevel: found.unlockLevel || 1,
          difficulty: found.difficulty || 1,
          range: found.range,
        };
      }
    } catch {}
  }

  if (!info) {
    el.innerHTML = `
      <h4 class="inv-section-title" style="color:var(--gold)">${abilityId}</h4>
      <p class="inv-desc-text" style="color:var(--text-dim)">Информация о способности недоступна</p>
    `;
    return;
  }

  const typeLabels: Record<string, string> = {
    class_ability: 'Классовая способность', spell: 'Заклинание', skill: 'Навык',
    focus: 'Фокус', passive: 'Пассивная способность',
  };
  const clsLabels: Record<string, string> = { warrior: 'Воин', mage: 'Маг', priest: 'Жрец', bard: 'Бард', any: 'Все классы' };
  const diffLabels = ['', '①', '②', '③', '④', '⑤', '⑥'];

  el.innerHTML = `
    <h4 class="inv-section-title" style="color:var(--gold)">${info.name}</h4>
    <p class="inv-desc-type">${typeLabels[info.type] || info.type} · ${clsLabels[info.cls] || info.cls}</p>
    <p class="inv-desc-text">${info.desc}</p>
    <div class="inv-ability-details">
      ${info.manaCost > 0 ? `<div class="inv-ability-detail"><span class="inv-detail-label">Мана:</span><span class="inv-detail-value" style="color:var(--blue)">${info.manaCost} MP</span></div>` : ''}
      ${info.cooldown > 0 ? `<div class="inv-ability-detail"><span class="inv-detail-label">Кулдаун:</span><span class="inv-detail-value">${info.cooldown} ходов</span></div>` : ''}
      ${info.range ? `<div class="inv-ability-detail"><span class="inv-detail-label">Дальность:</span><span class="inv-detail-value">${info.range} клеток</span></div>` : ''}
      ${info.difficulty > 0 ? `<div class="inv-ability-detail"><span class="inv-detail-label">Сложность:</span><span class="inv-detail-value">${diffLabels[info.difficulty] || info.difficulty}</span></div>` : ''}
      <div class="inv-ability-detail"><span class="inv-detail-label">Уровень:</span><span class="inv-detail-value" style="color:var(--gold)">Ур. ${info.unlockLevel}</span></div>
    </div>
  `;
}

async function saveHero(hero: any) {
  try {
    await api.patch(`/api/heroes/${hero._id}`, {
      equipment: hero.equipment,
      inventory: hero.inventory,
      stash: hero.stash,
      hp: hero.hp,
      mp: hero.mp,
    });
  } catch (err) {
    console.error('Save hero error:', err);
  }
}

function getItemEmoji(type: string): string {
  const map: Record<string, string> = {
    weapon: '⚔️', armor: '🛡️', helmet: '⛑️', boots: '👢', pants: '👖',
    shield: '🛡️', ring: '💍', amulet: '📿', potion: '🧪', scroll: '📜',
    tool: '🔧', food: '🍖', junk: '💎', quest: '⭐', jewelry: '💎',
  };
  return map[type] || '📦';
}
