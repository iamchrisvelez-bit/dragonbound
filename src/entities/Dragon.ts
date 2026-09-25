import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Entity } from './Entity';
import { eventBus } from '../core/EventBus';
import { assetLoader } from '../core/AssetLoader';
import { combatSystem } from '../combat/CombatSystem';
import { DragonAI } from '../taming/DragonAI';
import { BondMeter } from '../taming/BondMeter';
import { MAX_ENGAGE_RANGE, eligibleAttacks, type DragonAttackDef } from '../combat/DragonAttacks';

const UP = new THREE.Vector3(0, 1, 0);
const APPROACH_SPEED = 2.6;
const CHASE_STOP_DISTANCE = 1.4;
const DEFAULT_EYE_COLOR = 0xd4a853;
const DEFAULT_EYE_INTENSITY = 0.6;

// Animation state graph: clip names from the uploaded dragon_whelp.glb (see
// public/assets/CREDITS.md). Only 4 clips exist - no dedicated attack/hit/
// death - so Roar stands in as the windup telegraph and Flap as the
// active-attack pose, both sped up to fit each pattern's actual timing
// (same trick Knight.ts uses for its combo/dodge clips). Placeholder mesh
// has no skeleton, so playAnimation() no-ops gracefully until the real
// model (and its actions) has loaded.
const ANIM_IDLE = 'Idle';
const ANIM_WALK = 'Walk';
const ANIM_FLAP = 'Flap';
const ANIM_ROAR = 'Roar';
const ANIMATION_CLIP_NAMES = [ANIM_IDLE, ANIM_WALK, ANIM_FLAP, ANIM_ROAR];
const ONE_SHOT_ANIMATIONS = new Set([ANIM_FLAP, ANIM_ROAR]);
const ANIMATION_CROSSFADE = 0.15;
/** Visual-only scale-up so the (deliberately small, whelp-sized) model reads clearly in third-person combat. */
const DRAGON_VISUAL_SCALE = 2.2;

type DragonPhase = 'idle' | 'chase' | 'windup' | 'active' | 'recovery';

export class Dragon extends Entity {
  readonly ai = new DragonAI();
  readonly bondMeter = new BondMeter();
  readonly displayName: string;
  readonly archetype: string;
  /** HP ratio at which the dragon becomes tameable (feral -> wary). */
  readonly tameThresholdRatio = 0.3;

  /** Detection range for self-aggro; AggroManager also uses deaggroRange for hysteresis. */
  readonly aggroRange = MAX_ENGAGE_RANGE;
  readonly deaggroRange = MAX_ENGAGE_RANGE + 4;

  facingYaw = 0;
  /** Set by TamingController the moment this dragon is tamed; drives the mount "settle" delay. */
  tamedAt = 0;
  /** Knight id currently riding this dragon, if any. While set, updateAI() no-ops - GameManager drives movement directly. */
  riddenBy: string | null = null;

  private visual: THREE.Object3D;
  private eyeMaterials: THREE.MeshStandardMaterial[] = [];

  private phase: DragonPhase = 'idle';
  private currentAttack: DragonAttackDef | null = null;
  private phaseTimer = 0;
  private cooldowns = new Map<string, number>();
  private isMovingExternally = false;

  private mixer: THREE.AnimationMixer | null = null;
  private animActions = new Map<string, THREE.AnimationAction>();
  private currentAnimName: string | null = null;

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

