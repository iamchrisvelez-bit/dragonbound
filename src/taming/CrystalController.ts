import * as THREE from 'three';
import { InputManager } from '../core/InputManager';
import { eventBus } from '../core/EventBus';
import { Knight } from '../entities/Knight';
import { Crystal } from '../world/Crystal';

export const CRYSTAL_INTERACT_RANGE = 3;
/** "Five to eight seconds" per docs/design/crystal-and-taming-systems.md §3's tuning notes. */
const ATTUNE_HOLD_DURATION = 6.5;
/** Where in the hold the mid-hold destabilisation beat fires (fraction of ATTUNE_HOLD_DURATION). */
const DESTABILIZE_AT_FRACTION = 0.55;
const FEEDBACK_TICK_BUCKETS = 5;

export interface CrystalOutcome {
  crystalId: string;
  dragonName: string;
  archetype: string;
  fractured: boolean;
  position: THREE.Vector3;
}

/**
 * Orchestrates System A: hold-and-attune (docs/design/crystal-and-taming-systems.md
 * §3). Deliberately reuses the mountToggle button (the game's general
 * "interact" verb) but reads it with `isActionHeld` instead of the edge-
 * triggered `wasActionPressed`/`consumeAction` TamingController and
 * GameManager's mount/dismount handling use - a continuous hold, not a tap,
 * is the whole point of this interaction. Since crystals are placed away
 * from dragon spawns/mount points, the two input styles never actually
 * contend for the same press (see the class-level note in GameManager).
 *
 * Any early release fractures the crystal - rushing, forcing, or breaking
 * contact are all "not patient", and the design doc is explicit that this
 * is meant to feel player-caused, not like a hidden timer punishing them.
 */
export class CrystalController {
  private active: Crystal | null = null;
  private holdElapsed = 0;
  private destabilizeFired = false;
  private lastTickBucket = 0;

  update(dt: number, input: InputManager, knight: Knight, crystals: readonly Crystal[]): CrystalOutcome | null {
    if (!this.active) {
      if (!input.isActionHeld('mountToggle')) return null;
      const candidate = crystals.find(
        (c) => !c.opened && c.object3D.position.distanceTo(knight.object3D.position) <= CRYSTAL_INTERACT_RANGE,
      );
      if (!candidate) return null;

      this.active = candidate;
      this.holdElapsed = 0;
      this.destabilizeFired = false;
      this.lastTickBucket = 0;
      eventBus.emit('crystal:attune-started', { crystalId: candidate.id });
      vibrate([15]);
      return null;
    }

    const crystal = this.active;
    if (!input.isActionHeld('mountToggle')) return this.resolve(crystal, true);

    this.holdElapsed += dt;
    const progress = Math.min(1, this.holdElapsed / ATTUNE_HOLD_DURATION);
    crystal.setResonance(progress);
    eventBus.emit('crystal:attune-progress', { crystalId: crystal.id, progress });

    if (!this.destabilizeFired && progress >= DESTABILIZE_AT_FRACTION) {
      this.destabilizeFired = true;
      eventBus.emit('crystal:destabilizing', { crystalId: crystal.id });
      vibrate([40, 60, 90]);
    } else {
      const bucket = Math.floor(progress * FEEDBACK_TICK_BUCKETS);
      if (bucket > this.lastTickBucket) {
        this.lastTickBucket = bucket;
        vibrate([12]); // escalating feedback per the doc's tuning notes - a light tick per ~20% of the hold
      }
    }

    if (this.holdElapsed >= ATTUNE_HOLD_DURATION) return this.resolve(crystal, false);
    return null;
  }

  private resolve(crystal: Crystal, fractured: boolean): CrystalOutcome {
    crystal.resolve(fractured);
    const outcome: CrystalOutcome = {
      crystalId: crystal.id,
      dragonName: crystal.dragonName,
      archetype: crystal.archetype,
      fractured,
      position: crystal.object3D.position.clone(),
    };
    eventBus.emit(fractured ? 'crystal:fractured' : 'crystal:evaporated', {
      crystalId: crystal.id,
      dragonName: crystal.dragonName,
    });
    vibrate(fractured ? [80] : [20, 40, 20, 40, 120]);
    this.active = null;
    this.holdElapsed = 0;
    return outcome;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  get currentCrystal(): Crystal | null {
    return this.active;
  }

  /** 0-1, for the HUD's resonance bar. */
  get progress(): number {
    return this.active ? Math.min(1, this.holdElapsed / ATTUNE_HOLD_DURATION) : 0;
  }
}

function vibrate(pattern: number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Unsupported or blocked (desktop browsers, permissions) - purely cosmetic feedback, safe to ignore.
  }
}
