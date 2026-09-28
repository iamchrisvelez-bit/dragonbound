import { sfx } from '../core/SfxManager';

let stylesInjected = false;

/**
 * One-time celebratory overlay shown the moment both starter quests
 * (First Bond, The Patient Hand) are complete - previously finishing the
 * vertical slice's content just trailed off into "nothing left to do" with
 * no acknowledgment, which reads as unfinished rather than as reaching the
 * end of this pilot's built content. Dismissible, not blocking - the
 * player can keep exploring/fighting/riding after closing it.
 */
export class PilotCompleteScreen {
  private root: HTMLDivElement;

  constructor(onContinue: () => void) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-pilot-complete db-hidden';
    document.body.appendChild(this.root);

    const panel = document.createElement('div');
    panel.className = 'db-pilot-panel';
    this.root.appendChild(panel);

    const badge = document.createElement('div');
    badge.className = 'db-pilot-badge';
    badge.textContent = '✦';
    panel.appendChild(badge);

    const title = document.createElement('div');
    title.className = 'db-pilot-title';
    title.textContent = 'Pilot Complete';
    panel.appendChild(title);

    const message = document.createElement('div');
    message.className = 'db-pilot-message';
    message.textContent =
      "You've bonded a dragon and attuned a sealed crystal - every objective this pilot slice has to offer. " +
      'The vale is still yours to explore, fight through, and fly over - thank you for playing this far into an early build.';
    panel.appendChild(message);

    const button = document.createElement('button');
    button.className = 'db-pilot-button';
    button.textContent = 'Keep Exploring';
    panel.appendChild(button);

    button.addEventListener('click', () => {
      sfx.play('ui-tap');
      this.root.classList.add('db-hidden');
      onContinue();
    });
  }

  show(): void {
    sfx.play('success', { volume: 0.9 });
    this.root.classList.remove('db-hidden');
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-pilot-complete {
      position: fixed;
      inset: 0;
      z-index: 48;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(6, 4, 8, 0.78);
      -webkit-backdrop-filter: blur(3px); /* Safari/iOS still wants the prefix */
      backdrop-filter: blur(3px);
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
      animation: db-pilot-fade-in 0.5s ease;
    }
    .db-pilot-complete.db-hidden { display: none; }
    .db-pilot-panel {
      width: min(360px, 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 28px 22px;
      text-align: center;
      background: linear-gradient(180deg, #171d33, #12172a);
      border: 1px solid rgba(212, 168, 83, 0.4);
      border-radius: 16px;
      box-shadow: 0 16px 50px rgba(0, 0, 0, 0.55);
    }
    .db-pilot-badge {
      font-size: 30px;
      color: #d4a853;
      text-shadow: 0 0 18px rgba(212, 168, 83, 0.6);
    }
    .db-pilot-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.05em;
      background: linear-gradient(180deg, #f2e9d8, #d4a853);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .db-pilot-message {
      font-size: 13px;
      line-height: 1.55;
      opacity: 0.85;
    }
    .db-pilot-button {
      margin-top: 8px;
      padding: 12px 30px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #0b0f1a;
      background: linear-gradient(180deg, #e6c179, #c9953f);
      border: none;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    }
    .db-pilot-button:active { transform: scale(0.97); }
    @keyframes db-pilot-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
