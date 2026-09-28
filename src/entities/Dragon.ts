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

// Wild-taming failure response (docs/design/crystal-and-taming-systems.md §4,
// "failure is a spooked dragon, not a lost one"): a failed ResonanceMinigame
// attempt flees the dragon instead of just resetting it for an instant retry,
// and permanently (for the session - wild dragons don't persist across zone
// reloads anyway, see README) tightens the next attempt's signature.
const FLEE_SPEED = 4.5;
const SPOOK_COOLDOWN_MS = 4500;
const MAX_WARINESS = 5;

const ANIMATION_CROSSFADE = 0.15;
const HIT_FLARE_DURATION_MS = 500;

/**
 * Per-archetype model + animation-clip mapping. Each real dragon asset in
 * this game has a different clip vocabulary (see CREDITS.md for each), so
 * the state graph (updateAnimationMixer) reads clip names through this
 * rather than fixed module constants. `windupClip`/`hitClip` are optional -
 * an archetype without a dedicated telegraph or hit-reaction clip just
 * falls back to its idle clip for that beat, no-oping gracefully rather
 * than warning every frame. Placeholder mesh has no skeleton, so
 * playAnimation() no-ops until the real model (and its actions) has loaded.
 */
interface DragonModelConfig {
  /** AssetLoader model name - resolves to /assets/models/<modelName>.glb */
  modelName: string;
  idleClip: string;
  walkClip: string;
  windupClip: string | null;
  activeClip: string;
  /** Played briefly on taking damage, if the asset has a reaction clip - see onDamaged(). */
  hitClip: string | null;
  oneShotClips: string[];
  /** Visual-only scale so each archetype's native mesh size reads well at combat distance without touching hit detection. */
  visualScale: number;
}

const EMBER_WYRM_CONFIG: DragonModelConfig = {
  // Clip names from the project owner's uploaded dragon_whelp.glb (see
  // CREDITS.md). Only 4 clips exist - no dedicated attack/hit/death - so
  // Roar stands in as the windup telegraph and Flap as the active-attack
  // pose, both sped up to fit each pattern's actual timing (same trick
  // Knight.ts uses for its combo/dodge clips).
  modelName: 'dragon',
  idleClip: 'Idle',
  walkClip: 'Walk',
  windupClip: 'Roar',
  activeClip: 'Flap',
  hitClip: null,
  oneShotClips: ['Flap', 'Roar'],
  visualScale: 2.2, // the whelp's own geometry is ~0.73 units tall - too small at combat distance, see loadRealModel()
};

const QUATERNIUS_DRAKE_CONFIG: DragonModelConfig = {
  // Quaternius's "Animated Monster Pack" Dragon (CC0 1.0 Universal - see
  // CREDITS.md for full sourcing/verification notes). Only 2 clips exist:
  // Dragon_Flying (a hover/flight loop, used for every non-hit-reaction
  // state - windup has no dedicated telegraph, so it just continues the
  // idle/flying loop rather than warning every frame) and Dragon_Hit (a
  // damage-reaction flinch - the one animated hit-reaction any dragon in
  // this game has, see onDamaged()).
  modelName: 'dragon-quaternius',
  idleClip: 'Dragon_Flying',
  walkClip: 'Dragon_Flying',
  windupClip: null,
  activeClip: 'Dragon_Flying',
  hitClip: 'Dragon_Hit',
  oneShotClips: ['Dragon_Hit'],
  visualScale: 0.6, // this asset's native geometry is ~3.85 units tall (a full adult, not a whelp) - scaled down to read as bigger-but-comparable to the knight, not a tower
};

