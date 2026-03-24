/**
 * SPA Router based on History API
 */

type RouteHandler = (params?: Record<string, string>) => void;
type RouteGuard = () => boolean;

interface Route {
  path: string;
  handler: RouteHandler;
  guard?: RouteGuard;
  pattern: RegExp;
  paramNames: string[];
}

class Router {
  private routes: Route[] = [];
  private currentPath = '';
  private beforeEach?: (path: string) => boolean;

  constructor() {
    window.addEventListener('popstate', () => this.handleRoute());
  }

  addRoute(path: string, handler: RouteHandler, guard?: RouteGuard): void {
    const paramNames: string[] = [];
    const pattern = new RegExp(
      '^' +
      path.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      }) +
      '$'
    );
    this.routes.push({ path, handler, guard, pattern, paramNames });
  }

  setBeforeEach(fn: (path: string) => boolean): void {
    this.beforeEach = fn;
  }

  navigateTo(path: string, replace = false): void {
    if (this.beforeEach && !this.beforeEach(path)) return;

    if (replace) {
      history.replaceState(null, '', path);
    } else {
      history.pushState(null, '', path);
    }
    this.handleRoute();
  }

  handleRoute(): void {
    const path = window.location.pathname;
    this.currentPath = path;

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        if (route.guard && !route.guard()) return;

        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        route.handler(params);
        return;
      }
    }

    // 404 fallback - go to login
    this.navigateTo('/', true);
  }

  getCurrentPath(): string {
    return this.currentPath || window.location.pathname;
  }
}

export const router = new Router();
export function navigateTo(path: string, replace = false) {
  router.navigateTo(path, replace);
}
