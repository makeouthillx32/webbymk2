/**
 * Terminal theme watcher that uses a querier to listen for terminal background color changes.
 */
import { setCachedSystemTheme, themeFromOscColor, type SystemTheme } from './systemTheme.js';

export type TerminalQuerier = {
  addListener: (listener: (data: string) => void) => () => void;
  query: (code: string) => void;
};

/**
 * Watches for terminal theme changes.
 * Uses OSC 11 to query the terminal background color.
 */
export function watchSystemTheme(
  querier: TerminalQuerier,
  onThemeChange: (theme: SystemTheme) => void
): () => void {
  // Listen for OSC responses
  const removeListener = querier.addListener((data) => {
    // We only care about OSC 11 (background color)
    if (!data.startsWith('11;')) return;
    
    // The data format is '11;rgb:RRRR/GGGG/BBBB'
    const colorData = data.slice(3);
    const theme = themeFromOscColor(colorData);
    
    if (theme) {
      setCachedSystemTheme(theme);
      onThemeChange(theme);
    }
  });

  // Initial query
  querier.query('\x1b]11;?\x07');

  // Periodically re-query in case the terminal theme changes but doesn't notify
  const interval = setInterval(() => {
    querier.query('\x1b]11;?\x07');
  }, 30000);

  return () => {
    removeListener();
    clearInterval(interval);
  };
}
