import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Entity } from './Entity';
import { InputManager } from '../core/InputManager';
import { eventBus } from '../core/EventBus';
import { assetLoader } from '../core/AssetLoader';
import { StaminaPool } from '../combat/Stamina';
import { ComboSystem } from '../combat/ComboSystem';
import { combatSystem } from '../combat/CombatSystem';
import { lerpAngle } from '../core/mathUtils';
import { progressionManager } from '../progression/ProgressionManager';

const UP = new THREE.Vector3(0, 1, 0);
const DODGE_STAMINA_COST = 18;
const DODGE_SPEED = 9;
const DODGE_DURATION = 0.28;
const MOVE_SPEED = 4.2;
const BLOCK_MOVE_MULTIPLIER = 0.35;
const BLOCK_STAMINA_DRAIN_PER_SECOND = 14;
const TURN_SPEED = 12; // higher = snappier facing
const BASE_MAX_HEALTH = 100;
const BASE_MAX_STAMINA = 100;

export class Knight extends Entity {
  readonly stamina = new StaminaPool(BASE_MAX_STAMINA, 18, 0.6);
  readonly combo = new ComboSystem();

  facingYaw = 0;
  isDodging = false;
  isBlocking = false;
  mountedDragonId: string | null = null;

  /** Live totals from ProgressionManager (unlocked skills + equipped gear); recomputed on change. */
  attackDamageMultiplier = 1;
  attackDamageFlat = 0;
  bondGainMultiplier = 1;

  private dodgeTimer = 0;
  private dodgeDirection = new THREE.Vector3(0, 0, -1);
  private attackRecoveryTimer = 0;
  private visual: THREE.Object3D;

