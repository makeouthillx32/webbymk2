/**
 * Simple typed signal (event) utility.
 */

export type Signal<T extends any[]> = {
  /** Emit the signal with the given arguments */
  emit: (...args: T) => void;
  /** Subscribe to the signal. Returns an unsubscribe function. */
  subscribe: (listener: (...args: T) => void) => () => void;
  /** Clear all listeners */
  clear: () => void;
};

export function createSignal<T extends any[]>(): Signal<T> {
  const listeners = new Set<(...args: T) => void>();

  return {
    emit(...args: T) {
      for (const listener of listeners) {
        listener(...args);
      }
    },
    subscribe(listener: (...args: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
    },
  };
}
