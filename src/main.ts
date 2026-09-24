import { GameManager } from './core/GameManager';
import { eventBus } from './core/EventBus';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container in index.html');

const game = new GameManager();

if (import.meta.env.DEV) {
  // Dev-only escape hatch for poking at live state from the browser console.
  (window as unknown as { __DRAGONBOUND__: GameManager }).__DRAGONBOUND__ = game;
  (window as unknown as { __DRAGONBOUND_BUS__: typeof eventBus }).__DRAGONBOUND_BUS__ = eventBus;
}

game.init(container).catch((err) => {
  console.error('[Dragonbound] Failed to start:', err);
  container.innerHTML = `<pre style="color:#f2e9d8;padding:16px;font-family:monospace;white-space:pre-wrap;">Failed to start Dragonbound:\n${String(err?.stack ?? err)}</pre>`;
});

// Save on the way out so a tab close / backgrounding doesn't lose progress.
window.addEventListener('pagehide', () => {
  void game.save();
});
