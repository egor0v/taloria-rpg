/**
 * Main entry point for Taloria RPG SPA
 */
import './styles/variables.css';
import './styles/animations.css';
import './styles/main.css';

import { router, navigateTo } from './core/router';
import { autoLogin, getCurrentUser, logout } from './core/auth';
import { renderLoginScreen } from './screens/login/LoginScreen';
import { renderDashboard } from './screens/dashboard/DashboardScreen';
import { renderCharCreate } from './screens/charCreate/CharCreateScreen';
import { renderGameScreen } from './screens/game/GameScreen';
import { renderInventory } from './screens/inventory/InventoryScreen';
import { renderCity } from './screens/city/CityScreen';
import { renderCityLobby } from './screens/city/CityLobby';
import { renderLobby } from './screens/lobby/LobbyScreen';
import { renderScenario } from './screens/scenario/ScenarioScreen';
import { renderMissionEnd } from './screens/missionEnd/MissionEndScreen';
import { renderAbout } from './screens/about/AboutScreen';

const container = document.getElementById('screen-container')!;
const topNav = document.getElementById('top-nav')!;

function showNav(show: boolean) {
  topNav.classList.toggle('hidden', !show);
}

function updateNav() {
  const user = getCurrentUser();
  if (user) {
    const username = document.getElementById('nav-username');
    const wallet = document.getElementById('wallet-amount');
    const avatar = document.getElementById('nav-avatar');
    if (username) username.textContent = user.displayName;
    if (wallet) wallet.textContent = new Intl.NumberFormat('ru').format(user.walletSilver || 0);
    if (avatar) avatar.textContent = (user.displayName || 'U').charAt(0).toUpperCase();
  }
}

function requireAuth(): boolean {
  return !!getCurrentUser();
}

// Routes
router.addRoute('/', () => {
  if (getCurrentUser()) {
    navigateTo('/dashboard', true);
    return;
  }
  showNav(false);
  renderLoginScreen(container);
});

router.addRoute('/dashboard', () => {
  showNav(true);
  updateNav();
  renderDashboard(container);
}, requireAuth);

router.addRoute('/create', () => {
  showNav(true);
  updateNav();
  renderCharCreate(container);
}, requireAuth);

router.addRoute('/game', () => {
  showNav(false);
  renderGameScreen(container);
}, requireAuth);

router.addRoute('/inventory', () => {
  showNav(true);
  updateNav();
  renderInventory(container);
}, requireAuth);

router.addRoute('/city', () => {
  showNav(true);
  updateNav();
  renderCity(container);
}, requireAuth);

router.addRoute('/city/:locationId', (params) => {
  showNav(true);
  updateNav();
  renderCityLobby(container, params?.locationId || '');
}, requireAuth);

router.addRoute('/lobby', () => {
  showNav(true);
  updateNav();
  renderLobby(container);
}, requireAuth);

router.addRoute('/scenario', () => {
  showNav(true);
  updateNav();
  renderScenario(container);
}, requireAuth);

router.addRoute('/maps', () => {
  showNav(true);
  updateNav();
  renderScenario(container);
}, requireAuth);

router.addRoute('/mission-end', () => {
  showNav(true);
  updateNav();
  renderMissionEnd(container);
}, requireAuth);

router.addRoute('/about', () => {
  showNav(true);
  updateNav();
  renderAbout(container);
});

router.addRoute('/join/:code', (params) => {
  // Store invite code and redirect to login or dashboard
  if (params?.code) {
    sessionStorage.setItem('invite_code', params.code);
  }
  if (getCurrentUser()) {
    navigateTo('/dashboard');
  } else {
    navigateTo('/');
  }
});

// Guard: redirect to login if not authenticated
router.setBeforeEach((path) => {
  const publicPaths = ['/', '/join', '/about'];
  const isPublic = publicPaths.some(p => path === p || path.startsWith('/join/'));
  if (!isPublic && !getCurrentUser()) {
    navigateTo('/', true);
    return false;
  }
  return true;
});

// Nav click handling
document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('[data-link]') as HTMLAnchorElement;
  if (link) {
    e.preventDefault();
    navigateTo(link.pathname);
  }
});

// Logout button
document.getElementById('btn-logout')?.addEventListener('click', () => {
  logout();
});

// Auth state changes
window.addEventListener('auth:userChanged', () => {
  updateNav();
});

// Initialize
async function init() {
  const loggedIn = await autoLogin();
  if (loggedIn) {
    updateNav();
    const path = window.location.pathname;
    // Don't restore game/lobby screens without context (unless session exists)
    const hasSession = !!sessionStorage.getItem('current_session');
    const noContextScreens = ['/', '/lobby', '/mission-end', '/scenario'];
    const gameScreens = ['/game'];
    if (noContextScreens.includes(path) || (gameScreens.includes(path) && !hasSession)) {
      navigateTo('/dashboard', true);
    } else {
      router.handleRoute();
    }
  } else {
    router.handleRoute();
  }
}

init();