  constructor(world: RAPIER.World, startPosition: THREE.Vector3) {
    super('knight', BASE_MAX_HEALTH);

    this.visual = buildKnightPlaceholder();
    this.object3D.add(this.visual);
    this.object3D.position.copy(startPosition);
    this.radius = 0.45;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPosition.x, startPosition.y, startPosition.z)
      .lockRotations()
      .setGravityScale(0)
      .setLinearDamping(2);
    this.rigidBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.45, 0.4).setFriction(0.1);
    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    combatSystem.registerHurtbox(this);
    this.applyProgressionModifiers();
    eventBus.on('progression:skill-unlocked', () => this.applyProgressionModifiers());
    eventBus.on('progression:gear-equipped', () => this.applyProgressionModifiers());
    void this.loadRealModel();
  }

  /** Recomputes max health/stamina, stamina regen rate, attack damage, and bond
   * gain rate from ProgressionManager. Called on construction and whenever a
   * skill node is unlocked or gear is (re)equipped. A max-stat increase grants
   * the same amount of current health/stamina immediately (standard levelup feel). */
  private applyProgressionModifiers(): void {
    const mods = progressionManager.getModifiers();

    const newMaxHealth = BASE_MAX_HEALTH + mods.maxHealthBonus;
    const healthGain = Math.max(0, newMaxHealth - this.maxHealth);
    this.maxHealth = newMaxHealth;
    this.health = Math.min(this.maxHealth, this.health + healthGain);

    const newMaxStamina = BASE_MAX_STAMINA + mods.maxStaminaBonus;
    const staminaGain = Math.max(0, newMaxStamina - this.stamina.max);
    this.stamina.max = newMaxStamina;
    this.stamina.current = Math.min(this.stamina.max, this.stamina.current + staminaGain);
    this.stamina.regenMultiplier = mods.staminaRegenMultiplier;

    this.attackDamageMultiplier = mods.attackDamageMultiplier;
    this.attackDamageFlat = mods.attackDamageFlat;
    this.bondGainMultiplier = mods.bondGainMultiplier;
  }

  get isMounted(): boolean {
    return this.mountedDragonId !== null;
  }

  /** Reads input and applies movement/action intent. Call once per frame before world.step(). */
  handleInput(dt: number, input: InputManager, cameraYaw: number): void {
    this.stamina.tick(dt);
    if (this.dodgeTimer > 0) this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    if (this.attackRecoveryTimer > 0) this.attackRecoveryTimer = Math.max(0, this.attackRecoveryTimer - dt);

    this.isDodging = this.dodgeTimer > 0;

    const move = input.getMoveVector();
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(UP, cameraYaw);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);
    const moveDir = new THREE.Vector3()
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.y);
    const hasMoveInput = moveDir.lengthSq() > 0.0001;
    if (hasMoveInput) moveDir.normalize();

    this.isBlocking = !this.isMounted && input.isActionHeld('block') && this.stamina.current > 0 && this.dodgeTimer <= 0;
    if (this.isBlocking) this.stamina.drain(BLOCK_STAMINA_DRAIN_PER_SECOND, dt);

    // Dodge trigger
    if (!this.isMounted && !this.isDodging && input.wasActionPressed('dodge') && this.stamina.spend(DODGE_STAMINA_COST)) {
      this.dodgeDirection = hasMoveInput ? moveDir.clone() : forward.clone();
      this.dodgeTimer = DODGE_DURATION;
      this.isDodging = true;
      this.attackRecoveryTimer = 0;
    }

    // Attack trigger
    if (!this.isMounted && !this.isDodging && this.attackRecoveryTimer <= 0 && input.wasActionPressed('attack')) {
      const attack = this.combo.next(performance.now() / 1000);
      if (this.stamina.spend(attack.staminaCost)) {
        this.attackRecoveryTimer = attack.recoveryDuration;
        eventBus.emit('combat:attack-started', { attackerId: this.id, comboIndex: this.combo.comboIndex });
        const damage = Math.round((attack.damage + this.attackDamageFlat) * this.attackDamageMultiplier);
        combatSystem.spawnHitbox({
          ownerId: this.id,
          damage,
          radius: attack.hitboxRadius,
          duration: attack.activeDuration,
          getPosition: () => {
            const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this.facingYaw);
            return this.object3D.position.clone().addScaledVector(fwd, attack.hitboxForwardOffset).setY(this.object3D.position.y + 1);
          },
        });
      } else {
        this.combo.reset();
      }
    }

    // Facing: dodge locks facing to dodge direction; otherwise face move direction.
    if (this.isDodging) {
      this.faceDirection(this.dodgeDirection, 1);
    } else if (hasMoveInput && this.attackRecoveryTimer <= 0) {
      this.faceDirection(moveDir, dt * TURN_SPEED);
    }
    this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);

    // Velocity
    if (!this.rigidBody) return;
    let speed = MOVE_SPEED;
    if (this.isBlocking) speed *= BLOCK_MOVE_MULTIPLIER;
    if (this.attackRecoveryTimer > 0 && !this.isDodging) speed *= 0.15;

    const velocity = this.isDodging
      ? this.dodgeDirection.clone().multiplyScalar(DODGE_SPEED)
      : moveDir.multiplyScalar(speed);

    if (!this.isMounted) {
      this.rigidBody.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
    } else {
      this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  update(_dt: number): void {
    // Per-frame timers are advanced in handleInput (which always runs first
    // each tick); nothing additional needed here. Present to satisfy Entity.
  }

  mount(dragonId: string): void {
    this.mountedDragonId = dragonId;
    eventBus.emit('player:mounted', { dragonId });
  }

  dismount(): void {
    if (!this.mountedDragonId) return;
    const dragonId = this.mountedDragonId;
    this.mountedDragonId = null;
    eventBus.emit('player:dismounted', { dragonId });
  }

  override takeDamage(amount: number, sourceId?: string): void {
    if (this.isDodging) return; // brief i-frames while dodging
    super.takeDamage(amount, sourceId);
  }

  protected override onDamaged(amount: number): void {
    eventBus.emit('player:damaged', { amount, currentHealth: this.health, maxHealth: this.maxHealth });
  }

  protected override onDeath(): void {
    eventBus.emit('player:died', {});
  }

  private faceDirection(dir: THREE.Vector3, t: number): void {
    // Inverse of the forward-vector formula used everywhere else
    // (new THREE.Vector3(0,0,-1).applyAxisAngle(UP, yaw)): that maps
    // yaw -> (-sin(yaw), -cos(yaw)), so recovering yaw from a direction
    // needs atan2(-dir.x, -dir.z), not atan2(dir.x, dir.z).
    const targetYaw = Math.atan2(-dir.x, -dir.z);
    this.facingYaw = lerpAngle(this.facingYaw, targetYaw, Math.min(1, t));
  }

  private async loadRealModel(): Promise<void> {
    const loaded = await assetLoader.loadModel('knight', () => ({ scene: buildKnightPlaceholder(), animations: [] }));
    if (loaded.animations.length === 0) return; // still just the placeholder shape; nothing to swap visually
    this.object3D.remove(this.visual);
    this.visual = loaded.scene;
    this.object3D.add(this.visual);
  }
}

function buildKnightPlaceholder(): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a63, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);

  const helmMat = new THREE.MeshStandardMaterial({ color: 0xc7cbd1, roughness: 0.4, metalness: 0.6 });
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), helmMat);
  helm.position.y = 1.65;
  helm.castShadow = true;
  group.add(helm);

  const swordMat = new THREE.MeshStandardMaterial({ color: 0xd8d8de, roughness: 0.3, metalness: 0.7 });
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), swordMat);
  sword.position.set(0.42, 1.0, 0.15);
  sword.rotation.z = Math.PI / 10;
  sword.castShadow = true;
  group.add(sword);

  return group;
}
