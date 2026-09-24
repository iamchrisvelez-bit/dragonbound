let stylesInjected = false;

export interface MinimapEntity {
  x: number;
  z: number;
  kind: 'player' | 'dragon-feral' | 'dragon-wary' | 'dragon-tamed';
}

export interface HudState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  /** null hides the bond bar entirely (only shown mid-taming) */
  bond: number | null;
  /** contextual hint line, e.g. "Tap Mount to begin taming" */
  prompt: string | null;
  /** null hides the riding badge; set to the mount's display name while mounted */
  riding: string | null;
  minimapEntities: MinimapEntity[];
}

/** Health/stamina/bond bars, a contextual prompt line, and a simple top-down minimap. */
export class HUD {
  readonly root: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private bondTrack: HTMLDivElement;
  private bondFill: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private ridingEl: HTMLDivElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;

  private readonly minimapRangeMeters = 30;

  constructor() {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-hud';
    document.body.appendChild(this.root);

    const bars = document.createElement('div');
    bars.className = 'db-hud-bars';
    this.root.appendChild(bars);

    const healthTrack = document.createElement('div');
    healthTrack.className = 'db-bar-track';
    this.healthFill = document.createElement('div');
    this.healthFill.className = 'db-bar-fill db-health-fill';
    healthTrack.appendChild(this.healthFill);
    bars.appendChild(healthTrack);

    const staminaTrack = document.createElement('div');
    staminaTrack.className = 'db-bar-track db-stamina-track';
    this.staminaFill = document.createElement('div');
    this.staminaFill.className = 'db-bar-fill db-stamina-fill';
    staminaTrack.appendChild(this.staminaFill);
    bars.appendChild(staminaTrack);

    this.bondTrack = document.createElement('div');
    this.bondTrack.className = 'db-bar-track db-bond-track db-hidden';
    this.bondFill = document.createElement('div');
    this.bondFill.className = 'db-bar-fill db-bond-fill';
    this.bondTrack.appendChild(this.bondFill);
    bars.appendChild(this.bondTrack);

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'db-prompt db-hidden';
    this.root.appendChild(this.promptEl);

    this.ridingEl = document.createElement('div');
    this.ridingEl.className = 'db-riding-badge db-hidden';
    this.root.appendChild(this.ridingEl);

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 140;
    this.minimapCanvas.height = 140;
    this.minimapCanvas.className = 'db-minimap';
    this.root.appendChild(this.minimapCanvas);
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
  }

  update(state: HudState): void {
    this.healthFill.style.width = `${pct(state.health, state.maxHealth)}%`;
    this.staminaFill.style.width = `${pct(state.stamina, state.maxStamina)}%`;

    if (state.bond === null) {
      this.bondTrack.classList.add('db-hidden');
    } else {
      this.bondTrack.classList.remove('db-hidden');
      this.bondFill.style.width = `${pct(state.bond, 100)}%`;
    }

    if (state.prompt) {
      this.promptEl.textContent = state.prompt;
      this.promptEl.classList.remove('db-hidden');
    } else {
      this.promptEl.classList.add('db-hidden');
    }

    if (state.riding) {
      this.ridingEl.textContent = `Riding: ${state.riding}`;
      this.ridingEl.classList.remove('db-hidden');
    } else {
      this.ridingEl.classList.add('db-hidden');
    }

    this.drawMinimap(state.minimapEntities);
  }

  private drawMinimap(entities: MinimapEntity[]): void {
    const ctx = this.minimapCtx;
    const size = this.minimapCanvas.width;
    const center = size / 2;
    const radius = center - 4;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11, 15, 26, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(212, 168, 83, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();

    const player = entities.find((e) => e.kind === 'player');
    const px = player?.x ?? 0;
    const pz = player?.z ?? 0;
    const scale = radius / this.minimapRangeMeters;

    for (const e of entities) {
      const dx = (e.x - px) * scale;
      const dz = (e.z - pz) * scale;
      const x = center + dx;
      const y = center + dz;
      ctx.beginPath();
      ctx.arc(x, y, e.kind === 'player' ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(e.kind);
      ctx.fill();
    }
    ctx.restore();
  }
}

function colorFor(kind: MinimapEntity['kind']): string {
  switch (kind) {
    case 'player':
      return '#f2e9d8';
    case 'dragon-feral':
      return '#c95c3a';
    case 'dragon-wary':
      return '#d4a853';
    case 'dragon-tamed':
      return '#6fbf73';
  }
}

function pct(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-hud {
      position: fixed;
      inset: 0;
      z-index: 15;
      pointer-events: none;
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
    }
    .db-hud-bars {
      position: absolute;
      top: max(14px, env(safe-area-inset-top, 0px));
      left: max(14px, env(safe-area-inset-left, 0px));
      width: min(220px, 45vw);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .db-bar-track {
      height: 12px;
      border-radius: 6px;
      background: rgba(11, 15, 26, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.2);
      overflow: hidden;
    }
    .db-stamina-track { height: 8px; }
    .db-bond-track { height: 8px; }
    .db-bar-fill {
      height: 100%;
      border-radius: 6px;
      transition: width 0.15s ease;
    }
    .db-health-fill { background: linear-gradient(90deg, #8f2b2b, #c95c3a); }
    .db-stamina-fill { background: linear-gradient(90deg, #2b6b6b, #4fa8a8); }
    .db-bond-fill { background: linear-gradient(90deg, #6a4fa8, #d4a853); }
    .db-hidden { display: none !important; }

    .db-prompt {
      position: absolute;
      left: 50%;
      bottom: max(96px, calc(26vh));
      transform: translateX(-50%);
      background: rgba(11, 15, 26, 0.7);
      border: 1px solid rgba(212, 168, 83, 0.5);
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 13px;
      white-space: nowrap;
    }

    .db-minimap {
      position: absolute;
      top: max(14px, env(safe-area-inset-top, 0px));
      right: max(14px, env(safe-area-inset-right, 0px));
      width: 110px;
      height: 110px;
      border-radius: 50%;
    }

    .db-riding-badge {
      position: absolute;
      left: 50%;
      top: max(44px, calc(env(safe-area-inset-top, 0px) + 44px));
      transform: translateX(-50%);
      background: rgba(111, 191, 115, 0.18);
      border: 1px solid rgba(111, 191, 115, 0.55);
      color: #a8e0ac;
      border-radius: 999px;
      padding: 3px 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}
