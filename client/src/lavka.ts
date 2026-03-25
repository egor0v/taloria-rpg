/**
 * Lavka (Shop) — Главная Лавка
 */
import './styles/variables.css';
import './styles/animations.css';

let authToken: string | null = localStorage.getItem('taloria_token');
const app = document.getElementById('lavka-app')!;

async function apiFetch(url: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return fetch(url, { headers, credentials: 'include' }).then(r => r.json());
}

async function render() {
  const catalog = await apiFetch('/api/store/catalog');
  const wallet = authToken ? await apiFetch('/api/wallet').catch(() => ({ gold: 0, silver: 0 })) : { gold: 0, silver: 0 };
  const entitlements = authToken ? await apiFetch('/api/store/entitlements').catch(() => ({})) : {};

  const subTier = entitlements.subscription?.tier || 'none';
  const subLabel = subTier === 'none' ? 'Нет подписки' : { stranger: 'Странник', seeker: 'Искатель', legend: 'Легенда' }[subTier] || subTier;
  const heroSlots = entitlements.heroSlots || 2;

  const sections = catalog.sections || {};
  const allItems = catalog.items || [];

  // Group items
  const subscriptions = (sections.subscriptions || []) as any[];
  const maps = (sections.maps || []) as any[];
  const addons = (sections.addons || []) as any[];
  const heroes = (sections.heroes || []) as any[];
  const mint = (sections.mint || []) as any[];

  app.innerHTML = `
    <div class="lavka">
      <!-- Header -->
      <header class="lavka-header">
        <a href="/" class="lavka-logo">Taloria</a>
        <a href="/" class="lavka-back">← В игру</a>
        <div class="lavka-header-right">
          <span class="lavka-wallet">Ⓖ ${wallet.gold || 0}</span>
          <span class="lavka-wallet">Ⓢ ${wallet.silver || 0}</span>
          <span class="lavka-help" title="Справка">?</span>
        </div>
      </header>

      <!-- Hero Banner -->
      <div class="lavka-banner">
        <h1 class="lavka-title">ГЛАВНАЯ ЛАВКА</h1>
        <p class="lavka-subtitle">Карты, подписки, валюта и всё для приключений в мире Талории</p>
      </div>

      <!-- Info Bar -->
      <div class="lavka-info-bar">
        <div class="lavka-info-item">
          <span class="lavka-info-label">ПОДПИСКА</span>
          <span class="lavka-info-value ${subTier !== 'none' ? 'lavka-info-active' : ''}">${subLabel}</span>
        </div>
        <div class="lavka-info-item">
          <span class="lavka-info-label">КОШЕЛЁК</span>
          <span class="lavka-info-value">Ⓖ ${wallet.gold || 0}  Ⓢ ${wallet.silver || 0}</span>
        </div>
        <div class="lavka-info-item">
          <span class="lavka-info-label">СЛОТЫ ГЕРОЕВ</span>
          <span class="lavka-info-value">${heroSlots} / ${heroSlots}</span>
        </div>
      </div>

      <!-- Navigation Tabs (anchor links) -->
      <nav class="lavka-tabs" id="lavka-tabs">
        <a href="#section-subscriptions" class="lavka-tab active" data-section="subscriptions">Подписки</a>
        <a href="#section-maps" class="lavka-tab" data-section="maps">Карты и сценарии</a>
        <a href="#section-addons" class="lavka-tab" data-section="addons">Дополнения</a>
        <a href="#section-heroes" class="lavka-tab" data-section="heroes">Герои</a>
        <a href="#section-mint" class="lavka-tab" data-section="mint">Монетный двор</a>
      </nav>

      <!-- Content -->
      <div class="lavka-content">

        <!-- Subscriptions -->
        ${subscriptions.length ? `
        <section class="lavka-section" id="section-subscriptions">
          <div class="lavka-sub-cards">
            ${subscriptions.map((item: any) => {
              const tier = item.subscriptionTier || '';
              const tierLabels: Record<string, string> = { stranger: 'Странник', seeker: 'Искатель', legend: 'Легенда' };
              const tierColors: Record<string, string> = { stranger: '#9D9D9D', seeker: '#A335EE', legend: '#FF8000' };
              const price = (item.priceKopecks / 100).toLocaleString('ru');
              const months = item.subscriptionPeriodMonths || 1;
              const features: Record<string, string[]> = {
                stranger: ['1 карта в месяц', '+1 дополнительный слот героя', 'Бонусные предметы при входе', 'Значок «Странник» в профиле'],
                seeker: ['3 карты в месяц', '+2 дополнительных слота героев', 'Расширенные бонусы при входе', 'Значок «Искатель» в профиле', 'Приоритет в подборе команды'],
                legend: ['6 карт в месяц', 'Безлимитные слоты героев', 'Все бонусы при входе', 'Золотой значок «Легенда»', 'Эксклюзивные косметические предметы', 'Ранний доступ к новому контенту'],
              };
              const isRecommended = tier === 'seeker';
              return `
                <div class="lavka-sub-card ${isRecommended ? 'lavka-sub-card--recommended' : ''}">
                  ${isRecommended ? '<div class="lavka-badge lavka-badge--purple">РЕКОМЕНДУЕМ</div>' : ''}
                  ${item.badge && !isRecommended ? `<div class="lavka-badge">${item.badge}</div>` : ''}
                  <h3 class="lavka-sub-tier" style="color:${tierColors[tier] || 'var(--gold)'}">${tierLabels[tier] || item.title}</h3>
                  <p class="lavka-sub-desc">${item.description || ''}</p>
                  <div class="lavka-sub-price">${price} ₽</div>
                  <div class="lavka-sub-period">за ${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}</div>
                  <ul class="lavka-sub-features">
                    ${(features[tier] || []).map(f => `<li>✦ ${f}</li>`).join('')}
                  </ul>
                  <button class="lavka-buy-btn" data-slug="${item.slug}">${item.owned ? '✅ Активна' : 'Оформить'}</button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
        ` : ''}

        <!-- Maps -->
        ${maps.length ? `
        <section class="lavka-section" id="section-maps">
          <h2 class="lavka-section-title">Карты и сценарии</h2>
          <div class="lavka-cards-grid">
            ${maps.map((item: any) => renderProductCard(item)).join('')}
          </div>
        </section>
        ` : ''}

        <!-- Addons -->
        ${addons.length ? `
        <section class="lavka-section" id="section-addons">
          <h2 class="lavka-section-title">Дополнения</h2>
          <div class="lavka-cards-grid">
            ${addons.map((item: any) => renderProductCard(item)).join('')}
          </div>
        </section>
        ` : ''}

        <!-- Heroes -->
        ${heroes.length ? `
        <section class="lavka-section" id="section-heroes">
          <h2 class="lavka-section-title">Герои</h2>
          <div class="lavka-cards-grid">
            ${heroes.map((item: any) => renderProductCard(item)).join('')}
          </div>
        </section>
        ` : ''}

        <!-- Mint -->
        ${mint.length ? `
        <section class="lavka-section" id="section-mint">
          <h2 class="lavka-section-title">Монетный двор</h2>
          <div class="lavka-cards-grid lavka-cards-grid--4">
            ${mint.map((item: any) => {
              const price = (item.priceKopecks / 100).toLocaleString('ru');
              const origPrice = item.originalPriceKopecks ? (item.originalPriceKopecks / 100).toLocaleString('ru') : '';
              const goldAmount = item.walletGoldAmount || 0;
              const silverAmount = item.walletSilverAmount || 0;
              return `
                <div class="lavka-card">
                  ${item.badge ? `<div class="lavka-badge">${item.badge}</div>` : ''}
                  <h3 class="lavka-card-title">${item.title}</h3>
                  <div class="lavka-mint-amount">
                    ${goldAmount ? `Ⓖ ${goldAmount.toLocaleString('ru')}` : ''}
                    ${silverAmount ? `Ⓢ ${silverAmount.toLocaleString('ru')}` : ''}
                  </div>
                  <p class="lavka-card-desc">${item.description || ''}</p>
                  <div class="lavka-card-price">
                    <span class="lavka-price">${price} ₽</span>
                    ${origPrice ? `<span class="lavka-price-old">${origPrice} ₽</span>` : ''}
                  </div>
                  <button class="lavka-buy-btn" data-slug="${item.slug}">Купить</button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
        ` : ''}

        <!-- Exchange: Тавориены → Игровая валюта -->
        ${authToken ? `
        <section class="lavka-section" id="section-exchange">
          <h2 class="lavka-section-title">Обменник</h2>
          <p class="lavka-section-desc">Обменяйте Талориены на игровое золото для вашего героя. Курс: 100 Талориенов = 1 Золото</p>
          <div class="exchange-block">
            <div class="exchange-hero-select">
              <label class="exchange-label">Выберите героя:</label>
              <select class="exchange-select" id="exchange-hero-select">
                <option value="">Загрузка...</option>
              </select>
              <div class="exchange-hero-balance" id="exchange-hero-balance"></div>
            </div>
            <div class="exchange-row exchange-row--single">
              <div class="exchange-card">
                <div class="exchange-card-header">🪙 Талориены → Золото</div>
                <div class="exchange-rate">100 Талориенов = 1 золотая монета</div>
                <div class="exchange-input-wrap">
                  <label class="exchange-input-label">Сколько золота получить:</label>
                  <input type="number" class="exchange-input" id="exchange-gold-amount" min="1" max="1000" value="1" />
                  <span class="exchange-result" id="exchange-gold-cost">Стоимость: 100 Талориенов</span>
                </div>
                <button class="exchange-btn" id="exchange-gold-btn">Обменять</button>
              </div>
            </div>
            <div class="exchange-wallet-balance">Ваш баланс: <strong id="exchange-wallet-balance">${wallet.silver || 0}</strong> Талориенов</div>
          </div>
        </section>
        ` : ''}

      </div>
    </div>
  `;

  addLavkaStyles();

  // Tab navigation (scroll to section)
  document.querySelectorAll('.lavka-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const section = (tab as HTMLElement).dataset.section!;
      const target = document.getElementById(`section-${section}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.lavka-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  // Intersection observer for active tab
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('section-', '');
        document.querySelectorAll('.lavka-tab').forEach(t => {
          t.classList.toggle('active', (t as HTMLElement).dataset.section === id);
        });
      }
    }
  }, { threshold: 0.3 });

  document.querySelectorAll('.lavka-section').forEach(s => observer.observe(s));

  // Buy buttons
  document.querySelectorAll('.lavka-buy-btn[data-slug]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!authToken) { window.location.href = '/'; return; }
      const slug = (btn as HTMLElement).dataset.slug!;
      try {
        const data = await fetch('/api/store/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ catalogItemSlug: slug }),
        }).then(r => r.json());

        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else if (data.devMode) {
          alert('Покупка выполнена (dev mode)');
          render();
        } else {
          alert(data.error || 'Ошибка');
        }
      } catch { alert('Ошибка покупки'); }
    });
  });

  // ─── EXCHANGE BLOCK ───
  setupExchange();

  // Scroll to hash
  const hash = window.location.hash?.replace('#', '');
  if (hash) {
    setTimeout(() => {
      const target = document.getElementById(hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }
}

function renderProductCard(item: any): string {
  const price = (item.priceKopecks / 100).toLocaleString('ru');
  const origPrice = item.originalPriceKopecks ? (item.originalPriceKopecks / 100).toLocaleString('ru') : '';
  return `
    <div class="lavka-card">
      ${item.badge ? `<div class="lavka-badge">${item.badge}</div>` : ''}
      ${item.imageUrl ? `<img src="${item.imageUrl}" class="lavka-card-img" alt="" />` : ''}
      <h3 class="lavka-card-title">${item.title}</h3>
      <p class="lavka-card-desc">${item.description || ''}</p>
      <div class="lavka-card-price">
        <span class="lavka-price">${price} ₽</span>
        ${origPrice ? `<span class="lavka-price-old">${origPrice} ₽</span>` : ''}
      </div>
      ${item.owned ? '<span class="lavka-owned">✅ Куплено</span>' :
        `<button class="lavka-buy-btn" data-slug="${item.slug}">Купить</button>`}
    </div>
  `;
}

function addLavkaStyles() {
  if (document.getElementById('lavka-styles')) return;
  const style = document.createElement('style');
  style.id = 'lavka-styles';
  style.textContent = `
    .lavka { background: var(--bg); min-height: 100vh; color: var(--text); }

    /* Header */
    .lavka-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: rgba(11,13,18,0.97); border-bottom: 1px solid var(--panel-border); position: sticky; top: 0; z-index: 50; }
    .lavka-logo { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: #d4a84b; text-decoration: none; letter-spacing: 0.12em; }
    .lavka-back { color: var(--text-dim); font-size: 0.82rem; text-decoration: none; transition: color 0.2s; }
    .lavka-back:hover { color: var(--text); }
    .lavka-header-right { display: flex; align-items: center; gap: 12px; }
    .lavka-wallet { color: var(--gold); font-size: 0.82rem; font-weight: 600; }
    .lavka-help { width: 24px; height: 24px; border: 1px solid rgba(255,255,255,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-size: 0.75rem; cursor: pointer; }

    /* Banner */
    .lavka-banner { text-align: center; padding: 48px 24px 24px; background: radial-gradient(ellipse at center, rgba(201,162,78,0.04), transparent); }
    .lavka-title { font-family: var(--font-heading); font-size: 2.5rem; font-weight: 900; color: #d4a84b; letter-spacing: 0.12em; margin-bottom: 8px; }
    .lavka-subtitle { color: var(--text-dim); font-size: 0.9rem; }

    /* Info Bar */
    .lavka-info-bar { display: flex; gap: 32px; justify-content: center; padding: 16px 24px; border-bottom: 1px solid var(--panel-border); }
    .lavka-info-item { display: flex; align-items: center; gap: 8px; }
    .lavka-info-label { color: var(--text-muted); font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .lavka-info-value { color: var(--text); font-size: 0.85rem; font-weight: 600; }
    .lavka-info-active { color: var(--cta); }

    /* Tabs */
    .lavka-tabs { display: flex; gap: 0; justify-content: center; border-bottom: 1px solid var(--panel-border); position: sticky; top: 52px; background: var(--bg); z-index: 40; }
    .lavka-tab { color: var(--text-dim); font-size: 0.82rem; text-decoration: none; padding: 14px 20px; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 500; }
    .lavka-tab:hover { color: var(--text); }
    .lavka-tab.active { color: var(--gold); border-bottom-color: var(--gold); }

    /* Content */
    .lavka-content { max-width: 1200px; margin: 0 auto; padding: 0 24px 60px; }

    /* Sections */
    .lavka-section { padding: 40px 0; }
    .lavka-section-title { font-family: var(--font-heading); font-size: 1.4rem; color: var(--gold); margin-bottom: 24px; }

    /* Subscription Cards */
    .lavka-sub-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
    .lavka-sub-card { background: linear-gradient(180deg, rgba(20,18,14,0.95), rgba(14,12,10,0.98)); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 32px 24px; text-align: center; position: relative; transition: border-color 0.3s; display: flex; flex-direction: column; }
    .lavka-sub-card:hover { border-color: rgba(201,162,78,0.3); }
    .lavka-sub-card--recommended { border-color: rgba(163,53,238,0.4); }
    .lavka-sub-features { flex: 1; }
    .lavka-buy-btn { margin-top: auto; }
    .lavka-sub-tier { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; }
    .lavka-sub-desc { color: var(--text-dim); font-size: 0.8rem; margin-bottom: 20px; }
    .lavka-sub-price { font-family: var(--font-heading); font-size: 2rem; font-weight: 700; color: var(--gold); }
    .lavka-sub-period { color: var(--text-muted); font-size: 0.75rem; margin-bottom: 20px; }
    .lavka-sub-features { list-style: none; text-align: left; margin-bottom: 24px; }
    .lavka-sub-features li { color: var(--text-dim); font-size: 0.82rem; padding: 4px 0; }

    /* Product Cards */
    .lavka-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
    .lavka-cards-grid--4 { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .lavka-card { background: linear-gradient(180deg, rgba(20,18,14,0.95), rgba(14,12,10,0.98)); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 24px; position: relative; transition: border-color 0.3s; }
    .lavka-card:hover { border-color: rgba(201,162,78,0.3); }
    .lavka-card-img { width: 48px; height: 48px; object-fit: contain; margin-bottom: 12px; }
    .lavka-card-title { font-family: var(--font-heading); font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .lavka-card-desc { color: var(--text-dim); font-size: 0.8rem; margin-bottom: 16px; min-height: 36px; }
    .lavka-card-price { margin-bottom: 16px; display: flex; align-items: baseline; gap: 8px; }
    .lavka-price { font-family: var(--font-heading); font-size: 1.3rem; font-weight: 700; color: var(--gold); }
    .lavka-price-old { text-decoration: line-through; color: var(--text-muted); font-size: 0.85rem; }
    .lavka-owned { color: var(--cta); font-size: 0.85rem; }
    .lavka-mint-amount { font-size: 1.1rem; font-weight: 700; color: var(--gold); margin-bottom: 8px; }

    /* Exchange block */
    .exchange-block { background: rgba(16,20,30,0.5); border: 1px solid rgba(201,162,78,0.15); border-radius: 12px; padding: 24px; }
    .exchange-hero-select { margin-bottom: 20px; }
    .exchange-label { font-size: 0.82rem; color: var(--text-dim); margin-bottom: 8px; display: block; }
    .exchange-select { width: 100%; max-width: 400px; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text); font-size: 0.85rem; font-family: var(--font-body); }
    .exchange-select:focus { outline: none; border-color: var(--gold-dim); }
    .exchange-select option { background: #1a1d24; }
    .exchange-hero-balance { margin-top: 8px; font-size: 0.8rem; color: var(--text-dim); }
    .exchange-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .exchange-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 20px; text-align: center; }
    .exchange-card:hover { border-color: rgba(201,162,78,0.2); }
    .exchange-card-header { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
    .exchange-rate { font-size: 0.75rem; color: var(--gold-dim); margin-bottom: 16px; }
    .exchange-input-wrap { margin-bottom: 14px; }
    .exchange-input { width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text); font-size: 0.9rem; text-align: center; font-family: var(--font-body); }
    .exchange-input:focus { outline: none; border-color: var(--gold-dim); }
    .exchange-result { display: block; margin-top: 6px; font-size: 0.82rem; color: var(--cta); font-weight: 600; }
    .exchange-btn { width: 100%; padding: 10px; background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; border-radius: 6px; font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; }
    .exchange-btn:hover { background: linear-gradient(135deg, #ffe08a, #e8c85a); box-shadow: 0 4px 15px rgba(232,200,90,0.3); }
    .exchange-wallet-balance { text-align: center; font-size: 0.85rem; color: var(--text-dim); }
    .exchange-wallet-balance strong { color: var(--gold); font-size: 1.1rem; }
    @media (max-width: 600px) { .exchange-row { grid-template-columns: 1fr; } }

    /* Badge */
    .lavka-badge { position: absolute; top: 12px; right: 12px; background: rgba(201,162,78,0.15); color: var(--gold); font-size: 0.65rem; font-weight: 700; padding: 3px 10px; border-radius: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
    .lavka-badge--purple { background: rgba(163,53,238,0.15); color: #c084fc; }

    /* Buy Button */
    .lavka-buy-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #e8c85a, #c9a24e); color: #1a1500; border: none; border-radius: 6px; font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; }
    .lavka-buy-btn:hover { background: linear-gradient(135deg, #ffe08a, #e8c85a); box-shadow: 0 4px 15px rgba(232,200,90,0.3); }

    @media (max-width: 768px) {
      .lavka-info-bar { flex-direction: column; gap: 8px; align-items: center; }
      .lavka-tabs { overflow-x: auto; justify-content: flex-start; }
      .lavka-tab { white-space: nowrap; font-size: 0.75rem; padding: 12px 14px; }
      .lavka-sub-cards { grid-template-columns: 1fr; }
      @media (min-width: 600px) and (max-width: 900px) { .lavka-sub-cards { grid-template-columns: repeat(2, 1fr); } }
      .lavka-title { font-size: 1.8rem; }
    }
  `;
  document.head.appendChild(style);
}

// ─── EXCHANGE LOGIC ───
async function setupExchange() {
  const heroSelect = document.getElementById('exchange-hero-select') as HTMLSelectElement;
  if (!heroSelect || !authToken) return;

  // Load heroes
  try {
    const data = await apiFetch('/api/heroes');
    const heroes = data.heroes || [];
    const savedHeroId = localStorage.getItem('taloria_selected_hero_id') || '';
    heroSelect.innerHTML = heroes.length
      ? heroes.map((h: any) => `<option value="${h._id}" ${h._id === savedHeroId ? 'selected' : ''}>${h.name} — ${h.race} ${h.cls} Lv${h.level} (🪙${h.gold || 0} 🥈${h.silver || 0})</option>`).join('')
      : '<option value="">Нет героев</option>';

    const updateHeroBalance = () => {
      const hero = heroes.find((h: any) => h._id === heroSelect.value);
      const el = document.getElementById('exchange-hero-balance');
      if (el && hero) el.innerHTML = `Баланс <strong>${hero.name}</strong>: 🪙 ${hero.gold || 0} золота · 🥈 ${hero.silver || 0} серебра`;
    };
    heroSelect.addEventListener('change', updateHeroBalance);
    updateHeroBalance();
  } catch { heroSelect.innerHTML = '<option value="">Ошибка загрузки</option>'; }

  // Курс: 100 Талориенов = 1 Золото
  const goldInput = document.getElementById('exchange-gold-amount') as HTMLInputElement;
  const goldCost = document.getElementById('exchange-gold-cost');
  if (goldInput && goldCost) {
    const update = () => {
      const gold = parseInt(goldInput.value) || 0;
      const cost = gold * 100;
      goldCost.textContent = `Стоимость: ${cost.toLocaleString('ru')} Талориенов`;
    };
    goldInput.addEventListener('input', update);
    update();
  }

  // Exchange button
  document.getElementById('exchange-gold-btn')?.addEventListener('click', async () => {
    const heroId = heroSelect.value;
    if (!heroId) { alert('Выберите героя'); return; }
    const goldAmount = parseInt(goldInput?.value || '0');
    if (goldAmount < 1) { alert('Минимум 1 золото'); return; }
    const cost = goldAmount * 100;
    if (!confirm(`Обменять ${cost} Талориенов на ${goldAmount} золота?`)) return;
    await doExchange(heroId, goldAmount);
  });
}

async function doExchange(heroId: string, goldAmount: number) {
  try {
    const res = await fetch('/api/wallet/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ heroId, amount: goldAmount }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ ${data.taloriensSpent} Талориенов → ${data.goldReceived} золота для ${data.heroName}\nОстаток: ${data.walletBalance} Талориенов`);
      const wbEl = document.getElementById('exchange-wallet-balance');
      if (wbEl) wbEl.textContent = String(data.walletBalance);
      render();
    } else {
      alert('❌ ' + (data.error || 'Ошибка обмена'));
    }
  } catch { alert('Ошибка подключения'); }
}

render();
