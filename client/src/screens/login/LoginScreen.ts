import { loginWithEmail, registerWithEmail } from '../../core/auth';
import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';
import './LoginScreen.css';

export function renderLoginScreen(container: HTMLElement): void {
  clearElement(container);

  let isRegister = false;

  const screen = document.createElement('div');
  screen.className = 'login-screen';

  screen.innerHTML = `
    <div class="login-particles" id="particles-canvas"></div>

    <!-- WoW-style gold frame card -->
    <div class="login-frame">
      <div class="frame-diamond frame-diamond-top">◆</div>
      <div class="login-card">
        <div class="login-logo">
          <img src="/logo.png" alt="Taloria" class="login-logo-img" onerror="this.style.display='none'" />
          <h1 class="login-title">TALORIA</h1>
          <p class="login-subtitle">КООПЕРАТИВНАЯ RPG С AI-ВЕДУЩИМ</p>
        </div>

        <div class="login-divider">
          <span class="login-rune">◆</span>
        </div>

        <p class="login-description">Создавайте героев, собирайте команду и исследуйте приключения, которые описывает искусственный интеллект.</p>

        <div class="login-buttons" id="login-buttons">
          <button class="login-btn login-btn-telegram" id="btn-telegram">
            <svg class="login-btn-icon" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.97 1.25-5.55 3.67-.53.36-1 .54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.97-1.73 6.62-2.87 7.94-3.44 3.79-1.58 4.57-1.85 5.08-1.86.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .37z"/></svg>
            ВОЙТИ ЧЕРЕЗ TELEGRAM
          </button>
          <button class="login-btn login-btn-email" id="btn-show-email">
            <svg class="login-btn-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            ВОЙТИ ПО EMAIL
          </button>
        </div>

        <div class="login-form hidden" id="login-form">
          <div class="form-group" id="name-group" style="display:none">
            <input type="text" class="input login-input" id="input-name" placeholder="Имя игрока" maxlength="50" />
          </div>
          <div class="form-group">
            <input type="email" class="input login-input" id="input-email" placeholder="Email" />
          </div>
          <div class="form-group">
            <input type="password" class="input login-input" id="input-password" placeholder="Пароль" />
          </div>
          <div class="form-group hidden" id="password-confirm-group">
            <input type="password" class="input login-input" id="input-password-confirm" placeholder="Повторите пароль" />
          </div>
          <div class="login-error hidden" id="login-error"></div>
          <button class="login-btn login-btn-telegram" id="btn-submit">ВОЙТИ</button>
          <button class="login-link" id="btn-toggle-mode">Нет аккаунта? Зарегистрироваться</button>
          <button class="login-link" id="btn-back-methods">← Назад к способам входа</button>
        </div>

        <div class="login-invite hidden" id="login-invite">
          Вас пригласили в игру! Войдите или зарегистрируйтесь, чтобы присоединиться.
        </div>

        <p class="login-footer">◆ Вход бесплатный ◆</p>
      </div>
    </div>
  `;

  container.appendChild(screen);

  // Check for invite code
  const inviteCode = sessionStorage.getItem('invite_code');
  if (inviteCode) {
    document.getElementById('login-invite')?.classList.remove('hidden');
  }

  // Show email form
  document.getElementById('btn-show-email')?.addEventListener('click', () => {
    document.getElementById('login-buttons')?.classList.add('hidden');
    document.getElementById('login-form')?.classList.remove('hidden');
  });

  // Back to methods
  document.getElementById('btn-back-methods')?.addEventListener('click', () => {
    document.getElementById('login-buttons')?.classList.remove('hidden');
    document.getElementById('login-form')?.classList.add('hidden');
  });

  // Toggle register/login
  document.getElementById('btn-toggle-mode')?.addEventListener('click', () => {
    isRegister = !isRegister;
    const nameGroup = document.getElementById('name-group');
    const confirmGroup = document.getElementById('password-confirm-group');
    const submitBtn = document.getElementById('btn-submit');
    const toggleBtn = document.getElementById('btn-toggle-mode');

    if (nameGroup) nameGroup.style.display = isRegister ? 'block' : 'none';
    confirmGroup?.classList.toggle('hidden', !isRegister);
    if (submitBtn) submitBtn.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
    if (toggleBtn) toggleBtn.textContent = isRegister
      ? 'Уже есть аккаунт? Войти'
      : 'Нет аккаунта? Зарегистрироваться';
  });

  // Submit
  document.getElementById('btn-submit')?.addEventListener('click', async () => {
    const email = (document.getElementById('input-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('input-password') as HTMLInputElement).value;
    const errorEl = document.getElementById('login-error')!;

    if (!email || !password) {
      errorEl.textContent = 'Заполните email и пароль';
      errorEl.classList.remove('hidden');
      return;
    }

    if (isRegister) {
      const name = (document.getElementById('input-name') as HTMLInputElement).value.trim();
      const confirm = (document.getElementById('input-password-confirm') as HTMLInputElement).value;
      if (!name) { errorEl.textContent = 'Укажите имя игрока'; errorEl.classList.remove('hidden'); return; }
      if (password.length < 6) { errorEl.textContent = 'Пароль минимум 6 символов'; errorEl.classList.remove('hidden'); return; }
      if (password !== confirm) { errorEl.textContent = 'Пароли не совпадают'; errorEl.classList.remove('hidden'); return; }

      try {
        await registerWithEmail(email, password, name);
        navigateTo('/dashboard');
      } catch (err: any) {
        errorEl.textContent = err.error || 'Ошибка регистрации';
        errorEl.classList.remove('hidden');
      }
    } else {
      try {
        await loginWithEmail(email, password);
        navigateTo('/dashboard');
      } catch (err: any) {
        errorEl.textContent = err.error || 'Неверный email или пароль';
        errorEl.classList.remove('hidden');
      }
    }
  });

  // Enter key
  document.getElementById('input-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-submit')?.click();
  });

  // Telegram (placeholder)
  document.getElementById('btn-telegram')?.addEventListener('click', () => {
    alert('Telegram-авторизация будет доступна после настройки бота');
  });

  // Initialize particles
  initParticles();
}

function initParticles() {
  // Simple particle animation
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 5}s`;
    particle.style.animationDuration = `${3 + Math.random() * 4}s`;
    canvas.appendChild(particle);
  }
}
