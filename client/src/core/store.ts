/**
 * Centralized reactive store with pub/sub
 */

type Listener = (state: any) => void;

class Store<T extends Record<string, any>> {
  private state: T;
  private listeners: Map<string, Set<Listener>> = new Map();

  constructor(initialState: T) {
    this.state = { ...initialState };
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }

  getState(): Readonly<T> {
    return this.state;
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    const oldValue = this.state[key];
    this.state[key] = value;
    this.notify(key as string, value, oldValue);
  }

  update(partial: Partial<T>): void {
    for (const [key, value] of Object.entries(partial)) {
      const oldValue = (this.state as any)[key];
      (this.state as any)[key] = value;
      this.notify(key, value, oldValue);
    }
  }

  subscribe(key: string, listener: Listener): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  private notify(key: string, newValue: any, oldValue: any): void {
    this.listeners.get(key)?.forEach(fn => fn(newValue));
    this.listeners.get('*')?.forEach(fn => fn(this.state));
  }
}

export default Store;
