import { sfx } from '../core/SfxManager';

let stylesInjected = false;

/** Asset loads are capped at this long before the button appears anyway -
 * knight.glb is ~3.5MB (the single largest asset in the game), so a slow
 * connection shouldn't be able to strand a player on a title card forever. */
const MAX_WAIT_MS = 8000;

/**
 * Full-screen title card shown before the intro dialogue/gameplay starts -
 * previously the game dropped straight into the first dialogue line the
 * instant the canvas was ready, which reads as unfinished rather than as a
 * deliberate opening. Also doubles as the real "first user gesture" for
 * unlocking autoplay audio (see AudioManager/GameManager.buildAudioToggle),
 * so background music can reliably start the moment the player taps in.
 *
 * The "Begin" button is gated behind `assetsReady` (Knight/Dragon's
 * modelReady promises) rather than shown immediately - knight.glb alone is
 * ~3.5MB, and starting gameplay before it's loaded means the placeholder
 * capsule visibly popping to the real model mid-play, which reads as a bug
 * rather than normal loading. Capped at MAX_WAIT_MS so a slow connection
 * degrades to "start with placeholders" rather than a stuck title card.
 */
export class StartScreen {
  private root: HTMLDivElement;

  constructor(assetsReady: Promise<void>, onBegin: () => void) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-start-screen';
    document.body.appendChild(this.root);

    const title = document.createElement('div');
    title.className = 'db-start-title';
    title.textContent = 'DRAGONBOUND';
    this.root.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'db-start-subtitle';
    subtitle.textContent = 'A knight. A vale of unbroken dragons.';
    this.root.appendChild(subtitle);

    const button = document.createElement('button');
    button.className = 'db-start-button db-hidden';
    button.textContent = 'Begin Your Journey';
    this.root.appendChild(button);

    const loading = document.createElement('div');
    loading.className = 'db-start-loading';
    loading.textContent = 'Loading the vale...';
    this.root.appendChild(loading);

    const hint = document.createElement('div');
    hint.className = 'db-start-hint db-hidden';
    hint.textContent = 'Tame or slay - the choice is yours.';
    this.root.appendChild(hint);

    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, MAX_WAIT_MS));
    void Promise.race([assetsReady, timeout]).then(() => {
      loading.classList.add('db-hidden');
      button.classList.remove('db-hidden');
      hint.classList.remove('db-hidden');
    });

    const begin = () => {
      sfx.play('ui-tap');
      this.root.classList.add('db-start-fade-out');
      window.setTimeout(() => this.root.remove(), 500);
      onBegin();
    };
    button.addEventListener('click', begin);
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-start-screen {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      padding: 24px;
      text-align: center;
      background:
        radial-gradient(ellipse at 50% 30%, rgba(212, 168, 83, 0.14) 0%, transparent 55%),
        linear-gradient(180deg, #0b0f1a 0%, #131a2b 55%, #0b0f1a 100%);
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
      transition: opacity 0.5s ease;
    }
    .db-start-screen.db-start-fade-out { opacity: 0; pointer-events: none; }
    .db-start-title {
      /* Flex items default to a content-based min-width, which lets long
         text overflow its container instead of shrinking - max-width plus
         an explicit min-width: 0 override is what actually constrains it. */
      max-width: 100%;
      min-width: 0;
      font-size: clamp(26px, 8.6vw, 54px);
      font-weight: 800;
      letter-spacing: 0.06em;
      background: linear-gradient(180deg, #f2e9d8, #d4a853);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      text-shadow: 0 2px 24px rgba(212, 168, 83, 0.35);
    }
    .db-start-subtitle {
      font-size: 14px;
      opacity: 0.75;
      max-width: 280px;
      line-height: 1.5;
    }
    .db-start-button {
      margin-top: 14px;
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #0b0f1a;
      background: linear-gradient(180deg, #e6c179, #c9953f);
      border: none;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    }
    .db-start-button:active { transform: scale(0.96); }
    .db-start-hint {
      font-size: 11px;
      opacity: 0.5;
      letter-spacing: 0.02em;
    }
    .db-start-loading {
      margin-top: 14px;
      font-size: 12px;
      opacity: 0.65;
      letter-spacing: 0.05em;
      animation: db-start-loading-pulse 1.4s ease-in-out infinite;
    }
    @keyframes db-start-loading-pulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.75; }
    }
    .db-hidden { display: none !important; }
  `;
  document.head.appendChild(style);
}
