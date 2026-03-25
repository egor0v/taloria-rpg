/**
 * Главная страница — Taloria RPG
 * Доступна всем: и авторизованным, и нет
 */
import { clearElement } from '../../utils/safeRender';
import { getCurrentUser } from '../../core/auth';
import { navigateTo } from '../../core/router';

export function renderAbout(container: HTMLElement): void {
  clearElement(container);
  const user = getCurrentUser();
  const ctaHref = user ? '/dashboard' : '/';
  const ctaLabel = user ? 'Продолжить приключение' : 'Начать приключение';
  const cityHref = user ? '/city' : '/';
  const cityLabel = user ? 'Посетить город' : 'Посетить город';

  container.innerHTML = `
  <div class="lp">

    <!-- ═══ HERO BANNER ═══ -->
    <section class="lp-hero">
      <div class="lp-hero-img" style="background-image: url('/hero-banner.png')"></div>
      <div class="lp-hero-overlay"></div>
      <div class="lp-hero-inner">
        <h1 class="lp-brand">TALORIA</h1>
        <div class="lp-divider"><span class="lp-rune">◆</span></div>
        <p class="lp-sub">Кооперативная пошаговая RPG с AI-ведущим</p>
      </div>
    </section>

    <!-- ═══ МИРЫ ТАЛОРИИ ═══ -->
    <section class="lp-section lp-worlds">
      <div class="lp-container">
        <h2 class="lp-h2">Миры Талории</h2>
        <div class="lp-worlds-grid">
          <div class="lp-worlds-text">
            <p class="lp-lead">Талория — древний мир, раскинувшийся между горными хребтами и бескрайними лесами, где магия течёт в реках, а тайны скрыты в каждом камне.</p>
            <p>Создайте своего героя — отважного воина, могущественного мага, мудрого жреца или хитроумного барда. Выберите расу: стойкого дварфа, грациозного эльфа или адаптивного человека. Каждая комбинация открывает уникальные способности и путь развития.</p>
            <p>Соберите команду из 1 до 8 искателей приключений и отправляйтесь исследовать тактические карты, полные опасностей. Искусственный интеллект выступает в роли ведущего — он описывает каждое событие, создаёт атмосферные диалоги с NPC и реагирует на ваши свободные действия.</p>
            <p>Каждое прохождение — уникально. Броски кубиков (d4, d6, d8, d10, d20) определяют исход каждого действия. Критический удар или провал — решает судьба.</p>
            <div class="lp-cta-wrap">
              <a href="${ctaHref}" class="lp-cta" data-link>${ctaLabel}</a>
            </div>
          </div>
          <div class="lp-worlds-visual">
            <div class="lp-card-stack">
              <div class="lp-vcard lp-vcard--1">
                <div class="lp-vcard-icon">⚔️</div>
                <div class="lp-vcard-title">3 расы</div>
                <div class="lp-vcard-desc">Человек · Эльф · Дварф</div>
              </div>
              <div class="lp-vcard lp-vcard--2">
                <div class="lp-vcard-icon">🧙</div>
                <div class="lp-vcard-title">4 класса</div>
                <div class="lp-vcard-desc">Воин · Маг · Жрец · Бард</div>
              </div>
              <div class="lp-vcard lp-vcard--3">
                <div class="lp-vcard-icon">🎲</div>
                <div class="lp-vcard-title">5 кубиков</div>
                <div class="lp-vcard-desc">d4 · d6 · d8 · d10 · d20</div>
              </div>
              <div class="lp-vcard lp-vcard--4">
                <div class="lp-vcard-icon">🤖</div>
                <div class="lp-vcard-title">AI-ведущий</div>
                <div class="lp-vcard-desc">Уникальные нарративы каждый раз</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ КАК ЭТО УСТРОЕНО ═══ -->
    <section class="lp-section lp-how">
      <div class="lp-container">
        <h2 class="lp-h2">Как это устроено</h2>
        <p class="lp-how-intro">От создания героя до эпических сражений — каждый шаг наполнен выбором и приключениями</p>

        <div class="lp-steps">
          <div class="lp-step">
            <div class="lp-step-num">01</div>
            <div class="lp-step-content">
              <h3>Создайте героя</h3>
              <p>Выберите расу, пол и класс. Распределите 6 очков характеристик: Сила, Ловкость, Выносливость, Интеллект, Мудрость, Харизма. Дайте имя — и ваш герой готов к приключениям.</p>
            </div>
          </div>
          <div class="lp-step">
            <div class="lp-step-num">02</div>
            <div class="lp-step-content">
              <h3>Исследуйте карту</h3>
              <p>Пошаговое движение по тактической сетке. Туман войны скрывает неизведанное. Проводите разведку (d20 + Ловкость), обнаруживайте сундуки, ловушки и скрытые руны. Остерегайтесь водных преград!</p>
            </div>
          </div>
          <div class="lp-step">
            <div class="lp-step-num">03</div>
            <div class="lp-step-content">
              <h3>Вступайте в бой</h3>
              <p>Тактические пошаговые сражения. Бросок d20 определяет попадание, кубик урона (d4–d10) — силу удара. 36 статус-эффектов: горение, заморозка, оглушение, яд, скрытность. Используйте способности класса, зелья и свитки.</p>
            </div>
          </div>
          <div class="lp-step">
            <div class="lp-step-num">04</div>
            <div class="lp-step-content">
              <h3>Собирайте лут</h3>
              <p>270+ предметов пяти уровней редкости: от обычных до легендарных. Экипируйте оружие, броню, кольца и амулеты. Стакайте зелья и свитки. Храните ценное в сундуке.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ ГОРОД ═══ -->
    <section class="lp-section lp-city">
      <div class="lp-container">
        <h2 class="lp-h2">Город Талории</h2>
        <p class="lp-city-intro">Между приключениями загляните в город — центр торговли, крафта и встреч с другими игроками</p>

        <div class="lp-city-grid">
          <div class="lp-city-card">
            <span class="lp-city-emoji">🍺</span>
            <h4>Таверны</h4>
            <p>4 таверны с провизией и напитками. Восстановите силы кружкой эля, послушайте слухи от посетителей.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">🔨</span>
            <h4>Кузница</h4>
            <p>Оружие, броня и слитки. Закажите крафт легендарного Меча Пепельного Дракона или Щита Грозового Стража.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">⚗️</span>
            <h4>Алхимик</h4>
            <p>Зелья лечения, маны и скорости. Редкие эссенции и яды. Скрафтите Зелье Великого Исцеления или Зелье Невидимости.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">⛪</span>
            <h4>Храм</h4>
            <p>Свитки огня, защиты и воскрешения. Получите благословение, освятите оружие святой водой.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">💎</span>
            <h4>Ювелир</h4>
            <p>Драгоценные камни, кристаллы, кольца и амулеты. Скрафтите Кольцо Огня или Диадему Провидения.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">📚</span>
            <h4>Книжная лавка</h4>
            <p>Пергаменты, фолианты и чернила. Создайте Гримуар Огня или зловещий Некрономикон.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">🌿</span>
            <h4>Травница</h4>
            <p>Травы, корни, ягоды и грибы — ингредиенты для алхимии и лечения.</p>
          </div>
          <div class="lp-city-card">
            <span class="lp-city-emoji">🏪</span>
            <h4>Лавка Брона</h4>
            <p>Инструменты, ткани, кожи и всё для крафта. Верёвки, факелы, нити и многое другое.</p>
          </div>
        </div>

        <div class="lp-city-bottom">
          <p class="lp-city-note">14 локаций · 211 товаров · 60 рецептов крафта · Торговля между игроками</p>
          <a href="${cityHref}" class="lp-cta lp-cta--outline" data-link>${cityLabel}</a>
        </div>
      </div>
    </section>

    <!-- ═══ ЦИФРЫ ═══ -->
    <section class="lp-section lp-numbers">
      <div class="lp-container">
        <div class="lp-nums">
          <div class="lp-num"><span class="lp-num-val">270+</span><span class="lp-num-label">Предметов</span></div>
          <div class="lp-num"><span class="lp-num-val">60</span><span class="lp-num-label">Рецептов крафта</span></div>
          <div class="lp-num"><span class="lp-num-val">36</span><span class="lp-num-label">Статус-эффектов</span></div>
          <div class="lp-num"><span class="lp-num-val">14</span><span class="lp-num-label">Локаций города</span></div>
          <div class="lp-num"><span class="lp-num-val">8</span><span class="lp-num-label">Игроков в партии</span></div>
          <div class="lp-num"><span class="lp-num-val">∞</span><span class="lp-num-label">Уникальных историй</span></div>
        </div>
      </div>
    </section>

    <!-- ═══ FOOTER ═══ -->
    <footer class="lp-footer">
      <p>© 2026 Taloria RPG</p>
      <p class="lp-footer-links">
        <a href="/bestiary">Бестиарий</a> · <a href="/lavka">Лавка</a>
      </p>
    </footer>
  </div>

  <style>
  .lp { background: var(--bg, #0b0f15); color: var(--text, #e8e6e0); }

  /* ── Hero Banner ── */
  .lp-hero { position: relative; padding: 100px 24px 80px; text-align: center; overflow: hidden; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .lp-hero-img { position: absolute; inset: 0; background-size: cover; background-position: center 30%; z-index: 0; }
  .lp-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,15,21,0.3) 0%, rgba(11,15,21,0.6) 50%, rgba(11,15,21,0.95) 100%); z-index: 1; }
  .lp-hero-inner { position: relative; z-index: 2; }
  .lp-logo { width: 110px; height: 110px; object-fit: contain; filter: drop-shadow(0 4px 24px rgba(201,162,78,0.35)); margin-bottom: 12px; }
  .lp-brand { font-family: var(--font-heading, 'Cinzel', serif); font-size: 4.2rem; font-weight: 900; color: var(--gold, #f6c86d); letter-spacing: 0.18em; margin: 0; text-shadow: 0 2px 30px rgba(201,162,78,0.4), 0 4px 60px rgba(0,0,0,0.5); }
  .lp-divider { text-align: center; margin: 14px 0; display: flex; align-items: center; justify-content: center; gap: 16px; }
  .lp-divider::before, .lp-divider::after { content: ''; flex: 1; max-width: 200px; height: 1px; background: linear-gradient(90deg, transparent, rgba(201,162,78,0.3), transparent); }
  .lp-rune { color: var(--gold); font-size: 0.7rem; }
  .lp-sub { font-size: 0.95rem; color: var(--text-dim, #9a9a9e); letter-spacing: 0.2em; text-transform: uppercase; }

  /* ── Section ── */
  .lp-section { padding: 60px 24px; }
  .lp-container { max-width: 1000px; margin: 0 auto; }
  .lp-h2 { font-family: var(--font-heading); font-size: 1.8rem; font-weight: 800; color: var(--gold); text-align: center; margin-bottom: 12px; letter-spacing: 0.06em; }

  /* ── Worlds ── */
  .lp-worlds { background: rgba(0,0,0,0.12); }
  .lp-worlds-grid { display: grid; grid-template-columns: 1fr 340px; gap: 40px; align-items: start; }
  .lp-worlds-text p { font-size: 0.88rem; line-height: 1.75; color: var(--text-dim); margin-bottom: 14px; }
  .lp-lead { font-size: 1.05rem !important; color: var(--text) !important; font-weight: 500; line-height: 1.7 !important; }
  .lp-cta-wrap { margin-top: 20px; }
  .lp-cta { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #c9a24e, #f6c86d); color: #0b0f15; font-family: var(--font-heading); font-size: 0.9rem; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.25s; box-shadow: 0 4px 20px rgba(201,162,78,0.25); }
  .lp-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(201,162,78,0.35); }
  .lp-cta--outline { background: transparent; color: var(--gold); border: 1px solid rgba(201,162,78,0.4); box-shadow: none; }
  .lp-cta--outline:hover { background: rgba(201,162,78,0.08); border-color: var(--gold); box-shadow: 0 4px 20px rgba(201,162,78,0.15); }
  .lp-card-stack { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .lp-vcard { background: rgba(16,20,30,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 20px 16px; text-align: center; transition: border-color 0.2s, transform 0.2s; }
  .lp-vcard:hover { border-color: rgba(201,162,78,0.25); transform: translateY(-2px); }
  .lp-vcard-icon { font-size: 1.8rem; margin-bottom: 8px; }
  .lp-vcard-title { font-family: var(--font-heading); font-size: 0.9rem; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .lp-vcard-desc { font-size: 0.7rem; color: var(--text-dim); }

  /* ── How ── */
  .lp-how-intro { text-align: center; font-size: 0.92rem; color: var(--text-dim); margin-bottom: 36px; max-width: 600px; margin-left: auto; margin-right: auto; }
  .lp-steps { display: flex; flex-direction: column; gap: 0; }
  .lp-step { display: flex; gap: 24px; padding: 28px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .lp-step:last-child { border-bottom: none; }
  .lp-step-num { font-family: var(--font-heading); font-size: 2.5rem; font-weight: 900; color: rgba(201,162,78,0.15); line-height: 1; min-width: 60px; }
  .lp-step-content h3 { font-family: var(--font-heading); font-size: 1.05rem; font-weight: 700; color: var(--gold); margin-bottom: 8px; }
  .lp-step-content p { font-size: 0.85rem; line-height: 1.65; color: var(--text-dim); }

  /* ── City ── */
  .lp-city { background: rgba(0,0,0,0.12); }
  .lp-city-intro { text-align: center; font-size: 0.92rem; color: var(--text-dim); margin-bottom: 32px; max-width: 600px; margin-left: auto; margin-right: auto; }
  .lp-city-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 32px; }
  .lp-city-card { background: rgba(16,20,30,0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 20px 14px; text-align: center; transition: border-color 0.2s, transform 0.2s; }
  .lp-city-card:hover { border-color: rgba(201,162,78,0.2); transform: translateY(-2px); }
  .lp-city-emoji { font-size: 1.8rem; display: block; margin-bottom: 8px; }
  .lp-city-card h4 { font-family: var(--font-heading); font-size: 0.85rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }
  .lp-city-card p { font-size: 0.72rem; color: var(--text-dim); line-height: 1.45; }
  .lp-city-bottom { text-align: center; }
  .lp-city-note { font-size: 0.82rem; color: var(--text-muted, #7a7a84); margin-bottom: 16px; letter-spacing: 0.04em; }

  /* ── Numbers ── */
  .lp-numbers { background: rgba(0,0,0,0.08); }
  .lp-nums { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
  .lp-num { text-align: center; padding: 20px 8px; }
  .lp-num-val { display: block; font-family: var(--font-heading); font-size: 2.4rem; font-weight: 900; color: var(--cta, #3acc60); line-height: 1.1; }
  .lp-num-label { font-size: 0.68rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }

  /* ── Footer ── */
  .lp-footer { text-align: center; padding: 36px 24px; border-top: 1px solid rgba(255,255,255,0.04); }
  .lp-footer p { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; }
  .lp-footer-links a { color: var(--gold-dim, #c9a24e); text-decoration: none; font-size: 0.78rem; }
  .lp-footer-links a:hover { color: var(--gold); }

  /* ── Responsive ── */
  @media (max-width: 800px) {
    .lp-worlds-grid { grid-template-columns: 1fr; }
    .lp-city-grid { grid-template-columns: repeat(2, 1fr); }
    .lp-nums { grid-template-columns: repeat(3, 1fr); }
    .lp-brand { font-size: 2.4rem; }
    .lp-step { flex-direction: column; gap: 8px; }
    .lp-step-num { font-size: 1.8rem; }
  }
  @media (max-width: 500px) {
    .lp-city-grid { grid-template-columns: 1fr; }
    .lp-card-stack { grid-template-columns: 1fr; }
  }
  </style>
  `;

  // CTA click handlers for non-link buttons
  container.querySelectorAll('.lp-cta[data-link]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo((el as HTMLAnchorElement).getAttribute('href') || '/');
    });
  });
}
