import { InputManager, type ActionName } from '../core/InputManager';

let stylesInjected = false;

/**
 * Mobile-first touch controls: a dynamic left-thumb joystick (spawns where
 * you touch down, like most mobile action games) and a right-thumb cluster
 * of context action buttons, plus a drag-to-look zone behind them. All of
 * it talks to InputManager's public touch entry points - gameplay code
 * never knows whether input came from touch, keyboard, or gamepad.
 */
export class TouchControls {
  readonly root: HTMLDivElement;

  private joystickBase!: HTMLDivElement;
  private joystickKnob!: HTMLDivElement;
  private joystickPointerId: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private readonly joystickMaxRadius = 52;

  private lookPointerId: number | null = null;
  private lastLook = { x: 0, y: 0 };

  constructor(private input: InputManager) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-touch-controls';
    document.body.appendChild(this.root);

    this.buildLeftZone();
    this.buildRightZone();
    this.buildButtons();
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  private buildLeftZone(): void {
    const zone = document.createElement('div');
    zone.className = 'db-left-zone';
    this.root.appendChild(zone);

    this.joystickBase = document.createElement('div');
    this.joystickBase.className = 'db-joystick-base';
    zone.appendChild(this.joystickBase);

    this.joystickKnob = document.createElement('div');
    this.joystickKnob.className = 'db-joystick-knob';
    this.joystickBase.appendChild(this.joystickKnob);

    zone.addEventListener('pointerdown', (e) => {
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      this.joystickCenter = { x: e.clientX, y: e.clientY };
      this.joystickBase.style.left = `${e.clientX}px`;
      this.joystickBase.style.top = `${e.clientY}px`;
      this.joystickBase.classList.add('db-visible');
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (this.joystickPointerId !== e.pointerId) return;
      const dx = e.clientX - this.joystickCenter.x;
      const dy = e.clientY - this.joystickCenter.y;
      const dist = Math.min(this.joystickMaxRadius, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * dist;
      const ky = Math.sin(angle) * dist;
      this.joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.input.setTouchMove(dx / this.joystickMaxRadius, dy / this.joystickMaxRadius);
    });
    const end = (e: PointerEvent) => {
      if (this.joystickPointerId !== e.pointerId) return;
      this.joystickPointerId = null;
      this.joystickBase.classList.remove('db-visible');
      this.joystickKnob.style.transform = 'translate(0, 0)';
      this.input.clearTouchMove();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private buildRightZone(): void {
    const zone = document.createElement('div');
    zone.className = 'db-right-zone';
    this.root.appendChild(zone);

    zone.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return;
      this.lookPointerId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (this.lookPointerId !== e.pointerId) return;
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.input.addLookDelta(dx, dy);
    });
    const end = (e: PointerEvent) => {
      if (this.lookPointerId === e.pointerId) this.lookPointerId = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private buildButtons(): void {
    const cluster = document.createElement('div');
    cluster.className = 'db-button-cluster';
    this.root.appendChild(cluster);

    this.makeButton(cluster, 'block', 'Block', 'db-btn-block');
    this.makeButton(cluster, 'abilityWheel', 'Ability', 'db-btn-ability');
    this.makeButton(cluster, 'mountToggle', 'Mount', 'db-btn-mount');
    this.makeButton(cluster, 'dodge', 'Dodge', 'db-btn-dodge');
    this.makeButton(cluster, 'attack', 'Attack', 'db-btn-attack');
  }

  private makeButton(parent: HTMLElement, action: ActionName, label: string, cssClass: string): void {
    const btn = document.createElement('button');
    btn.className = `db-action-btn ${cssClass}`;
    btn.textContent = label;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      btn.classList.add('db-active');
      this.input.pressAction(action);
    });
    const release = (e: PointerEvent) => {
      e.stopPropagation();
      btn.classList.remove('db-active');
      this.input.releaseAction(action);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    parent.appendChild(btn);
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-touch-controls {
      position: fixed;
      inset: 0;
      z-index: 20;
      pointer-events: none;
      font-family: system-ui, sans-serif;
      -webkit-user-select: none;
      user-select: none;
    }
    .db-left-zone, .db-right-zone {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 50%;
      pointer-events: auto;
      touch-action: none;
    }
    .db-left-zone { left: 0; }
    .db-right-zone { right: 0; }

    .db-joystick-base {
      position: fixed;
      width: 104px;
      height: 104px;
      margin-left: -52px;
      margin-top: -52px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: 2px solid rgba(255, 255, 255, 0.25);
      opacity: 0;
      transition: opacity 0.1s ease;
      pointer-events: none;
    }
    .db-joystick-base.db-visible { opacity: 1; }
    .db-joystick-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 46px;
      height: 46px;
      margin-left: -23px;
      margin-top: -23px;
      border-radius: 50%;
      background: rgba(212, 168, 83, 0.85);
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.4);
    }

    .db-button-cluster {
      position: fixed;
      right: max(16px, env(safe-area-inset-right, 0px));
      bottom: max(16px, env(safe-area-inset-bottom, 0px));
      width: 220px;
      height: 220px;
      pointer-events: none;
    }
    .db-action-btn {
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.35);
      background: rgba(11, 15, 26, 0.55);
      color: #f2e9d8;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      pointer-events: auto;
      touch-action: none;
      transition: transform 0.06s ease, background 0.06s ease;
    }
    .db-action-btn.db-active {
      transform: scale(0.92);
      background: rgba(201, 92, 58, 0.75);
    }
    /* Laid out so no two circles' bounding boxes overlap (checked with at
       least a 6px gap between every pair) - they used to (Attack and Dodge
       shared a ~22x56px region, with Attack painted on top since it's added
       to the DOM last, so a Dodge tap landing in that sliver silently fired
       Attack instead - see git history for the exact old numbers). */
    .db-btn-attack { width: 80px; height: 80px; right: 0; bottom: 0; font-size: 13px; }
    .db-btn-dodge { width: 58px; height: 58px; right: 88px; bottom: 8px; }
    .db-btn-block { width: 56px; height: 56px; right: 6px; bottom: 106px; }
    .db-btn-ability { width: 50px; height: 50px; right: 98px; bottom: 112px; }
    .db-btn-mount { width: 48px; height: 48px; right: 154px; bottom: 58px; }
  `;
  document.head.appendChild(style);
}
