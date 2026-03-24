import { api } from '../../core/api';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';

const RACES = [
  { id: 'human', name: 'Человек', bonus: '+1 ко всем характеристикам', desc: 'Универсальные и адаптивные. Люди преуспевают в любой роли благодаря своей гибкости.', color: '#c9a24e' },
  { id: 'elf', name: 'Эльф', bonus: '+2 Интеллект, +1 Ловкость', desc: 'Древняя раса с врождённой связью с магией. Грациозные и мудрые.', color: '#5ba3e6' },
  { id: 'dwarf', name: 'Дварф', bonus: '+2 Сила, +1 Восприятие', desc: 'Стойкие и выносливые. Дварфы славятся своей несгибаемой волей и мастерством.', color: '#a0724a' },
];

const GENDERS = [
  { id: 'male', name: 'Мужской', icon: '♂', desc: 'Могучий воин, мудрый маг или отважный искатель приключений', color: '#5b8fff' },
  { id: 'female', name: 'Женский', icon: '♀', desc: 'Бесстрашная воительница, искусная чародейка или хитрая авантюристка', color: '#e879a0' },
];

const CLASSES = [
  { id: 'warrior', name: 'Воин', role: 'Танк / Урон', skills: ['Удар щитом', 'Рывок', 'Боевой клич'], color: '#c9a24e' },
  { id: 'mage', name: 'Маг', role: 'Урон / Контроль', skills: ['Огненный болт', 'Ледяной щит', 'Телепортация'], color: '#5b8fff' },
  { id: 'priest', name: 'Жрец', role: 'Лечение / Поддержка', skills: ['Лечение', 'Благословение', 'Божественный свет'], color: '#4dff88' },
  { id: 'bard', name: 'Бард', role: 'Поддержка / Универсал', skills: ['Вдохновение', 'Песнь мужества', 'Обман'], color: '#c084fc' },
];

const STATS_INFO = [
  { key: 'attack', name: 'Сила', desc: 'Физическая сила и урон в ближнем бою', color: '#ff6b6b' },
  { key: 'agility', name: 'Ловкость', desc: 'Скорость, уклонение и дальний бой', color: '#3acc60' },
  { key: 'armor', name: 'Выносливость', desc: 'Здоровье, броня и сопротивление урону', color: '#ff8c42' },
  { key: 'intellect', name: 'Интеллект', desc: 'Магическая сила и объём маны', color: '#5b8fff' },
  { key: 'wisdom', name: 'Мудрость', desc: 'Обнаружение ловушек и сила исцеления', color: '#c084fc' },
  { key: 'charisma', name: 'Харизма', desc: 'Торговля, убеждение и лидерство', color: '#e8c85a' },
];

const STEP_LABELS = ['РАСА', 'ПОЛ', 'КЛАСС', 'ХАРАКТЕРИСТИКИ', 'ИМЯ'];

const NAME_SUGGESTIONS = ['Алдрик', 'Казлус', 'Фергус', 'Зарина', 'Эльвира', 'Торгрим', 'Линдара', 'Орион'];

