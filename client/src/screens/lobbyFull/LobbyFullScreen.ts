import { navigateTo } from '../../core/router';
import { clearElement } from '../../utils/safeRender';

export function renderLobbyFull(container: HTMLElement): void {
  clearElement(container);
  container.innerHTML = `
    <div class="section fade-in-up" style="text-align:center;padding-top:100px">
      <h2 class="section-title">Лобби заполнено</h2>
      <p class="text-dim">К сожалению, все слоты заняты.</p>
      <button class="btn btn-primary" style="margin-top:24px" id="btn-back">На главную</button>
    </div>
  `;
  document.getElementById('btn-back')?.addEventListener('click', () => navigateTo('/dashboard'));
}
