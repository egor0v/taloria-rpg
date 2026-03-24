import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';

export function renderMissionEnd(container: HTMLElement): void {
  clearElement(container);
  container.innerHTML = `
    <div class="section fade-in-up" style="text-align:center;max-width:500px;margin:0 auto;padding-top:80px">
      <h2 class="section-title" style="font-size:2rem">Миссия завершена!</h2>
      <div class="card" style="margin:24px 0">
        <p style="font-size:1.2rem;margin-bottom:16px">Результаты</p>
        <div style="display:flex;justify-content:center;gap:24px">
          <div><div style="font-size:1.5rem;color:var(--gold);font-weight:700">+50</div><div class="text-dim">XP</div></div>
          <div><div style="font-size:1.5rem;color:var(--gold);font-weight:700">+10</div><div class="text-dim">Золото</div></div>
        </div>
      </div>
      <button class="btn btn-gold btn-lg" id="btn-back-dashboard">Вернуться на базу</button>
    </div>
  `;
  document.getElementById('btn-back-dashboard')?.addEventListener('click', () => navigateTo('/dashboard'));
}