export function renderCharCreate(container: HTMLElement): void {
  clearElement(container);
  const user = getCurrentUser();

  let step = 0;
  let race = '';
  let gender = '';
  let cls = '';
  let heroName = '';
  const statBonuses: Record<string, number> = {};
  let remainingPoints = 6;

  const page = document.createElement('div');
  page.className = 'cc';
  container.appendChild(page);
  addCharCreateStyles();

  function render() {
    page.innerHTML = `
      <!-- Header -->
      <header class="cc-header">
        <div class="cc-header-left">
          <a href="/" class="cc-logo">Taloria</a>
          <span class="cc-breadcrumb">/ Создание персонажа</span>
        </div>
        <div class="cc-header-right">
          <button class="cc-cancel-btn" id="btn-cancel">ОТМЕНА</button>
          <span class="cc-username">${user?.displayName || ''}</span>
          <button class="cc-logout-btn" id="btn-cc-logout">Выйти</button>
        </div>
      </header>

      <!-- Stepper -->
      <div class="cc-stepper">
        ${STEP_LABELS.map((label, i) => `
          <div class="cc-step ${i < step ? 'cc-step--done' : ''} ${i === step ? 'cc-step--active' : ''}">
            <div class="cc-step-circle">${i + 1}</div>
            <span class="cc-step-label">${label}</span>
          </div>
          ${i < STEP_LABELS.length - 1 ? '<div class="cc-step-line"></div>' : ''}
        `).join('')}
      </div>

      <!-- Content -->
      <div class="cc-content" id="cc-content"></div>

      <!-- Nav buttons -->
      <div class="cc-nav">
        ${step > 0 ? '<button class="cc-nav-back" id="btn-back">НАЗАД</button>' : ''}
        ${step < 4 ? `<button class="cc-nav-next ${!isStepValid() ? 'cc-nav-next--disabled' : ''}" id="btn-next" ${!isStepValid() ? 'disabled' : ''}>ДАЛЕЕ</button>` : ''}
        ${step === 4 ? `<button class="cc-nav-create" id="btn-create" ${!heroName.trim() ? 'disabled' : ''}>СОЗДАТЬ ГЕРОЯ</button>` : ''}
      </div>
    `;

    const content = page.querySelector('#cc-content')!;
    renderStep(content);

    // Events
    page.querySelector('#btn-cancel')?.addEventListener('click', () => navigateTo('/dashboard'));
    page.querySelector('#btn-cc-logout')?.addEventListener('click', () => navigateTo('/'));
    page.querySelector('#btn-back')?.addEventListener('click', () => { step--; render(); });
    page.querySelector('#btn-next')?.addEventListener('click', () => { if (isStepValid()) { step++; render(); } });
    page.querySelector('#btn-create')?.addEventListener('click', createHero);
  }

  function isStepValid(): boolean {
    if (step === 0) return !!race;
    if (step === 1) return !!gender;
    if (step === 2) return !!cls;
    return true;
  }

  function renderStep(el: Element) {
    switch (step) {
      case 0: renderRaceStep(el); break;
      case 1: renderGenderStep(el); break;
      case 2: renderClassStep(el); break;
      case 3: renderStatsStep(el); break;
      case 4: renderNameStep(el); break;
    }
  }

  function renderRaceStep(el: Element) {
    el.innerHTML = `
      <h2 class="cc-title">Выберите расу</h2>
      <p class="cc-subtitle">Раса определяет бонусы характеристик и уникальные способности</p>
      <div class="cc-cards cc-cards--3">
        ${RACES.map(r => `
          <div class="cc-card ${race === r.id ? 'cc-card--selected' : ''}" data-value="${r.id}">
            <div class="cc-card-circle" style="background:${r.color}30;border-color:${r.color}50"></div>
            <h3 class="cc-card-name" style="color:${r.color}">${r.name}</h3>
            <p class="cc-card-bonus" style="color:${r.color}">${r.bonus}</p>
            <p class="cc-card-desc">${r.desc}</p>
          </div>
        `).join('')}
      </div>
    `;
    el.querySelectorAll('.cc-card').forEach(c => c.addEventListener('click', () => {
      race = (c as HTMLElement).dataset.value!;
      render();
    }));
  }

  function renderGenderStep(el: Element) {
    el.innerHTML = `
      <h2 class="cc-title">Выберите пол</h2>
      <p class="cc-subtitle">Пол влияет на внешность и обращения в диалогах</p>
      <div class="cc-cards cc-cards--2">
        ${GENDERS.map(g => `
          <div class="cc-card ${gender === g.id ? 'cc-card--selected' : ''}" data-value="${g.id}">
            <div class="cc-card-circle cc-card-circle--gender" style="background:${g.color}25;border-color:${g.color}50;color:${g.color}">${g.icon}</div>
            <h3 class="cc-card-name" style="color:${g.color}">${g.name}</h3>
            <p class="cc-card-desc">${g.desc}</p>
          </div>
        `).join('')}
      </div>
    `;
    el.querySelectorAll('.cc-card').forEach(c => c.addEventListener('click', () => {
      gender = (c as HTMLElement).dataset.value!;
      render();
    }));
  }

  function renderClassStep(el: Element) {
    el.innerHTML = `
      <h2 class="cc-title">Выберите класс</h2>
      <p class="cc-subtitle">Класс определяет вашу роль в команде и набор навыков</p>
      <div class="cc-cards cc-cards--4">
        ${CLASSES.map(c => `
          <div class="cc-card ${cls === c.id ? 'cc-card--selected' : ''}" data-value="${c.id}">
            <div class="cc-card-circle" style="background:${c.color}20;border-color:${c.color}40"></div>
            <h3 class="cc-card-name" style="color:${c.color}">${c.name}</h3>
            <p class="cc-card-role">${c.role}</p>
            <div class="cc-card-skills">${c.skills.map(s => `<span class="cc-skill-tag">${s}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
    el.querySelectorAll('.cc-card').forEach(c => c.addEventListener('click', () => {
      cls = (c as HTMLElement).dataset.value!;
      render();
    }));
  }

  function renderStatsStep(el: Element) {
    el.innerHTML = `
      <h2 class="cc-title">Распределите характеристики</h2>
      <p class="cc-subtitle">Доступно очков: <strong style="color:var(--gold)">${remainingPoints}</strong></p>
      <div class="cc-stats-layout">
        <div class="cc-stats-portrait" style="background-image:url('/uploads/heroes/${race || 'human'}-${gender || 'male'}-${cls || 'warrior'}.png')"></div>
        <div class="cc-stats-list">
          ${STATS_INFO.map(s => `
            <div class="cc-stat-row">
              <div class="cc-stat-color" style="background:${s.color}"></div>
              <div class="cc-stat-info">
                <span class="cc-stat-name">${s.name}</span>
                <span class="cc-stat-desc">${s.desc}</span>
              </div>
              <button class="cc-stat-btn" data-stat="${s.key}" data-dir="-">−</button>
              <span class="cc-stat-val">${6 + (statBonuses[s.key] || 0)}</span>
              <button class="cc-stat-btn" data-stat="${s.key}" data-dir="+">+</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    el.querySelectorAll('.cc-stat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stat = (btn as HTMLElement).dataset.stat!;
        const dir = (btn as HTMLElement).dataset.dir!;
        if (dir === '+' && remainingPoints > 0 && (statBonuses[stat] || 0) < 6) {
          statBonuses[stat] = (statBonuses[stat] || 0) + 1;
          remainingPoints--;
        } else if (dir === '-' && (statBonuses[stat] || 0) > 0) {
          statBonuses[stat]!--;
          remainingPoints++;
        }
        render();
      });
    });
  }

  function renderNameStep(el: Element) {
    el.innerHTML = `
      <h2 class="cc-title">Дайте имя герою</h2>
      <p class="cc-subtitle">Выберите имя, которое войдёт в легенды</p>
      <div class="cc-name-form">
        <input type="text" class="cc-name-input" id="cc-name" placeholder="Введите имя героя..." maxlength="24" value="${heroName}" />
        <div class="cc-name-suggestions">
          <span class="cc-suggest-label">Предложения:</span>
          <div class="cc-suggest-list">
            ${NAME_SUGGESTIONS.map(n => `<button class="cc-suggest-btn" data-name="${n}">${n}</button>`).join('')}
          </div>
        </div>
      </div>
    `;
    const input = el.querySelector('#cc-name') as HTMLInputElement;
    input?.addEventListener('input', () => {
      heroName = input.value;
      const createBtn = page.querySelector('#btn-create') as HTMLButtonElement;
      if (createBtn) createBtn.disabled = !heroName.trim();
    });
    input?.focus();
    el.querySelectorAll('.cc-suggest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        heroName = (btn as HTMLElement).dataset.name!;
        if (input) input.value = heroName;
        const createBtn = page.querySelector('#btn-create') as HTMLButtonElement;
        if (createBtn) createBtn.disabled = false;
      });
    });
  }

  async function createHero() {
    if (!heroName.trim()) return;
    try {
      const result = await api.post('/api/heroes', {
        name: heroName.trim(), cls, race, gender,
        statBonuses: Object.keys(statBonuses).length ? statBonuses : undefined,
      });
      // Show post-creation popup
      showCreatedPopup(result.hero);
    } catch (err: any) {
      alert(err.error || 'Ошибка создания героя');
    }
  }

  function showCreatedPopup(hero: any) {
    const overlay = document.createElement('div');
    overlay.className = 'cc-popup-overlay';
    overlay.innerHTML = `
      <div class="cc-popup">
        <div class="cc-popup-icon">⚔️</div>
        <h3 class="cc-popup-title">Герой создан!</h3>
        <p class="cc-popup-text"><strong style="color:var(--gold)">${hero.name}</strong> готов к приключениям.</p>
        <p class="cc-popup-text">Перейдите в инвентарь, чтобы получить начальную экипировку и выбрать оружие.</p>
        <div class="cc-popup-actions">
          <button class="cc-popup-btn cc-popup-btn--primary" id="btn-go-inventory">ПОЛУЧИТЬ ЭКИПИРОВКУ</button>
          <button class="cc-popup-btn cc-popup-btn--secondary" id="btn-go-dashboard">Позже</button>
        </div>
      </div>
    `;
    page.appendChild(overlay);

    overlay.querySelector('#btn-go-inventory')?.addEventListener('click', () => {
      sessionStorage.setItem('new_hero_setup', hero._id);
      navigateTo('/inventory');
    });
    overlay.querySelector('#btn-go-dashboard')?.addEventListener('click', () => {
      navigateTo('/dashboard');
    });
  }

  render();
}

function addCharCreateStyles() {
  if (document.getElementById('cc-styles')) return;
  const style = document.createElement('style');
  style.id = 'cc-styles';
  style.textContent = `
    .cc { background: linear-gradient(180deg, #0b0f15, #0e1219); min-height: 100vh; color: var(--text); display: flex; flex-direction: column; }

    .cc-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: rgba(11,13,18,0.97); border-bottom: 1px solid var(--panel-border); }
    .cc-header-left { display: flex; align-items: center; gap: 12px; }
    .cc-logo { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: #d4a84b; text-decoration: none; letter-spacing: 0.12em; }
    .cc-breadcrumb { color: var(--text-muted); font-size: 0.82rem; }
    .cc-header-right { display: flex; align-items: center; gap: 12px; }
    .cc-cancel-btn { background: none; border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; font-family: var(--font-body); }
    .cc-username { color: var(--gold); font-size: 0.85rem; }
    .cc-logout-btn { background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 0.72rem; font-family: var(--font-body); }

    /* Stepper */
    .cc-stepper { display: flex; align-items: center; justify-content: center; gap: 0; padding: 28px 24px 24px; max-width: 600px; margin: 0 auto; }
    .cc-step { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
    .cc-step-circle { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); transition: all 0.3s; }
    .cc-step--done .cc-step-circle { border-color: var(--gold-dim); color: var(--gold); background: rgba(201,162,78,0.1); }
    .cc-step--active .cc-step-circle { border-color: var(--gold); color: #1a1500; background: var(--gold); font-weight: 900; }
    .cc-step-label { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.06em; color: var(--text-muted); text-transform: uppercase; }
    .cc-step--done .cc-step-label { color: var(--gold-dim); }
    .cc-step--active .cc-step-label { color: var(--text); font-weight: 700; }
    .cc-step-line { flex: 1; height: 1px; background: rgba(255,255,255,0.1); margin: 0 10px; margin-bottom: 20px; min-width: 30px; }

    /* Content */
    .cc-content { max-width: 1000px; margin: 0 auto; padding: 0 24px; width: 100%; }
    .cc-title { font-family: var(--font-heading); font-size: 1.6rem; color: var(--gold); text-align: center; margin-bottom: 8px; }
    .cc-subtitle { color: var(--text-dim); font-size: 0.88rem; text-align: center; margin-bottom: 28px; }

    /* Cards */
    .cc-cards { display: grid; gap: 16px; }
    .cc-cards--2 { grid-template-columns: repeat(2, 1fr); max-width: 700px; margin: 0 auto; }
    .cc-cards--3 { grid-template-columns: repeat(3, 1fr); }
    .cc-cards--4 { grid-template-columns: repeat(4, 1fr); }

    .cc-card {
      background: rgba(16,20,30,0.6); border: 2px solid rgba(255,255,255,0.06); border-radius: 8px;
      padding: 24px 20px; text-align: center; cursor: pointer; transition: all 0.3s;
    }
    .cc-card:hover { border-color: rgba(201,162,78,0.3); }
    .cc-card--selected { border-color: rgba(201,162,78,0.6); box-shadow: 0 0 20px rgba(201,162,78,0.08); background: rgba(201,162,78,0.03); }

    .cc-card-circle { width: 64px; height: 64px; border-radius: 50%; border: 2px solid; margin: 0 auto 14px; }
    .cc-card-circle--gender { display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
    .cc-card-name { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
    .cc-card-bonus { font-size: 0.75rem; margin-bottom: 10px; }
    .cc-card-role { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 10px; }
    .cc-card-desc { color: var(--text-dim); font-size: 0.78rem; line-height: 1.5; }
    .cc-card-skills { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
    .cc-skill-tag { font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text-dim); }

    /* Stats */
    .cc-stats-layout { display: grid; grid-template-columns: 300px 1fr; gap: 28px; }
    .cc-stats-portrait { height: 400px; background-size: cover; background-position: center top; border-radius: 8px; border: 1px solid rgba(201,162,78,0.15); background-color: rgba(20,18,14,0.5); }
    .cc-stats-list { display: flex; flex-direction: column; gap: 10px; }
    .cc-stat-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(16,20,30,0.5); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; }
    .cc-stat-color { width: 8px; height: 32px; border-radius: 3px; flex-shrink: 0; }
    .cc-stat-info { flex: 1; }
    .cc-stat-name { display: block; font-size: 0.88rem; font-weight: 600; }
    .cc-stat-desc { display: block; font-size: 0.68rem; color: var(--text-muted); }
    .cc-stat-btn { width: 28px; height: 28px; border-radius: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .cc-stat-btn:hover { border-color: var(--gold-dim); color: var(--gold); }
    .cc-stat-val { width: 28px; text-align: center; font-size: 1.1rem; font-weight: 700; color: var(--text); }

    /* Name */
    .cc-name-form { max-width: 500px; margin: 0 auto; }
    .cc-name-input { width: 100%; padding: 16px 20px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text); font-size: 1rem; font-family: var(--font-body); text-align: center; }
    .cc-name-input:focus { outline: none; border-color: var(--gold-dim); }
    .cc-name-input::placeholder { color: var(--text-muted); }
    .cc-name-suggestions { margin-top: 20px; text-align: center; }
    .cc-suggest-label { color: var(--text-muted); font-size: 0.78rem; display: block; margin-bottom: 10px; }
    .cc-suggest-list { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .cc-suggest-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text-dim); padding: 6px 16px; border-radius: 20px; cursor: pointer; font-size: 0.82rem; font-family: var(--font-body); transition: all 0.2s; }
    .cc-suggest-btn:hover { border-color: var(--gold-dim); color: var(--gold); }

    /* Nav */
    .cc-nav { display: flex; justify-content: center; gap: 12px; padding: 20px 24px 40px; margin-top: 8px; }
    .cc-nav-back { background: none; border: 1px solid rgba(255,255,255,0.12); color: var(--text-dim); padding: 12px 32px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em; font-family: var(--font-body); }
    .cc-nav-back:hover { border-color: rgba(255,255,255,0.3); color: var(--text); }
    .cc-nav-next, .cc-nav-create { background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; padding: 12px 32px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; font-family: var(--font-body); transition: all 0.2s; }
    .cc-nav-next:hover, .cc-nav-create:hover { box-shadow: 0 4px 20px rgba(232,200,90,0.3); }
    .cc-nav-next--disabled, .cc-nav-next:disabled, .cc-nav-create:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

    /* Post-creation popup */
    .cc-popup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.3s; }
    .cc-popup { background: linear-gradient(180deg, rgba(22,20,16,0.98), rgba(14,12,10,0.99)); border: 2px solid rgba(201,162,78,0.3); border-radius: 12px; padding: 40px 36px; max-width: 440px; width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.6); animation: scaleIn 0.3s ease; }
    .cc-popup-icon { font-size: 3rem; margin-bottom: 16px; }
    .cc-popup-title { font-family: var(--font-heading); font-size: 1.5rem; color: var(--gold); margin-bottom: 12px; }
    .cc-popup-text { color: var(--text-dim); font-size: 0.88rem; margin-bottom: 8px; line-height: 1.5; }
    .cc-popup-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
    .cc-popup-btn { padding: 14px 24px; border-radius: 6px; font-size: 0.85rem; font-weight: 700; font-family: var(--font-body); cursor: pointer; letter-spacing: 0.04em; transition: all 0.2s; border: none; }
    .cc-popup-btn--primary { background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; }
    .cc-popup-btn--primary:hover { box-shadow: 0 4px 20px rgba(232,200,90,0.3); }
    .cc-popup-btn--secondary { background: none; border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); }
    .cc-popup-btn--secondary:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }

    @media (max-width: 768px) {
      .cc-cards--3, .cc-cards--4 { grid-template-columns: 1fr 1fr; }
      .cc-stats-layout { grid-template-columns: 1fr; }
      .cc-stats-portrait { height: 250px; }
      .cc-step-line { width: 20px; }
    }
  `;
  document.head.appendChild(style);
}
