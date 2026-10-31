export type BackResult = 'handled' | 'exit';

export interface BackHandler {
  id: string;
  priority: number;
  handle: () => boolean;
}

class NavigationStore {
  private handlers = $state<BackHandler[]>([]);

  // Tab Navigation History Stack (e.g. ['search', 'liked', 'settings'])
  tabHistory = $state<string[]>(['search']);
  currentTab = $state<string>('search');
  previousTab = $state<string>('search');

  // Accidental Exit Guard Toast State (Mobile root screen)
  showToast = $state<boolean>(false);
  toastMessage = $state<string>('');
  private lastBackPressTime = 0;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Expose globally for Android native bridge (MainActivity.kt)
      (window as any).__handleBackNavigation = () => {
        return this.handleBack();
      };

      // Also support browser / webview history popstate
      window.addEventListener('popstate', (e) => {
        e.preventDefault();
        this.handleBack();
      });
    }
  }

  /**
   * Register a contextual back action with a given priority (higher number = runs first).
   * Returns an unregister function for easy reactive teardown in Svelte 5 $effect.
   */
  register(id: string, priority: number, handle: () => boolean): () => void {
    const existingIdx = this.handlers.findIndex((h) => h.id === id);
    if (existingIdx !== -1) {
      this.handlers[existingIdx] = { id, priority, handle };
    } else {
      this.handlers.push({ id, priority, handle });
    }

    return () => {
      this.unregister(id);
    };
  }

  unregister(id: string) {
    this.handlers = this.handlers.filter((h) => h.id !== id);
  }

  /**
   * Display a minimalistic bottom toast notification across the app.
   */
  showToastNotification(msg: string, durationMs = 2000) {
    this.toastMessage = msg;
    this.showToast = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
    }, durationMs);
  }

  /**
   * Record a tab transition in history.
   */
  recordTab(tab: string) {
    if (this.currentTab === tab) return;

    if (this.currentTab !== 'now_playing' && tab === 'now_playing') {
      this.previousTab = this.currentTab;
    }

    if (tab !== 'now_playing') {
      const last = this.tabHistory[this.tabHistory.length - 1];
      if (last !== tab) {
        this.tabHistory.push(tab);
      }
    }

    this.currentTab = tab;
  }

  /**
   * Toggle Now Playing bigger player open/close.
   */
  toggleNowPlaying() {
    if (this.currentTab === 'now_playing') {
      const target =
        this.previousTab && this.previousTab !== 'now_playing'
          ? this.previousTab
          : this.tabHistory[this.tabHistory.length - 1] || 'search';
      this.currentTab = target;
    } else {
      this.previousTab = this.currentTab;
      this.currentTab = 'now_playing';
    }
  }

  /**
   * Main back navigation coordinator.
   * Traverses from highest priority overlay down to root exit safeguard.
   */
  handleBack(): BackResult {
    // 1. Sort registered handlers by priority (descending)
    const sorted = [...this.handlers].sort((a, b) => b.priority - a.priority);

    for (const h of sorted) {
      try {
        const handled = h.handle();
        if (handled) {
          return 'handled';
        }
      } catch (err) {
        console.error(`[NavigationBackHandler Error] handler '${h.id}':`, err);
      }
    }

    // 2. Active input blur (e.g. search bar or dialog input with soft keyboard open)
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.blur();
        return 'handled';
      }
    }

    // 3. Tab history navigation (e.g. Settings -> Liked -> Search)
    if (this.tabHistory.length > 1) {
      this.tabHistory.pop(); // remove current tab
      const prev = this.tabHistory[this.tabHistory.length - 1] || 'search';
      this.currentTab = prev;
      return 'handled';
    } else if (this.currentTab !== 'search') {
      this.tabHistory = ['search'];
      this.currentTab = 'search';
      return 'handled';
    }

    // 4. Root Home View Exit Safeguard
    const now = Date.now();
    if (now - this.lastBackPressTime < 2000) {
      this.lastBackPressTime = 0;
      this.showToast = false;
      // Direct call into Android Activity if available
      if (typeof window !== 'undefined' && (window as any).AndroidMediaNotification?.moveAppToBack) {
        try {
          (window as any).AndroidMediaNotification.moveAppToBack();
        } catch (_) {}
      }
      return 'exit';
    } else {
      this.lastBackPressTime = now;
      this.toastMessage = 'Press back again to exit';
      this.showToast = true;
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        this.showToast = false;
      }, 2000);
      return 'handled';
    }
  }
}

export const navigationStore = new NavigationStore();
