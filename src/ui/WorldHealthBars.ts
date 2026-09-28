import * as THREE from 'three';
import type { Dragon } from '../entities/Dragon';

let stylesInjected = false;

interface BarEntry {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  flash: HTMLDivElement;
}

const FADE_MARGIN = 0.06; // NDC clip-space margin so a bar doesn't pop off right at the screen edge

/**
 * Floating world-space HP bars above every combat-relevant dragon (feral or
 * wary, not yet tamed and not currently ridden) - before this, HUD showed
 * player health/stamina/bond/resonance but nothing at all for a dragon's HP,
 * so there was no way to tell damage was landing. DOM elements projected to
 * screen space each frame via camera.project(), matching the rest of the
 * UI's plain-DOM-overlay approach (HUD/DialogueBox/TouchControls) rather
 * than introducing a separate canvas or CSS3D layer.
 */
export class WorldHealthBars {
  private root: HTMLDivElement;
  private bars = new Map<string, BarEntry>();
  private lastHealth = new Map<string, number>();

  constructor() {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-world-bars';
    document.body.appendChild(this.root);
  }

  /** Call once per frame, after renderer.render() so camera.matrixWorldInverse is current. */
  update(dragons: Dragon[], camera: THREE.PerspectiveCamera): void {
    const seen = new Set<string>();

    for (const dragon of dragons) {
      if (!dragon.alive || dragon.riddenBy || !isCombatRelevant(dragon)) continue;

      const anchor = dragon.object3D.position.clone().add(new THREE.Vector3(0, dragon.barAnchorHeight, 0));
      const screen = anchor.project(camera);
      const offscreen = screen.z > 1 || screen.z < -1 || Math.abs(screen.x) > 1 + FADE_MARGIN || Math.abs(screen.y) > 1 + FADE_MARGIN;

      let entry = this.bars.get(dragon.id);
      if (offscreen) {
        if (entry) entry.root.style.display = 'none';
        continue;
      }
      if (!entry) {
        entry = this.buildEntry();
        this.bars.set(dragon.id, entry);
      }
      seen.add(dragon.id);

      const x = (screen.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screen.y * 0.5 + 0.5) * window.innerHeight;
      entry.root.style.display = '';
      entry.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;

      const ratio = Math.max(0, Math.min(100, (dragon.health / dragon.maxHealth) * 100));
      entry.fill.style.width = `${ratio}%`;

      const prev = this.lastHealth.get(dragon.id);
      if (prev !== undefined && dragon.health < prev) {
        // Re-trigger the flash animation by toggling the class off and back on next frame.
        entry.flash.classList.remove('db-flash-active');
        void entry.flash.offsetWidth; // force reflow so the animation restarts
        entry.flash.classList.add('db-flash-active');
      }
      this.lastHealth.set(dragon.id, dragon.health);
    }

    for (const [id, entry] of this.bars) {
      if (!seen.has(id) && !dragons.some((d) => d.id === id && d.alive)) {
        entry.root.remove();
        this.bars.delete(id);
        this.lastHealth.delete(id);
      }
    }
  }

  private buildEntry(): BarEntry {
    const root = document.createElement('div');
    root.className = 'db-world-bar';
    const track = document.createElement('div');
    track.className = 'db-world-bar-track';
    const flash = document.createElement('div');
    flash.className = 'db-world-bar-flash';
    const fill = document.createElement('div');
    fill.className = 'db-world-bar-fill';
    track.appendChild(flash);
    track.appendChild(fill);
    root.appendChild(track);
    this.root.appendChild(root);
    return { root, fill, flash };
  }
}

function isCombatRelevant(dragon: Dragon): boolean {
  return dragon.ai.state === 'feral' || dragon.ai.state === 'wary';
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-world-bars {
      position: fixed;
      inset: 0;
      z-index: 12;
      pointer-events: none;
    }
    .db-world-bar {
      position: absolute;
      top: 0;
      left: 0;
      width: 64px;
      margin-top: -10px;
    }
    .db-world-bar-track {
      position: relative;
      height: 6px;
      border-radius: 3px;
      background: rgba(11, 15, 26, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.25);
      overflow: hidden;
    }
    .db-world-bar-fill {
      position: relative;
      z-index: 1;
      height: 100%;
      background: linear-gradient(90deg, #8f2b2b, #c95c3a);
      transition: width 0.15s ease;
    }
    .db-world-bar-flash {
      position: absolute;
      inset: 0;
      background: #ffffff;
      opacity: 0;
    }
    .db-world-bar-flash.db-flash-active {
      animation: db-bar-flash 0.25s ease-out;
    }
    @keyframes db-bar-flash {
      0% { opacity: 0.85; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
