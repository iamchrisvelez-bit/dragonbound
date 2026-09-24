import type { DialogueSystem, DialogueLine } from '../world/DialogueSystem';
import { eventBus } from '../core/EventBus';

let stylesInjected = false;

/** Bottom-center dialogue box driven directly by a DialogueSystem instance; tap to advance. */
export class DialogueBox {
  readonly root: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private textEl: HTMLDivElement;

  constructor(private dialogueSystem: DialogueSystem) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-dialogue-box';
    this.root.hidden = true;
    document.body.appendChild(this.root);

    this.speakerEl = document.createElement('div');
    this.speakerEl.className = 'db-dialogue-speaker';
    this.root.appendChild(this.speakerEl);

    this.textEl = document.createElement('div');
    this.textEl.className = 'db-dialogue-text';
    this.root.appendChild(this.textEl);

    const hint = document.createElement('div');
    hint.className = 'db-dialogue-hint';
    hint.textContent = 'Tap to continue';
    this.root.appendChild(hint);

    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.advance();
    });

    eventBus.on('dialogue:line', (line) => this.render(line));
  }

  private render(line: DialogueLine): void {
    this.root.hidden = false;
    this.speakerEl.textContent = line.speaker;
    this.textEl.textContent = line.text;
  }

  private advance(): void {
    // dialogueSystem.advance() emits 'dialogue:line' (re-rendering via the
    // listener above) when there's a next line; when the queue is empty it
    // emits nothing, so isActive is what tells us to hide.
    this.dialogueSystem.advance();
    if (!this.dialogueSystem.isActive) this.root.hidden = true;
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-dialogue-box {
      position: fixed;
      left: 50%;
      bottom: max(190px, calc(30vh));
      transform: translateX(-50%);
      width: min(340px, 86vw);
      z-index: 30;
      pointer-events: auto;
      touch-action: none;
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
      background: rgba(11, 15, 26, 0.85);
      border: 1px solid rgba(212, 168, 83, 0.5);
      border-radius: 10px;
      padding: 12px 14px 10px;
    }
    .db-dialogue-speaker {
      font-size: 12px;
      font-weight: 700;
      color: #d4a853;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .db-dialogue-text { font-size: 14px; line-height: 1.4; }
    .db-dialogue-hint {
      margin-top: 8px;
      font-size: 10px;
      opacity: 0.6;
      text-align: right;
    }
  `;
  document.head.appendChild(style);
}
