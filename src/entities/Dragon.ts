import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Entity } from './Entity';
import { eventBus } from '../core/EventBus';
import { assetLoader } from '../core/AssetLoader';
import { combatSystem } from '../combat/CombatSystem';
import { DragonAI } from '../taming/DragonAI';
import { BondMeter } from '../taming/BondMeter';

const UP = new THREE.Vector3(0, 1, 0);
const AGGRO_RANGE = 9;
const ATTACK_RANGE = 2.2;
const APPROACH_SPEED = 2.6;
const LUNGE_SPEED = 7;
const LUNGE_DURATION = 0.35;
const LUNGE_COOLDOWN = 2.2;
const LUNGE_DAMAGE = 12;

export class Dragon extends Entity {
  readonly ai = new DragonAI();
  readonly bondMeter = new BondMeter();
  readonly displayName: string;
  readonly archetype: string;
  /** HP ratio at which the dragon becomes tameable (feral -> wary). */
  readonly tameThresholdRatio = 0.3;

  private visual: THREE.Object3D;
  private facingYaw = 0;
  private lungeCooldown = 0;
  private isLunging = false;
  private lungeTimer = 0;

  constructor(
    world: RAPIER.World,
    startPosition: THREE.Vector3,
    displayName = 'Feral Wyrmling',
    archetype = 'ember-wyrm',
  ) {
    super('dragon', 160);
    this.displayName = displayName;
    this.archetype = archetype;
    this.radius = 1.1;

    this.visual = buildDragonPlaceholder();
    this.object3D.add(this.visual);
    this.object3D.position.copy(startPosition);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPosition.x, startPosition.y, startPosition.z)
      .lockRotations()
      .setGravityScale(0)
      .setLinearDamping(2.5);
    this.rigidBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.9, 0.9).setFriction(0.2);
    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    combatSystem.registerHurtbox(this);

    this.ai.onTransition((from, to) => {
      eventBus.emit('dragon:state-changed', { dragonId: this.id, from, to });
      if (to === 'wary') eventBus.emit('dragon:tamable', { dragonId: this.id });
    });

    void this.loadRealModel();
  }

  /** Satisfies Entity's abstract update(); real per-frame logic needs the
   * player's position, so GameManager calls updateAI() directly instead. */
  update(_dt: number): void {}

  updateAI(dt: number, playerPosition: THREE.Vector3): void {
    this.ai.evaluateHealth(this.alive ? this.health / this.maxHealth : 0, this.tameThresholdRatio);

    if (this.ai.state !== 'feral') {
      this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);
      return;
    }

    const toPlayer = playerPosition.clone().sub(this.object3D.position).setY(0);
    const dist = toPlayer.length();
    this.lungeCooldown = Math.max(0, this.lungeCooldown - dt);

    if (this.isLunging) {
      this.lungeTimer -= dt;
      if (this.lungeTimer <= 0) {
        this.isLunging = false;
        this.lungeCooldown = LUNGE_COOLDOWN;
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else if (dist < AGGRO_RANGE && dist > 0.001) {
      const dir = toPlayer.normalize();
      this.faceDirection(dir);
      if (dist > ATTACK_RANGE) {
        this.rigidBody?.setLinvel({ x: dir.x * APPROACH_SPEED, y: 0, z: dir.z * APPROACH_SPEED }, true);
      } else if (this.lungeCooldown <= 0) {
        this.startLunge(dir);
      } else {
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else {
      this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);
  }

  override takeDamage(amount: number, sourceId?: string): void {
    // Once past the tame threshold, the dragon leaves the kill path - it
    // can only proceed through the taming flow from here, not be finished
    // off by mashing attack. Keeps the vertical slice's win-state singular.
    if (!this.ai.isFeral) return;
    super.takeDamage(amount, sourceId);
  }

  protected override onDamaged(amount: number): void {
    eventBus.emit('dragon:damaged', { dragonId: this.id, amount, currentHealth: this.health, maxHealth: this.maxHealth });
  }

  protected override onDeath(): void {
    eventBus.emit('dragon:died', { dragonId: this.id });
  }

  private startLunge(dir: THREE.Vector3): void {
    this.isLunging = true;
    this.lungeTimer = LUNGE_DURATION;
    this.rigidBody?.setLinvel({ x: dir.x * LUNGE_SPEED, y: 0, z: dir.z * LUNGE_SPEED }, true);
    combatSystem.spawnHitbox({
      ownerId: this.id,
      damage: LUNGE_DAMAGE,
      radius: 1.1,
      duration: 0.25,
      getPosition: () => {
        const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this.facingYaw);
        return this.object3D.position.clone().addScaledVector(fwd, 1.4).setY(this.object3D.position.y + 1);
      },
    });
  }

  private faceDirection(dir: THREE.Vector3): void {
    // Inverse of the forward-vector formula used everywhere else
    // (new THREE.Vector3(0,0,-1).applyAxisAngle(UP, yaw)): that maps
    // yaw -> (-sin(yaw), -cos(yaw)), so recovering yaw from a direction
    // needs atan2(-dir.x, -dir.z), not atan2(dir.x, dir.z).
    this.facingYaw = Math.atan2(-dir.x, -dir.z);
  }

  private async loadRealModel(): Promise<void> {
    const loaded = await assetLoader.loadModel('dragon', () => ({ scene: buildDragonPlaceholder(), animations: [] }));
    if (loaded.animations.length === 0) return;
    this.object3D.remove(this.visual);
    this.visual = loaded.scene;
    this.object3D.add(this.visual);
  }
}

/** A capsule-bodied low-poly placeholder dragon, swapped for a real glTF
 * automatically once /assets/models/dragon.glb exists (see AssetLoader). */
function buildDragonPlaceholder(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b2e2e, roughness: 0.7, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 1.6, 4, 8), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);

  const headMat = new THREE.MeshStandardMaterial({ color: 0x7a3636, roughness: 0.6 });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 6), headMat);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 1.1, -1.5);
  head.castShadow = true;
  group.add(head);

  const wingMat = new THREE.MeshStandardMaterial({ color: 0x4a2020, roughness: 0.8, side: THREE.DoubleSide });
  const wingGeo = new THREE.ConeGeometry(0.9, 1.4, 3);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.rotation.set(0, 0, Math.PI / 2);
  wingL.position.set(-1.1, 1.6, 0);
  wingL.scale.set(0.5, 1, 1);
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = 1.1;
  group.add(wingR);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd4a853, emissive: 0xd4a853, emissiveIntensity: 0.6 });
  const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(0.2, 1.25, -1.85);
  group.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.2;
  group.add(eyeR);

  return group;
}