const DRAGON_MODEL_CONFIGS: Record<string, DragonModelConfig> = {
  'ember-wyrm': EMBER_WYRM_CONFIG,
  'quaternius-drake': QUATERNIUS_DRAKE_CONFIG,
};

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

  /** Failed-taming-attempt counter (see docs/design/crystal-and-taming-systems.md §4). Tightens ResonanceMinigame's next signature. Session-only, like the dragon itself. */
  wariness = 0;
  private spookedUntil = 0;

  private visual: THREE.Object3D;
  private eyeMaterials: THREE.MeshStandardMaterial[] = [];
  /** Set only for a crystal-fractured spawn (see loadRealModel/applyFracturedTint) - dulls the model's materials as the visible "scar" the design doc calls for. */
  private fractured = false;

  private phase: DragonPhase = 'idle';
  private currentAttack: DragonAttackDef | null = null;
  private phaseTimer = 0;
  private cooldowns = new Map<string, number>();
  private isMovingExternally = false;

  private mixer: THREE.AnimationMixer | null = null;
  private animActions = new Map<string, THREE.AnimationAction>();
  private currentAnimName: string | null = null;
  private bondFlareUntil = 0;
  private hitFlareUntil = 0;
  private readonly modelConfig: DragonModelConfig;

  constructor(
    world: RAPIER.World,
    startPosition: THREE.Vector3,
    displayName = 'Feral Wyrmling',
    archetype = 'ember-wyrm',
    fractured = false,
  ) {
    super('dragon', 160);
    this.displayName = displayName;
    this.archetype = archetype;
    this.fractured = fractured;
    this.modelConfig = DRAGON_MODEL_CONFIGS[archetype] ?? EMBER_WYRM_CONFIG;
    this.radius = 1.1;

    const built = buildDragonPlaceholder();
    this.visual = built.group;
    this.eyeMaterials = built.eyeMaterials;
    if (this.fractured) applyFracturedTint(this.visual);
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
      if (this.isSpooked) {
        // Coasting away from a failed taming attempt (see flee()) - let the
        // velocity flee() already set keep carrying it, and don't re-face
        // the player, until rigidBody.linearDamping settles it naturally
        // (same deceleration trick the lunge attack's velocity burst uses).
        this.object3D.quaternion.setFromAxisAngle(UP, this.facingYaw);
        return;
      }
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

  get isSpooked(): boolean {
    return performance.now() < this.spookedUntil;
  }

  /** Called by TamingController on a failed ResonanceMinigame attempt (see
   * docs/design/crystal-and-taming-systems.md §4). Pushes the dragon away
   * from the player with a real velocity impulse (not a teleport - it's
   * visible, and Rapier's linearDamping settles it naturally, same as the
   * lunge attack's burst), grows `wariness` so the next attempt's signature
   * is tighter, and starts a short "too spooked to approach" cooldown
   * during which TamingController won't offer it as a candidate again. */
  flee(awayFromPosition: THREE.Vector3): void {
    this.wariness = Math.min(this.wariness + 1, MAX_WARINESS);
    this.spookedUntil = performance.now() + SPOOK_COOLDOWN_MS;
    const dir = this.object3D.position.clone().sub(awayFromPosition).setY(0);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();
    this.rigidBody?.setLinvel({ x: dir.x * FLEE_SPEED, y: 0, z: dir.z * FLEE_SPEED }, true);
    this.faceDirection(dir);
  }

  /** Called by TamingController for the mid-hold "the dragon reacts - it
   * tests the bond, moves, flares" beat (§4 step 4). Purely cosmetic: plays
   * the Roar clip once, sped to fit, without disturbing the AI/phase state
   * driving it (see updateAnimationMixer's 'bonding' branch below). */
  playBondFlare(durationSeconds = 0.9): void {
    this.bondFlareUntil = performance.now() + durationSeconds * 1000;
  }

  /** Advances the animation mixer and picks the right clip for the current
   * state. Called every frame by GameManager for every dragon, regardless
   * of feral/tamed/ridden state, so the mixer never stalls. No-ops until
   * the real model (and its actions) has finished loading. */
  updateAnimationMixer(dt: number): void {
    const config = this.modelConfig;

    if (this.riddenBy) {
      this.playAnimation(this.isMovingExternally ? config.walkClip : config.idleClip);
    } else if (this.ai.state === 'bonding' && config.windupClip && performance.now() < this.bondFlareUntil) {
      this.playAnimation(config.windupClip, 0.9);
    } else if (this.ai.state !== 'feral') {
      if (config.hitClip && performance.now() < this.hitFlareUntil) this.playAnimation(config.hitClip, HIT_FLARE_DURATION_MS / 1000);
      else this.playAnimation(config.idleClip);
    } else {
      const isHitFlaring = config.hitClip && performance.now() < this.hitFlareUntil;
      switch (this.phase) {
        case 'idle':
        case 'recovery':
          this.playAnimation(isHitFlaring ? config.hitClip! : config.idleClip);
          break;
        case 'chase':
          this.playAnimation(isHitFlaring ? config.hitClip! : config.walkClip);
          break;
        case 'windup':
          if (config.windupClip) this.playAnimation(config.windupClip, this.currentAttack?.windup);
          else this.playAnimation(config.idleClip);
          break;
        case 'active':
          this.playAnimation(config.activeClip, this.currentAttack?.active);
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

    const oneShot = this.modelConfig.oneShotClips.includes(name);
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
    if (this.modelConfig.hitClip) this.hitFlareUntil = performance.now() + HIT_FLARE_DURATION_MS;
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
    const config = this.modelConfig;
    const loaded = await assetLoader.loadModel(config.modelName, () => ({ scene: buildDragonPlaceholder().group, animations: [] }));
    if (loaded.animations.length === 0) return;
    this.object3D.remove(this.visual);
    this.visual = loaded.scene;
    // Each archetype's native geometry is a different size (see
    // DragonModelConfig.visualScale comments); this only affects the
    // rendered mesh - the Rapier collider and the CombatSystem hurtbox
    // radius above are untouched, so hit detection isn't affected.
    this.visual.scale.setScalar(config.visualScale);
    this.eyeMaterials = []; // real assets telegraph via their own animations, not the placeholder's eye-flash hack
    if (this.fractured) applyFracturedTint(this.visual);
    this.object3D.add(this.visual);

    this.mixer = new THREE.AnimationMixer(this.visual);
    const clipNames = new Set([config.idleClip, config.walkClip, config.activeClip, config.windupClip, config.hitClip].filter((n): n is string => !!n));
    for (const name of clipNames) {
      const clip = THREE.AnimationClip.findByName(loaded.animations, name);
      if (clip) this.animActions.set(name, this.mixer.clipAction(clip));
      else console.warn(`[Dragon] animation clip "${name}" not found in ${config.modelName}.glb`);
    }
  }
}

/** The "dulled, visibly lesser" palette a fractured crystal (§3) leaves on
 * its dragon - a real, permanent scar rather than just a stat penalty. No
 * mask-texture system exists yet (see docs/design/crystal-and-taming-systems.md
 * §10), so this approximates it with a flat desaturating multiply over
 * every unique material found on the mesh (works for both the placeholder
 * and the real glTF; dedupes shared materials, e.g. buildDragonPlaceholder's
 * two wing meshes share one material instance, so each is only darkened once). */
function applyFracturedTint(visual: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  visual.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (seen.has(mat) || !(mat instanceof THREE.MeshStandardMaterial)) continue;
      seen.add(mat);
      mat.color.multiplyScalar(0.55);
    }
  });
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
