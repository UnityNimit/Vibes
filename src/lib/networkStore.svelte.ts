class NetworkStore {
  isOnline = $state<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  reconnectEpoch = $state<number>(0);

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // 1. Standard web online/offline events
      window.addEventListener('online', () => {
        this.handleOnline();
      });

      window.addEventListener('offline', () => {
        this.handleOffline();
      });

      // 2. Direct bridge from Android / Native OS
      (window as any).__onNetworkStateChange = (online: boolean) => {
        if (online) {
          this.handleOnline();
        } else {
          this.handleOffline();
        }
      };

      // 3. Watchdog to detect network restoration even if system event missed
      this.startWatchdog();
    }
  }

  private handleOnline() {
    console.log('[NetworkStore] Connection restored (Epoch:', this.reconnectEpoch + 1, ')');
    this.isOnline = true;
    this.reconnectEpoch++;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vibes:network-online', { detail: { epoch: this.reconnectEpoch } })
      );
    }
  }

  private handleOffline() {
    console.warn('[NetworkStore] Connection lost');
    this.isOnline = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vibes:network-offline'));
    }
  }

  private startWatchdog() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (typeof navigator !== 'undefined') {
        const currentlyOnline = navigator.onLine;
        if (currentlyOnline && !this.isOnline) {
          this.handleOnline();
        } else if (!currentlyOnline && this.isOnline) {
          this.handleOffline();
        }
      }
    }, 4000);
  }

  triggerReconnectionPulse() {
    this.handleOnline();
  }
}

export const networkStore = new NetworkStore();
