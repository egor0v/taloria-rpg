import { clearElement } from '../../utils/safeRender';
import { getCurrentUser } from '../../core/auth';

export function renderProfile(container: HTMLElement): void {
  clearElement(container);
  const user = getCurrentUser();
  container.innerHTML = `<div class="section fade-in-up"><h2 class="section-title">Профиль</h2><p>${user?.displayName || ''}</p></div>`;
}
