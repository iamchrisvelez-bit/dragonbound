import type { SavedSettings } from '../core/SaveManager';
import { sfx } from '../core/SfxManager';

let stylesInjected = false;

export interface PauseMenuCallbacks {
  onMusicVolume: (v: number) => void;
  onSfxVolume: (v: number) => void;
  onSensitivity: (v: number) => void;
  onInvertY: (v: boolean) => void;
  onOpenInventory: () => void;
  onRestart: () => void;
  /** Fired whenever the panel closes (Resume, backdrop tap, or opening Inventory) - GameManager persists settings here rather than on every slider tick. */
  onClose: () => void;
}

/**
 * The "Menu" button's real destination: a settings/pause overlay rather
 * than jumping straight to Inventory (which now lives one tap deeper, via
 * "Inventory & Skills" below) - a released game needs somewhere for
 * volume/sensitivity controls and a way to reset a save without opening
 * devtools, and this game had neither.
 *
 * This is a "soft" pause - it covers the screen and swallows input via the
 * DOM (same as InventoryScreen already did before this existed), but
 * doesn't halt GameManager's tick loop. A real hard-pause would need to
 * freeze Rapier's world stepping and every animation mixer/AI timer
 * consistently, which is a bigger, riskier change than a settings panel
 * warrants for this pass.
 */
export class PauseMenu {
  readonly root: HTMLDivElement;
  private visible = false;

  constructor(initial: SavedSettings, private callbacks: PauseMenuCallbacks) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-pause-menu db-hidden';
    document.body.appendChild(this.root);

    const panel = document.createElement('div');
    panel.className = 'db-pause-panel';
    this.root.appendChild(panel);

    const title = document.createElement('div');
    title.className = 'db-pause-title';
    title.textContent = 'Paused';
    panel.appendChild(title);

    panel.appendChild(
      this.buildSlider('Music Volume', initial.musicVolume, 0, 1, 0.05, (v) => this.callbacks.onMusicVolume(v)),
    );
    panel.appendChild(
      this.buildSlider('Sound Effects', initial.sfxVolume, 0, 1, 0.05, (v) => this.callbacks.onSfxVolume(v)),
    );
    panel.appendChild(
      this.buildSlider(
        'Camera Sensitivity',
        initial.cameraSensitivity,
        0.4,
        2,
        0.1,
        (v) => this.callbacks.onSensitivity(v),
      ),
    );
    panel.appendChild(this.buildToggle('Invert Camera Y', initial.invertY, (v) => this.callbacks.onInvertY(v)));

    const divider = document.createElement('div');
    divider.className = 'db-pause-divider';
    panel.appendChild(divider);

    const inventoryBtn = this.buildActionButton('Inventory & Skills', 'db-pause-btn-primary', () => {
      sfx.play('ui-tap');
      this.hide();
      this.callbacks.onOpenInventory();
    });
    panel.appendChild(inventoryBtn);

    const restartBtn = this.buildActionButton('Restart Adventure', 'db-pause-btn-danger', () => {
      if (!window.confirm('Erase your save and start over from the beginning?')) return;
      sfx.play('ui-tap');
      this.callbacks.onRestart();
    });
    panel.appendChild(restartBtn);

    const resumeBtn = this.buildActionButton('Resume', 'db-pause-btn-resume', () => {
      sfx.play('ui-tap');
      this.hide();
    });
    panel.appendChild(resumeBtn);

    // Tapping the dimmed backdrop (outside the panel) also resumes.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.root.classList.remove('db-hidden');
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.add('db-hidden');
    this.callbacks.onClose();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private buildSlider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'db-pause-row';

    const labelRow = document.createElement('div');
    labelRow.className = 'db-pause-slider-label-row';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'db-pause-slider-value';
    valueEl.textContent = formatSliderValue(value);
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    row.appendChild(labelRow);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.className = 'db-pause-slider';
    input.addEventListener('input', () => {
      const v = Number(input.value);
      valueEl.textContent = formatSliderValue(v);
      onChange(v);
    });
    row.appendChild(input);

    return row;
  }

  private buildToggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'db-pause-row db-pause-toggle-row';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'db-pause-checkbox';
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);

    return row;
  }

  private buildActionButton(label: string, cssClass: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `db-pause-action ${cssClass}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
}

function formatSliderValue(v: number): string {
  return v.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0');
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-pause-menu {
      position: fixed;
      inset: 0;
      z-index: 45;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(6, 4, 8, 0.72);
      -webkit-backdrop-filter: blur(3px); /* Safari/iOS still wants the prefix */
      backdrop-filter: blur(3px);
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
    }
    .db-pause-menu.db-hidden { display: none; }
    .db-pause-panel {
      width: min(340px, 100%);
      max-height: 86vh;
      max-height: 86dvh; /* see HUD.ts's .db-prompt comment on vh -> dvh progressive enhancement */
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px;
      background: #12172a;
      border: 1px solid rgba(212, 168, 83, 0.35);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }
    .db-pause-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-align: center;
      color: #d4a853;
      margin-bottom: 4px;
    }
    .db-pause-row { display: flex; flex-direction: column; gap: 6px; }
    .db-pause-slider-label-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      opacity: 0.9;
    }
    .db-pause-slider-value { opacity: 0.6; font-variant-numeric: tabular-nums; }
    .db-pause-slider { width: 100%; accent-color: #d4a853; }
    .db-pause-toggle-row { flex-direction: row; align-items: center; justify-content: space-between; font-size: 12px; }
    .db-pause-checkbox { width: 18px; height: 18px; accent-color: #d4a853; }
    .db-pause-divider { height: 1px; background: rgba(255, 255, 255, 0.12); margin: 2px 0; }
    .db-pause-action {
      padding: 12px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: #f2e9d8;
    }
    .db-pause-action:active { transform: scale(0.98); }
    .db-pause-btn-primary { border-color: rgba(212, 168, 83, 0.5); background: rgba(212, 168, 83, 0.12); }
    .db-pause-btn-danger { border-color: rgba(201, 92, 58, 0.45); color: #e0846a; }
    .db-pause-btn-resume { background: linear-gradient(180deg, #e6c179, #c9953f); color: #0b0f1a; border: none; }
  `;
  document.head.appendChild(style);
}