    const built = buildDragonPlaceholder();
    this.visual = built.group;
    this.eyeMaterials = built.eyeMaterials;
    this.object3D.add(this.visual);
    this.object3D.position.copy(startPosition);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPosition.x, startPosition.y, startPosition.z)
      .lockRotations()
      .setGravityScale(0)
      .setLinearDamping(2.5);
    this.rigidBody = world.createRigidBody(bodyDesc);
    // Sized (and kept smaller than the visual mesh, same as Knight's collider
    // vs. its mesh) so it doesn't embed in the ground at spawn height y=1 -
    // capsule(0.9, 0.9) had a 1.8 half-extent, which spawned it clipped into
    // the ground and let physics push it up to y~1.8. That silently broke
    // every dragon-authored hitbox's height match against Knight (who stays
    // at y=1): only Tail Sweep's oversized radius was big enough to paper
    // over the resulting ~0.8 vertical gap, so Lunge and Breath always
    // whiffed regardless of horizontal aim. Keep this small enough that
    // 1 (halfHeight) + 1 (radius) <= startPosition.y for every dragon spawn.
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.45, 0.45).setFriction(0.2);
    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    combatSystem.registerHurtbox(this);

    this.ai.onTransition((from, to) => {
      eventBus.emit('dragon:state-changed', { dragonId: this.id, from, to });
      if (to === 'wary') eventBus.emit('dragon:tamable', { dragonId: this.id });
    });

    void this.loadRealModel();
  }

  /** Satisfies Entity's abstract update(); real per-frame logic needs the
   * player's position + aggro state, so GameManager calls updateAI() directly instead. */
  update(_dt: number): void {}

  updateAI(dt: number, playerPosition: THREE.Vector3, isAggro: boolean): void {
    this.ai.evaluateHealth(this.alive ? this.health / this.maxHealth : 0, this.tameThresholdRatio);

    if (this.riddenBy) return; // GameManager drives velocity/facing directly while ridden

    for (const [name, remaining] of this.cooldowns) {
      if (remaining > 0) this.cooldowns.set(name, Math.max(0, remaining - dt));
    }

    if (this.ai.state !== 'feral') {
      this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);
      return;
    }

    const toPlayer = playerPosition.clone().sub(this.object3D.position).setY(0);
    const dist = toPlayer.length();
    const dirToPlayer = dist > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);

    switch (this.phase) {
      case 'idle':
        if (isAggro) this.phase = 'chase';
        else this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        break;

      case 'chase': {
        if (!isAggro) {
          this.phase = 'idle';
          this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
          break;
        }
        this.faceDirection(dirToPlayer);
        const options = eligibleAttacks(dist, (name) => this.cooldowns.get(name) ?? 0);
        if (options.length > 0) {
          this.beginWindup(options[Math.floor(Math.random() * options.length)]);
        } else if (dist > CHASE_STOP_DISTANCE) {
          // Either beyond every pattern's range, or in range with everything
          // still on cooldown - either way, closing the gap is the right call.
          this.rigidBody?.setLinvel({ x: dirToPlayer.x * APPROACH_SPEED, y: 0, z: dirToPlayer.z * APPROACH_SPEED }, true);
        } else {
          // In range but every matching pattern is still on cooldown - hold rather than crowd the player.
          this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        break;
      }

      case 'windup': {
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.faceDirection(dirToPlayer);
        this.setTelegraphIntensity(1 - this.phaseTimer / this.currentAttack!.windup);
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.beginActive(dirToPlayer, playerPosition);
        break;
      }

      case 'active': {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.beginRecovery();
        break;
      }

      case 'recovery': {
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = 'chase';
          this.currentAttack = null;
          this.resetTelegraph();
        }
        break;
      }
    }

    this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);
  }

  /** GameManager calls this every frame in place of updateAI() while the player is riding. */
  applyExternalMovement(velocity: THREE.Vector3, facingYaw: number): void {
    this.rigidBody?.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
    this.facingYaw = facingYaw;
    this.object3D.quaternion.setFromAxisAngle(UP, facingYaw);
    this.isMovingExternally = velocity.lengthSq() > 0.0001;
  }

  /** Advances the animation mixer and picks the right clip for the current
   * state. Called every frame by GameManager for every dragon, regardless
   * of feral/tamed/ridden state, so the mixer never stalls. No-ops until
   * the real model (and its actions) has finished loading. */
  updateAnimationMixer(dt: number): void {
    if (this.riddenBy) {
      this.playAnimation(this.isMovingExternally ? ANIM_WALK : ANIM_IDLE);
    } else if (this.ai.state !== 'feral') {
      this.playAnimation(ANIM_IDLE);
    } else {
      switch (this.phase) {
        case 'idle':
        case 'recovery':
          this.playAnimation(ANIM_IDLE);
          break;
        case 'chase':
          this.playAnimation(ANIM_WALK);
          break;
        case 'windup':
          this.playAnimation(ANIM_ROAR, this.currentAttack?.windup);
          break;
        case 'active':
          this.playAnimation(ANIM_FLAP, this.currentAttack?.active);
          break;
      }
    }

    this.mixer?.update(dt);
  }

  /** Crossfades to `name`, scaling one-shot clips to finish in `targetDuration`
   * seconds (Roar/Flap run 0.6-1.6s natively; our attack timing is much
   * snappier, so they play sped-up rather than getting cut off). No-op if
   * that clip isn't loaded yet or is already playing. */
  private playAnimation(name: string, targetDuration?: number): void {
    if (this.currentAnimName === name) return;
    const action = this.animActions.get(name);
    if (!action) return;

    const previousName = this.currentAnimName;
    this.currentAnimName = name;

    const oneShot = ONE_SHOT_ANIMATIONS.has(name);
    const clipDuration = action.getClip().duration;
    action.reset();
    action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    action.clampWhenFinished = oneShot;
    action.timeScale = targetDuration && clipDuration > 0 ? clipDuration / targetDuration : 1;
    action.fadeIn(ANIMATION_CROSSFADE);
    action.play();

    if (previousName) this.animActions.get(previousName)?.fadeOut(ANIMATION_CROSSFADE);
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

  private beginWindup(pattern: DragonAttackDef): void {
    this.currentAttack = pattern;
    this.phase = 'windup';
    this.phaseTimer = pattern.windup;
    this.setTelegraphColor(pattern.telegraphColor);
  }

  private beginActive(dirToPlayer: THREE.Vector3, playerPosition: THREE.Vector3): void {
    const pattern = this.currentAttack;
    if (!pattern) return;
    this.phase = 'active';
    this.phaseTimer = pattern.active;
    this.cooldowns.set(pattern.name, pattern.cooldown);
    this.resetTelegraph();

    switch (pattern.type) {
      case 'lunge': {
        // The dragon's rigid body still gets a velocity burst for the visual
        // lunge, but rigidBody.linearDamping (needed so it doesn't slide
        // forever on approach) eats a lot of that speed inside a 0.25s
        // window - relying on physics alone to close the gap made this
        // whiff almost every time in testing. The hitbox instead lerps on
        // elapsed time from where the dragon committed to exactly where the
        // player was standing at that moment, so the bite always reaches -
        // dodging away during the windup is still the real counterplay,
        // since the target point is locked in at commit, not homing.
        this.rigidBody?.setLinvel({ x: dirToPlayer.x * pattern.speed, y: 0, z: dirToPlayer.z * pattern.speed }, true);
        const startPos = this.object3D.position.clone();
        const targetPos = playerPosition.clone();
        const startedAt = performance.now() / 1000;
        combatSystem.spawnHitbox({
          ownerId: this.id,
          damage: pattern.damage,
          radius: pattern.radius,
          duration: pattern.active,
          getPosition: () => {
            const elapsed = performance.now() / 1000 - startedAt;
            const t = Math.min(1, elapsed / pattern.active);
            return startPos.clone().lerp(targetPos, t).setY(startPos.y + 1);
          },
        });
        break;
      }
      case 'tailSweep': {
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        combatSystem.spawnHitbox({
          ownerId: this.id,
          damage: pattern.damage,
          radius: pattern.radius,
          duration: pattern.active,
          // No forward offset: an all-around sweep centered on the dragon.
          getPosition: () => this.object3D.position.clone().setY(this.object3D.position.y + 1),
        });
        break;
      }
      case 'breath': {
        this.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        const spawnPos = this.object3D.position.clone();
        const castDir = dirToPlayer.clone();
        const startedAt = performance.now() / 1000;
        combatSystem.spawnHitbox({
          ownerId: this.id,
          damage: pattern.damage,
          radius: pattern.radius,
          duration: pattern.active,
          getPosition: () => {
            const elapsed = performance.now() / 1000 - startedAt;
            return spawnPos.clone().addScaledVector(castDir, pattern.speed * elapsed).setY(spawnPos.y + 1);
          },
        });
        break;
      }
    }
  }

  private beginRecovery(): void {
    this.phase = 'recovery';
    this.phaseTimer = this.currentAttack?.recovery ?? 0.5;
  }

  private setTelegraphColor(hex: number): void {
    for (const mat of this.eyeMaterials) mat.emissive.setHex(hex);
  }

  private setTelegraphIntensity(t: number): void {
    for (const mat of this.eyeMaterials) mat.emissiveIntensity = DEFAULT_EYE_INTENSITY + Math.max(0, t) * 1.6;
  }

  private resetTelegraph(): void {
    for (const mat of this.eyeMaterials) {
      mat.emissive.setHex(DEFAULT_EYE_COLOR);
      mat.emissiveIntensity = DEFAULT_EYE_INTENSITY;
    }
  }

  private faceDirection(dir: THREE.Vector3): void {
    // Inverse of the forward-vector formula used everywhere else
    // (new THREE.Vector3(0,0,-1).applyAxisAngle(UP, yaw)): that maps
    // yaw -> (-sin(yaw), -cos(yaw)), so recovering yaw from a direction
    // needs atan2(-dir.x, -dir.z), not atan2(dir.x, dir.z).
    this.facingYaw = Math.atan2(-dir.x, -dir.z);
  }

  private async loadRealModel(): Promise<void> {
    const loaded = await assetLoader.loadModel('dragon', () => ({ scene: buildDragonPlaceholder().group, animations: [] }));
    if (loaded.animations.length === 0) return;
    this.object3D.remove(this.visual);
    this.visual = loaded.scene;
    // The whelp model's own geometry is ~0.73 units tall (a young dragon, by
    // design - matches this zone's "Wyrmling" naming) - too small to read
    // clearly at normal third-person combat distance, so it's scaled up for
    // visibility. This only affects the rendered mesh: the Rapier collider
    // and the CombatSystem hurtbox radius above are untouched, so hit
    // detection isn't affected by this cosmetic resize.
    this.visual.scale.setScalar(DRAGON_VISUAL_SCALE);
    this.eyeMaterials = []; // real assets telegraph via their own animations, not the placeholder's eye-flash hack
    this.object3D.add(this.visual);

    this.mixer = new THREE.AnimationMixer(this.visual);
    for (const name of ANIMATION_CLIP_NAMES) {
      const clip = THREE.AnimationClip.findByName(loaded.animations, name);
      if (clip) this.animActions.set(name, this.mixer.clipAction(clip));
      else console.warn(`[Dragon] animation clip "${name}" not found in dragon.glb`);
    }
  }
}

/** A capsule-bodied low-poly placeholder dragon, swapped for a real glTF
 * automatically once /assets/models/dragon.glb exists (see AssetLoader). */
function buildDragonPlaceholder(): { group: THREE.Group; eyeMaterials: THREE.MeshStandardMaterial[] } {
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

  const eyeMat = new THREE.MeshStandardMaterial({
    color: DEFAULT_EYE_COLOR,
    emissive: DEFAULT_EYE_COLOR,
    emissiveIntensity: DEFAULT_EYE_INTENSITY,
  });
  const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(0.2, 1.25, -1.85);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(-0.2, 1.25, -1.85);
  group.add(eyeR);

  return { group, eyeMaterials: [eyeMat] };
}
