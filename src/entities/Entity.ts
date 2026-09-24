import * as THREE from 'three';
import type { RigidBody, Collider } from '@dimforge/rapier3d-compat';
import type { HurtboxTarget } from '../combat/CombatSystem';

let nextEntityId = 1;

/**
 * Base for anything that lives in the world with a transform, a physics
 * body, and hit points. Knight and Dragon both extend this; world/zone
 * dressing (rocks, static props) does not need to.
 */
export abstract class Entity implements HurtboxTarget {
  readonly id: string;
  readonly object3D: THREE.Object3D;
  rigidBody: RigidBody | null = null;
  collider: Collider | null = null;

  health: number;
  maxHealth: number;
  alive = true;

  /** Hurtbox radius used by CombatSystem's simple sphere-overlap checks. */
  radius = 0.6;

  constructor(kind: string, maxHealth: number) {
    this.id = `${kind}-${nextEntityId++}`;
    this.object3D = new THREE.Object3D();
    this.object3D.name = this.id;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
  }

  getPosition(): THREE.Vector3 {
    return this.object3D.position;
  }

  isAlive(): boolean {
    return this.alive;
  }

  takeDamage(amount: number, _sourceId?: string): void {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.onDamaged(amount);
    if (this.health <= 0) this.die();
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Pulls the THREE object's transform from the Rapier rigid body. Call after each physics step. */
  syncObjectFromBody(): void {
    if (!this.rigidBody) return;
    const t = this.rigidBody.translation();
    this.object3D.position.set(t.x, t.y, t.z);
  }

  protected onDamaged(_amount: number): void {
    // hook for subclasses (flinch reactions, AI state changes, etc.)
  }

  protected die(): void {
    this.alive = false;
    this.onDeath();
  }

  /** Resets health/alive state, e.g. for a player respawn. */
  revive(atPosition?: THREE.Vector3): void {
    this.alive = true;
    this.health = this.maxHealth;
    if (atPosition) {
      this.object3D.position.copy(atPosition);
      this.rigidBody?.setTranslation({ x: atPosition.x, y: atPosition.y, z: atPosition.z }, true);
    }
  }

  protected onDeath(): void {
    // hook for subclasses
  }

  abstract update(dt: number): void;
}
