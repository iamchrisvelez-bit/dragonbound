import * as THREE from 'three';
import { eventBus } from '../core/EventBus';

/**
 * Anything that can be hit. Entity implements this directly; the interface
 * exists so CombatSystem doesn't need to import the Entity class.
 */
export interface HurtboxTarget {
  id: string;
  radius: number;
  getPosition(): THREE.Vector3;
  isAlive(): boolean;
  takeDamage(amount: number, sourceId?: string): void;
}

interface SpawnHitboxParams {
  ownerId: string;
  damage: number;
  radius: number;
  /** Seconds the hitbox stays live. */
  duration: number;
  /** Returns the hitbox's current world position each frame (follows the attacker). */
  getPosition: () => THREE.Vector3;
}

interface ActiveHitbox extends SpawnHitboxParams {
  remaining: number;
  hitTargetIds: Set<string>;
}

/**
 * Deliberately simple hit detection: attacks spawn a short-lived sphere
 * that overlap-tests against registered hurtboxes by distance. This is not
 * routed through Rapier's collision groups - for a melee-combat scaffold,
 * cheap sphere checks are easier to reason about and tune than negotiating
 * physics collision filters for transient, non-physical hit volumes.
 */
export class CombatSystem {
  private hurtboxes = new Map<string, HurtboxTarget>();
  private activeHitboxes: ActiveHitbox[] = [];

  registerHurtbox(target: HurtboxTarget): void {
    this.hurtboxes.set(target.id, target);
  }

  unregisterHurtbox(id: string): void {
    this.hurtboxes.delete(id);
  }

  spawnHitbox(params: SpawnHitboxParams): void {
    this.activeHitboxes.push({ ...params, remaining: params.duration, hitTargetIds: new Set() });
  }

  update(dt: number): void {
    for (const hb of this.activeHitboxes) hb.remaining -= dt;
    this.activeHitboxes = this.activeHitboxes.filter((hb) => hb.remaining > 0);

    for (const hb of this.activeHitboxes) {
      const hbPos = hb.getPosition();
      for (const target of this.hurtboxes.values()) {
        if (target.id === hb.ownerId) continue;
        if (hb.hitTargetIds.has(target.id)) continue;
        if (!target.isAlive()) continue;

        const dist = hbPos.distanceTo(target.getPosition());
        if (dist <= hb.radius + target.radius) {
          hb.hitTargetIds.add(target.id);
          target.takeDamage(hb.damage, hb.ownerId);
          eventBus.emit('combat:hit', { attackerId: hb.ownerId, targetId: target.id, damage: hb.damage });
        }
      }
    }
  }
}

export const combatSystem = new CombatSystem();
