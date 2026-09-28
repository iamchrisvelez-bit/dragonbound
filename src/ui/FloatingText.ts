import * as THREE from 'three';

let stylesInjected = false;

type Kind = 'damage' | 'player-damage' | 'heal';

interface ActiveLabel {
  el: HTMLDivElement;
  worldPos: THREE.Vector3;
  age: number;
  readonly lifetime: number;
}

const LIFETIME_SECONDS = 0.85;
const RISE_UNITS = 1.1;

/**
 * Floating combat text (damage numbers) - screen-projected DOM labels that
 * rise and fade over ~0.85s, spawned from GameManager's 'dragon:damaged' /
 * 'player:damaged' listeners. Same plain-DOM-overlay approach as
 * WorldHealthBars/HUD rather than a canvas layer, and the two systems
 * intentionally don't share a base class - the pooling/lifecycle needs
 * (bars persist per-entity id, labels are fire-and-forget with a lifetime)
 * are different enough that forcing a shared abstraction would cost more
 * than the ~20 lines it'd save.
 */
export class FloatingText {
  private root: HTMLDivElement;
  private active: ActiveLabel[] = [];

  constructor() {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-floating-text-root';
    document.body.appendChild(this.root);
  }

  spawn(worldPos: THREE.Vector3, text: string, kind: Kind): void {
    const el = document.createElement('div');
    el.className = `db-floating-text db-ft-${kind}`;
    el.textContent = text;
    // Small random horizontal jitter so a rapid combo's numbers don't stack
    // in an unreadable single column.
    el.style.setProperty('--db-ft-jitter', `${(Math.random() - 0.5) * 40}px`);
    this.root.appendChild(el);
    this.active.push({ el, worldPos: worldPos.clone(), age: 0, lifetime: LIFETIME_SECONDS });
  }

  /** Call once per frame, after renderer.render() so camera matrices are current. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.active = this.active.filter((label) => {
      label.age += dt;
      if (label.age >= label.lifetime) {
        label.el.remove();
        return false;
      }

      const t = label.age / label.lifetime;
      const pos = label.worldPos.clone().add(new THREE.Vector3(0, t * RISE_UNITS, 0));
      const screen = pos.project(camera);
      if (screen.z > 1 || screen.z < -1) {
        label.el.style.display = 'none';
        return true;
      }
      const x = (screen.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screen.y * 0.5 + 0.5) * window.innerHeight;
      label.el.style.display = '';
      label.el.style.transform = `translate(${x}px, ${y}px) translate(calc(-50% + var(--db-ft-jitter)), -50%)`;
      label.el.style.opacity = `${1 - Math.max(0, t - 0.55) / 0.45}`;
      return true;
    });
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-floating-text-root {
      position: fixed;
      inset: 0;
      z-index: 18;
      pointer-events: none;
    }
    .db-floating-text {
      position: absolute;
      top: 0;
      left: 0;
      font-family: system-ui, sans-serif;
      font-weight: 800;
      font-size: 17px;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
    }
    .db-ft-damage { color: #ffd27a; }
    .db-ft-player-damage { color: #ff6b6b; font-size: 19px; }
    .db-ft-heal { color: #7fe0a0; }
  `;
  document.head.appendChild(style);
}
