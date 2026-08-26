/**
 * Global Event Bus for TUI
 * Used for broadcasting events across components and down to IPC streams.
 */

type Listener = (event: string, payload: any) => void;

class EventBus {
  private listeners: Listener[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: string, payload: any = {}) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch (err) {
        console.error("EventBus listener error:", err);
      }
    }
  }
}

export const eventBus = new EventBus();
