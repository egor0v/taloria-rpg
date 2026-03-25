/**
 * About / Landing Page — Taloria RPG
 */
import { clearElement } from '../../utils/safeRender';

export function renderAbout(container: HTMLElement): void {
  clearElement(container);

  container.innerHTML = `
  <div class="about">
    <!-- Hero Banner -->
    <section class="about-hero">
      <div class="about-hero-bg"></div>
      <div class="about-hero-content">
        <img src="/logo.png" alt="Taloria" class="about-logo-img" />
        <h1 class="about-title">TALORIA</h1>
        <p class="about-tagline">Кооперативная пошаговая RPG с AI-ведущим</p>
        <p class="about-desc">Создавайте героев, собирайте команду и исследуйте приключения, которые описывает искусственный интеллект. Тактические бои на пошаговых картах, крафт, торговля и уникальные сценарии.</p>
      </div>
    </section>

    <!-- Features -->
    <section class="about-section">
      <h2 class="about-section-title">⚔️ Возможности</h2>
      <div class="about-features">
        <div class="about-feature">
          <div class="about-feature-icon">🧙</div>
          <h3>Создание героя</h3>
          <p>3 расы, 4 класса, уникальные способности. Распределяйте характеристики и выбирайте ветку развития.</p>
        </div>
        <div class="about-feature">
          <div class="about-feature-icon">🗺️</div>
          <h3>Тактические карты</h3>
          <p>Grid-карты с туманом войны, ловушками, сундуками и тайниками. Каждый сценарий — уникальное приключение.</p>
        </div>
        <div class="about-feature">
          <div class="about-feature-icon">🤖</div>
          <h3>AI-ведущий</h3>
          <p>Искусственный интеллект генерирует нарративы, диалоги NPC и описания событий в реальном времени.</p>
        </div>
        <div class="about-feature">
          <div class="about-feature-icon">👥</div>
          <h3>Кооператив до 8 игроков</h3>
          <p>Играйте вместе с друзьями. Реалтайм чат, совместные бои и торговля между игроками.</p>
        </div>
        <div class="about-feature">
          <div class="about-feature-icon">🏰</div>
          <h3>Город с 14 локациями</h3>
          <p>Таверны, кузница, алхимик, храм, ювелир и другие. Торгуйте с NPC, крафтите предметы, общайтесь.</p>
        </div>
        <div class="about-feature">
          <div class="about-feature-icon">⚗️</div>
          <h3>Крафт и торговля</h3>
          <p>60 уникальных рецептов, 270+ предметов. Собирайте ингредиенты и создавайте легендарное снаряжение.</p>
        </div>
      </div>
    </section>

    <!-- Races & Classes -->
    <section class="about-section about-section--dark">
      <h2 class="about-section-title">🛡️ Расы и классы</h2>
      <div class="about-cards">
        <div class="about-card">
          <div class="about-card-header">Человек</div>
          <p>+1 ко всем характеристикам. Универсальные и адаптивные — преуспевают в любой роли.</p>
        </div>
        <div class="about-card">
          <div class="about-card-header">Эльф</div>
          <p>+2 Ловкость, +1 Интеллект, +1 обзор. Древняя раса с врождённой связью с магией.</p>
        </div>
        <div class="about-card">
          <div class="about-card-header">Дварф</div>
          <p>+1 Сила, +2 Выносливость, +5 HP. Стойкие и выносливые мастера.</p>
        </div>
      </div>
      <div class="about-cards" style="margin-top:16px">
        <div class="about-card about-card--warrior">
          <div class="about-card-header">⚔️ Воин</div>
          <p>HP: 30 | MP: 20 | Танк и урон. Мощные удары, защитные стойки, боевые кличи.</p>
        </div>
        <div class="about-card about-card--mage">
          <div class="about-card-header">🔮 Маг</div>
          <p>HP: 20 | MP: 30 | Урон и контроль. Огонь, лёд, молнии, телепортация.</p>
        </div>
        <div class="about-card about-card--priest">
          <div class="about-card-header">✝️ Жрец</div>
          <p>HP: 30 | MP: 40 | Поддержка и лечение. Исцеление, щиты, воскрешение, благословения.</p>
        </div>
        <div class="about-card about-card--bard">
          <div class="about-card-header">🎵 Бард</div>
          <p>HP: 25 | MP: 30 | Поддержка и универсал. Песни, вдохновение, контроль толпы.</p>
        </div>
      </div>
    </section>

    <!-- Combat -->
    <section class="about-section">
      <h2 class="about-section-title">🎲 Боевая система</h2>
      <div class="about-combat-grid">
        <div class="about-combat-item">
          <span class="about-combat-dice">d20</span>
          <p>Пробитие брони — бросок d20 против значения брони цели</p>
        </div>
        <div class="about-combat-item">
          <span class="about-combat-dice">d4–d10</span>
          <p>Кубики урона зависят от оружия: от кулаков (d4) до легендарных мечей (d10)</p>
        </div>
        <div class="about-combat-item">
          <span class="about-combat-dice">36</span>
          <p>Статус-эффектов: горение, заморозка, оглушение, яд, скрытность и другие</p>
        </div>
        <div class="about-combat-item">
          <span class="about-combat-dice">15</span>
          <p>Типов действий: движение, атака, способности, разведка, подкрасться, крафт</p>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="about-section about-section--dark">
      <h2 class="about-section-title">📊 В цифрах</h2>
      <div class="about-stats">
        <div class="about-stat"><span class="about-stat-num">270+</span><span class="about-stat-label">Предметов</span></div>
        <div class="about-stat"><span class="about-stat-num">60</span><span class="about-stat-label">Рецептов крафта</span></div>
        <div class="about-stat"><span class="about-stat-num">14</span><span class="about-stat-label">Локаций города</span></div>
        <div class="about-stat"><span class="about-stat-num">9</span><span class="about-stat-label">Типов монстров</span></div>
        <div class="about-stat"><span class="about-stat-num">36</span><span class="about-stat-label">Статус-эффектов</span></div>
        <div class="about-stat"><span class="about-stat-num">8</span><span class="about-stat-label">Игроков в партии</span></div>
      </div>
    </section>

    <!-- Tech -->
    <section class="about-section">
      <h2 class="about-section-title">🛠️ Технологии</h2>
      <div class="about-tech">
        <span class="about-tech-badge">TypeScript</span>
        <span class="about-tech-badge">Vite</span>
        <span class="about-tech-badge">Node.js</span>
        <span class="about-tech-badge">Express</span>
        <span class="about-tech-badge">MongoDB</span>
        <span class="about-tech-badge">Socket.io</span>
        <span class="about-tech-badge">OpenRouter AI</span>
        <span class="about-tech-badge">T-Bank API</span>
      </div>
    </section>

    <!-- Footer -->
    <footer class="about-footer">
      <p>© 2026 Taloria RPG — Кооперативная RPG с AI-ведущим</p>
      <p class="about-footer-links">
        <a href="/dashboard">Играть</a> ·
        <a href="/bestiary">Бестиарий</a> ·
        <a href="/lavka">Лавка</a>
      </p>
    </footer>
  </div>

  <style>
    .about { background: var(--bg, #0b0f15); color: var(--text, #e8e6e0); min-height: 100vh; }

    /* Hero */
    .about-hero { position: relative; padding: 80px 24px 60px; text-align: center; overflow: hidden; }
    .about-hero-bg { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(201,162,78,0.08) 0%, transparent 70%), radial-gradient(ellipse at 30% 80%, rgba(91,143,255,0.06), transparent 50%); }
    .about-hero-content { position: relative; z-index: 1; max-width: 700px; margin: 0 auto; }
    .about-logo-img { width: 120px; height: 120px; object-fit: contain; margin-bottom: 16px; filter: drop-shadow(0 4px 20px rgba(201,162,78,0.3)); }
    .about-title { font-family: var(--font-heading, 'Cinzel', serif); font-size: 3.5rem; font-weight: 900; color: var(--gold, #f6c86d); letter-spacing: 0.15em; margin: 0 0 8px; text-shadow: 0 2px 20px rgba(201,162,78,0.3); }
    .about-tagline { font-size: 1.1rem; color: var(--text-dim, #9a9a9e); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 20px; }
    .about-desc { font-size: 0.95rem; line-height: 1.7; color: var(--text-dim); max-width: 550px; margin: 0 auto; }

    /* Sections */
    .about-section { padding: 50px 24px; max-width: 1000px; margin: 0 auto; }
    .about-section--dark { background: rgba(0,0,0,0.15); max-width: 100%; }
    .about-section--dark > * { max-width: 1000px; margin-left: auto; margin-right: auto; }
    .about-section-title { font-family: var(--font-heading); font-size: 1.6rem; font-weight: 700; color: var(--gold); text-align: center; margin-bottom: 32px; }

    /* Features */
    .about-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .about-feature { background: rgba(16,20,30,0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 24px; text-align: center; transition: border-color 0.2s, transform 0.2s; }
    .about-feature:hover { border-color: rgba(201,162,78,0.2); transform: translateY(-2px); }
    .about-feature-icon { font-size: 2.2rem; margin-bottom: 12px; }
    .about-feature h3 { font-family: var(--font-heading); font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .about-feature p { font-size: 0.8rem; color: var(--text-dim); line-height: 1.5; }

    /* Cards */
    .about-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
    .about-card { background: rgba(16,20,30,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 18px; }
    .about-card-header { font-family: var(--font-heading); font-size: 0.95rem; font-weight: 700; color: var(--gold); margin-bottom: 8px; }
    .about-card p { font-size: 0.78rem; color: var(--text-dim); line-height: 1.5; }
    .about-card--warrior { border-left: 3px solid #ff4d4d; }
    .about-card--mage { border-left: 3px solid #5b8fff; }
    .about-card--priest { border-left: 3px solid #f6c86d; }
    .about-card--bard { border-left: 3px solid #a855f7; }

    /* Combat */
    .about-combat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .about-combat-item { text-align: center; padding: 20px; background: rgba(16,20,30,0.5); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; }
    .about-combat-dice { display: block; font-family: var(--font-heading); font-size: 2rem; font-weight: 900; color: var(--gold); margin-bottom: 8px; }
    .about-combat-item p { font-size: 0.78rem; color: var(--text-dim); line-height: 1.4; }

    /* Stats */
    .about-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
    .about-stat { text-align: center; padding: 20px 12px; }
    .about-stat-num { display: block; font-family: var(--font-heading); font-size: 2.2rem; font-weight: 900; color: var(--cta, #3acc60); }
    .about-stat-label { font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }

    /* Tech */
    .about-tech { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .about-tech-badge { padding: 8px 18px; background: rgba(91,143,255,0.08); border: 1px solid rgba(91,143,255,0.15); border-radius: 20px; font-size: 0.82rem; color: var(--blue, #5b8fff); font-weight: 500; }

    /* Footer */
    .about-footer { text-align: center; padding: 40px 24px; border-top: 1px solid rgba(255,255,255,0.04); }
    .about-footer p { font-size: 0.78rem; color: var(--text-muted, #7a7a84); margin-bottom: 8px; }
    .about-footer-links a { color: var(--gold-dim, #c9a24e); text-decoration: none; font-size: 0.8rem; }
    .about-footer-links a:hover { color: var(--gold); }

    @media (max-width: 768px) {
      .about-features { grid-template-columns: 1fr; }
      .about-combat-grid { grid-template-columns: repeat(2, 1fr); }
      .about-stats { grid-template-columns: repeat(3, 1fr); }
      .about-title { font-size: 2.2rem; }
    }
  </style>
  `;
}
