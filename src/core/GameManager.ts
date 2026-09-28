import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';
import { CameraRig } from './CameraRig';
import { AudioManager } from './AudioManager';
import { SaveManager, createDefaultSave, createDefaultSettings, type SaveData, type SavedSettings } from './SaveManager';
import { eventBus } from './EventBus';
import { Knight } from '../entities/Knight';
import { Dragon } from '../entities/Dragon';
import { AggroManager } from '../entities/AggroManager';
import { combatSystem } from '../combat/CombatSystem';
import { TamingController, INTERACT_RANGE } from '../taming/TamingController';
import { CrystalController, CRYSTAL_INTERACT_RANGE, type CrystalOutcome } from '../taming/CrystalController';
import { playerStable } from '../taming/PlayerStable';
import { progressionManager } from '../progression/ProgressionManager';
import { rollGear } from '../progression/Gear';
import { zoneLoader, startingZone } from '../world/ZoneLoader';
import { buildSky } from '../world/Sky';
import { Crystal } from '../world/Crystal';
import { QuestLog, defaultQuests } from '../world/QuestLog';
import { DialogueSystem } from '../world/DialogueSystem';
import { TouchControls } from '../ui/TouchControls';
import { HUD } from '../ui/HUD';
import { WorldHealthBars } from '../ui/WorldHealthBars';
import { FloatingText } from '../ui/FloatingText';
import { DeathScreen } from '../ui/DeathScreen';
import { DamageVignette } from '../ui/DamageVignette';
import { StartScreen } from '../ui/StartScreen';
import { PauseMenu } from '../ui/PauseMenu';
import { PilotCompleteScreen } from '../ui/PilotCompleteScreen';
import { sfx } from './SfxManager';
import { InventoryScreen } from '../ui/InventoryScreen';
import { QuestTracker } from '../ui/QuestTracker';
import { DialogueBox } from '../ui/DialogueBox';
import type { MinimapEntity } from '../ui/HUD';
import type { DragonAIState } from '../taming/DragonAI';

const INTRO_DIALOGUE = [
  { speaker: 'Wind over Ember Vale', text: 'The dragons here have not seen a knight in a generation.' },
  { speaker: 'Old Instinct', text: 'Weaken one, and it may yet be reasoned with - rather than slain.' },
  { speaker: 'Old Instinct', text: 'Get close. Tap Mount once it stops fighting back.' },
  { speaker: 'Old Instinct', text: 'There is also a crystal near here, sealed and waiting. Hold it. Do not rush it.' },
];

const AUTOSAVE_INTERVAL_SECONDS = 20;
const MAX_DT = 0.05; // clamp huge frame gaps (tab backgrounded, etc.)
const RESPAWN_DELAY_SECONDS = 2.5;
const PACK_ALERT_RADIUS = 7;
const MOUNTED_MOVE_SPEED = 6.5;
/** How long a freshly tamed dragon needs before it'll let you ride it, unless Bond's "Saddle-Ready" is unlocked. */
const MOUNT_SETTLE_DELAY_MS = 6000;
/** A tamed dragon's loyalty (see DragonLeveling.originStatMultiplier) grows slowly while ridden - "grows with continued investment" per docs/design/crystal-and-taming-systems.md §5. */
const LOYALTY_GAIN_PER_SECOND_RIDDEN = 0.08;

export class GameManager {
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private cameraRig!: CameraRig;
  private world!: RAPIER.World;
  private clock = new THREE.Clock();

  private input = new InputManager();
  private saveManager = new SaveManager();
  private audioManager = new AudioManager(['theme-1', 'theme-2', 'theme-6']);
  private tamingController = new TamingController();
  private crystalController = new CrystalController();
  private aggroManager = new AggroManager();
  private questLog = new QuestLog(defaultQuests);
  private dialogueSystem = new DialogueSystem();

  private knight!: Knight;
  private dragons: Dragon[] = [];
  private crystals: Crystal[] = [];
  private collidables: THREE.Object3D[] = [];

  private touchControls!: TouchControls;
  private hud!: HUD;
  private worldHealthBars!: WorldHealthBars;
  private floatingText!: FloatingText;
  private deathScreen!: DeathScreen;
  private damageVignette!: DamageVignette;
  private inventoryScreen!: InventoryScreen;
  private questTracker!: QuestTracker;
  private dialogueBox!: DialogueBox;
  private pauseMenu!: PauseMenu;
  private pilotCompleteScreen!: PilotCompleteScreen;
  private pilotCompleteShown = false;

  private autosaveTimer = 0;
  private respawnTimer = 0;
  private openedCrystalIds = new Set<string>();
  private settings: SavedSettings = createDefaultSettings();

  async init(container: HTMLElement): Promise<void> {
    await RAPIER.init();

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.setupRenderer(container);
    this.setupScene();

    zoneLoader.load(startingZone, this.scene, this.world);
    this.collidables = this.scene.children.filter((o) => o.name === 'collidable-prop');

    const save = (await this.saveManager.load()) ?? createDefaultSave();
    progressionManager.loadFromSave(save.progression);
    playerStable.load(save.stable);
    this.openedCrystalIds = new Set(save.openedCrystalIds);

    this.settings = save.settings;
    this.audioManager.setVolume(this.settings.musicVolume);
    sfx.volume = this.settings.sfxVolume;
    this.cameraRig.sensitivityMultiplier = this.settings.cameraSensitivity;
    this.cameraRig.invertY = this.settings.invertY;

    const spawn = new THREE.Vector3(...save.player.position);
    this.knight = new Knight(this.world, spawn);
    // maxHealth/maxStamina are already authoritative from progression (set by
    // the constructor's applyProgressionModifiers()) - only clamp the saved
    // current values against them, don't overwrite the computed maxes.
    this.knight.health = Math.min(save.player.health, this.knight.maxHealth);
    this.knight.stamina.current = Math.min(save.player.stamina, this.knight.stamina.max);
    this.knight.facingYaw = save.player.yaw;
    this.scene.add(this.knight.object3D);

    for (const spawnDef of startingZone.dragonSpawns) {
      const dragon = new Dragon(this.world, new THREE.Vector3(...spawnDef.position), spawnDef.displayName, spawnDef.archetype);
      this.dragons.push(dragon);
      this.scene.add(dragon.object3D);
      this.scene.add(dragon.telegraph.mesh);
    }

    // Crystals are "finite and hand-placed" (design doc §3) - one already
    // opened this save doesn't respawn as a free reroll, so it's simply not
    // spawned at all rather than shown inert.
    for (const crystalDef of startingZone.crystalSpawns) {
      if (this.openedCrystalIds.has(crystalDef.id)) continue;
      const crystal = new Crystal(crystalDef);
      this.crystals.push(crystal);
      this.scene.add(crystal.object3D);
    }

    this.input.attach(this.renderer.domElement);
    this.touchControls = new TouchControls(this.input);
    this.hud = new HUD();
    this.worldHealthBars = new WorldHealthBars();
    this.floatingText = new FloatingText();
    this.deathScreen = new DeathScreen();
    this.damageVignette = new DamageVignette();
    this.inventoryScreen = new InventoryScreen();
    this.questTracker = new QuestTracker(this.questLog);
    this.dialogueBox = new DialogueBox(this.dialogueSystem);
    this.pauseMenu = new PauseMenu(this.settings, {
      onMusicVolume: (v) => {
        this.settings.musicVolume = v;
        this.audioManager.setVolume(v);
      },
      onSfxVolume: (v) => {
        this.settings.sfxVolume = v;
        sfx.volume = v;
      },
      onSensitivity: (v) => {
        this.settings.cameraSensitivity = v;
        this.cameraRig.sensitivityMultiplier = v;
      },
      onInvertY: (v) => {
        this.settings.invertY = v;
        this.cameraRig.invertY = v;
      },
      onOpenInventory: () => this.inventoryScreen.toggle(),
      onRestart: () => this.restartAdventure(),
      onClose: () => void this.save(),
    });
    this.pilotCompleteScreen = new PilotCompleteScreen(() => {});
    this.buildMenuButton();
    this.buildAudioToggle();

    this.wireEvents();
    eventBus.emit('save:loaded', {});

    window.addEventListener('resize', this.onResize);

    this.renderer.setAnimationLoop(this.tick);

    // Intro dialogue waits behind the title card rather than firing the
    // instant the canvas is ready - the tap to begin also doubles as the
    // real user gesture AudioManager needs to unlock autoplay. The card
    // itself waits on every entity's real-model load (capped - see
    // StartScreen) so gameplay doesn't start on visible placeholder meshes.
    const assetsReady = Promise.all([this.knight.modelReady, ...this.dragons.map((d) => d.modelReady)]).then(
      () => undefined,
    );
    new StartScreen(assetsReady, () => this.dialogueSystem.start(INTRO_DIALOGUE));
  }

  private setupRenderer(container: HTMLElement): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x0b0f1a);
    this.scene.fog = new THREE.Fog(0x0b0f1a, 22, 58);
    buildSky(this.scene);

    const ambient = new THREE.AmbientLight(0x9fb4d8, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe3b3, 1.15);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowCam = sun.shadow.camera;
    shadowCam.left = -20;
    shadowCam.right = 20;
    shadowCam.top = 20;
    shadowCam.bottom = -20;
    shadowCam.near = 1;
    shadowCam.far = 50;
    this.scene.add(sun);
  }

  private buildMenuButton(): void {
    // Deliberately outside TouchControls: the five combat context buttons
    // (attack/dodge/block/ability wheel/mount) are the only things that
    // live in the thumb cluster. Menu chrome (pause/settings/inventory) is
    // not combat input, so it gets its own small corner button, opening
    // PauseMenu - Inventory is reachable one tap deeper from there (still
    // also bound to 'I' directly, as a secondary desktop-testing path).
    const btn = document.createElement('button');
    btn.textContent = 'Menu';
    btn.style.cssText = `
      position: fixed;
      /* Below the health/stamina bars (top-left, ~14px + ~25px tall) rather
         than beside them - on a narrow portrait screen the bars (up to
         220px wide) and a horizontally-centered button both competing for
         the top row's width collide; stacking vertically clears that at
         any screen width instead of fighting over horizontal space. */
      top: max(46px, calc(env(safe-area-inset-top, 0px) + 46px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 25;
      background: rgba(11, 15, 26, 0.6);
      color: #f2e9d8;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11px;
      font-family: system-ui, sans-serif;
    `;
    btn.addEventListener('click', () => {
      sfx.play('ui-tap');
      this.pauseMenu.toggle();
    });
    document.body.appendChild(btn);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI') this.inventoryScreen.toggle();
    });
  }

  private buildAudioToggle(): void {
    // Same left column as the health/stamina bars, same row as Menu (see
    // that method's comment on why top-row elements stack vertically
    // instead of sharing a row on a narrow portrait screen) - left-aligned
    // instead of centered so it doesn't collide with Menu there either.
    const btn = document.createElement('button');
    btn.textContent = 'Music: On';
    btn.style.cssText = `
      position: fixed;
      top: max(46px, calc(env(safe-area-inset-top, 0px) + 46px));
      left: max(14px, env(safe-area-inset-left, 0px));
      z-index: 25;
      background: rgba(11, 15, 26, 0.6);
      color: #f2e9d8;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11px;
      font-family: system-ui, sans-serif;
    `;
    btn.addEventListener('click', () => {
      const muted = this.audioManager.toggleMute();
      btn.textContent = muted ? 'Music: Off' : 'Music: On';
    });
    document.body.appendChild(btn);

    // Browsers refuse audio.play() before a real user gesture - the first
    // pointerdown anywhere (whatever it's actually for - joystick, a
    // button, the intro dialogue) unlocks it. Registered on the capture
    // phase and deliberately never calls preventDefault/stopPropagation
    // itself: several UI handlers (DialogueBox, TouchControls' buttons)
    // call stopPropagation() on their own pointerdown, which would
    // otherwise stop this from ever seeing the event if it only listened
    // on the (default) bubble phase.
    window.addEventListener('pointerdown', () => this.audioManager.start(), { once: true, capture: true });
  }

  private wireEvents(): void {
    eventBus.on('dragon:died', ({ dragonId }) => {
      const dragon = this.dragons.find((d) => d.id === dragonId);
      if (!dragon) return;
      this.scene.remove(dragon.object3D);
      this.scene.remove(dragon.telegraph.mesh);
      if (dragon.rigidBody) this.world.removeRigidBody(dragon.rigidBody);
      combatSystem.unregisterHurtbox(dragon.id);
      this.dragons = this.dragons.filter((d) => d.id !== dragonId);
    });

    eventBus.on('player:died', () => {
      this.respawnTimer = RESPAWN_DELAY_SECONDS;
    });

    eventBus.on('quest:updated', () => {
      if (this.pilotCompleteShown) return;
      const allComplete = this.questLog.list().every((q) => q.status === 'complete');
      if (!allComplete) return;
      this.pilotCompleteShown = true;
      this.pilotCompleteScreen.show();
    });

    // Combat "juice": floating damage numbers (the numeric half of the
    // dragon-HP-bar fix - a bar shows the ratio, a number confirms exactly
    // how much a hit did) plus a small camera-shake punch, bigger for the
    // player taking a hit than for one they land.
    eventBus.on('dragon:damaged', ({ dragonId, amount }) => {
      const dragon = this.dragons.find((d) => d.id === dragonId);
      if (!dragon) return;
      const pos = dragon.object3D.position.clone().add(new THREE.Vector3(0, dragon.barAnchorHeight, 0));
      this.floatingText.spawn(pos, `-${Math.round(amount)}`, 'damage');
      this.cameraRig.addShake(0.12);
      sfx.play('hit-dragon');
    });

    eventBus.on('player:damaged', ({ amount }) => {
      const pos = this.knight.object3D.position.clone().add(new THREE.Vector3(0, 1.9, 0));
      this.floatingText.spawn(pos, `-${Math.round(amount)}`, 'player-damage');
      this.cameraRig.addShake(0.4);
      this.damageVignette.flash();
      sfx.play('hit-player');
    });

    eventBus.on('taming:success', ({ dragonId }) => {
      this.questLog.updateStatus('tame-first-dragon', 'complete');
      progressionManager.grantSkillPoints(1);
      progressionManager.addGear(rollGear('tamers-gloves', 'uncommon'));
      void this.save();
      sfx.play('success');
      console.info(`[Dragonbound] Tamed dragon ${dragonId}! +1 skill point, Tamer's Gloves added.`);
    });

    eventBus.on('crystal:evaporated', ({ dragonName }) => {
      this.questLog.updateStatus('open-first-crystal', 'complete');
      sfx.play('success');
      console.info(`[Dragonbound] Crystal evaporated - ${dragonName} joins the stable at full strength.`);
    });

    eventBus.on('crystal:fractured', ({ dragonName }) => {
      this.questLog.updateStatus('open-first-crystal', 'complete');
      sfx.play('success', { rate: 0.85, volume: 0.8 });
      console.info(`[Dragonbound] Crystal fractured - ${dragonName} joins the stable, diminished.`);
    });
  }

  /** A crystal finished its hold (evaporated) or was released early
   * (fractured) - either way it still yields a dragon (design doc §3),
   * spawned live so it can actually be ridden through the existing mount
   * flow rather than just a stat entry. */
  private resolveCrystal(outcome: CrystalOutcome): void {
    this.openedCrystalIds.add(outcome.crystalId);

    const spawnPos = outcome.position.clone().add(new THREE.Vector3(1.4, 0, 0.4));
    const dragon = new Dragon(this.world, spawnPos, outcome.dragonName, outcome.archetype, outcome.fractured);
    dragon.ai.transition('tamed');
    dragon.bondMeter.value = 100; // "Bond: Immediate, unconditional" - design doc §5, unlike a tamed dragon's earned bond
    dragon.tamedAt = Date.now();
    this.dragons.push(dragon);
    this.scene.add(dragon.object3D);
    this.scene.add(dragon.telegraph.mesh);

    playerStable.add({
      id: dragon.id,
      name: dragon.displayName,
      archetype: dragon.archetype,
      level: 1,
      xp: 0,
      tamedAt: Date.now(),
      origin: outcome.fractured ? 'crystalborn-fractured' : 'crystalborn-whole',
      loyalty: 0, // not this record's axis - see DragonLeveling.originStatMultiplier
    });

    void this.save();
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), MAX_DT);

    this.input.update(dt);
    this.handleMountToggle();

    if (!this.knight.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.knight.revive(new THREE.Vector3(...startingZone.playerSpawn));
      }
    } else {
      this.knight.handleInput(dt, this.input, this.cameraRig.yaw);
    }
    this.knight.updateAnimationMixer(dt);

    const mountedDragon = this.mountedDragon();
    if (mountedDragon) this.updateMountedDragon(dt, mountedDragon);

    this.aggroManager.update(this.dragons, this.knight.object3D.position, PACK_ALERT_RADIUS);
    for (const dragon of this.dragons) {
      if (dragon === mountedDragon) continue; // driven directly above, not by its own AI
      dragon.updateAI(dt, this.knight.object3D.position, this.aggroManager.isAggro(dragon.id));
    }
    for (const dragon of this.dragons) dragon.updateAnimationMixer(dt);
    this.tamingController.update(dt, this.input, this.knight, this.dragons);

    for (const crystal of this.crystals) crystal.update(dt);
    const crystalOutcome = this.crystalController.update(dt, this.input, this.knight, this.crystals);
    if (crystalOutcome) this.resolveCrystal(crystalOutcome);
    this.crystals = this.crystals.filter((c) => {
      if (!c.outroFinished) return true;
      this.scene.remove(c.object3D);
      return false;
    });

    this.world.step();

    this.knight.syncObjectFromBody();
    for (const dragon of this.dragons) dragon.syncObjectFromBody();

    combatSystem.update(dt);

    if (this.input.wasActionPressed('lockOnToggle')) {
      const targets = this.dragons.filter((d) => d.alive).map((d) => d.object3D);
      this.cameraRig.toggleLockOn(targets);
    }
    const lookDelta = this.input.consumeLookDelta();
    const followPosition = mountedDragon ? mountedDragon.object3D.position : this.knight.object3D.position;
    this.cameraRig.update(dt, followPosition, lookDelta, this.collidables);

    this.renderer.render(this.scene, this.cameraRig.camera);
    this.worldHealthBars.update(this.dragons, this.cameraRig.camera);
    this.floatingText.update(dt, this.cameraRig.camera);
    this.deathScreen.update(this.knight.alive, this.respawnTimer);
    this.updateHud();

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL_SECONDS) {
      this.autosaveTimer = 0;
      void this.save();
    }
  };

  private mountedDragon(): Dragon | undefined {
    if (!this.knight.mountedDragonId) return undefined;
    return this.dragons.find((d) => d.id === this.knight.mountedDragonId);
  }

  /** Claims the mountToggle press for mount/dismount when applicable, before
   * TamingController gets a chance to treat it as "start taming". */
  private handleMountToggle(): void {
    if (!this.input.wasActionPressed('mountToggle')) return;

    if (this.knight.isMounted) {
      if (!this.input.consumeAction('mountToggle')) return;
      this.dismountKnight();
      return;
    }

    if (this.tamingController.isActive) return; // mid-minigame, let TamingController own the button

    const candidate = this.dragons.find(
      (d) =>
        d.ai.state === 'tamed' &&
        !d.riddenBy &&
        d.object3D.position.distanceTo(this.knight.object3D.position) <= INTERACT_RANGE,
    );
    if (!candidate) return; // no tamed dragon nearby - leave the press for TamingController (a 'wary' one, maybe)

    const settled = this.knight.abilities.has('instant-mount') || Date.now() - candidate.tamedAt >= MOUNT_SETTLE_DELAY_MS;
    if (!settled) return; // still settling; press falls through harmlessly

    if (!this.input.consumeAction('mountToggle')) return;
    this.knight.mount(candidate.id);
    candidate.riddenBy = this.knight.id;
    this.cameraRig.mounted = true;
  }

  private dismountKnight(): void {
    const dragon = this.mountedDragon();
    this.knight.dismount();
    this.cameraRig.mounted = false;
    if (!dragon) return;
    dragon.riddenBy = null;
    const landing = dragon.object3D.position.clone().add(new THREE.Vector3(1.6, 0, 0));
    this.knight.rigidBody?.setTranslation({ x: landing.x, y: landing.y, z: landing.z }, true);
  }

  /** Drives a ridden dragon straight from input, the same camera-relative
   * way Knight.handleInput() drives the player (see that method's identical
   * moveDir math) - Dragon.updateAI() is skipped for it (see riddenBy). */
  private updateMountedDragon(dt: number, dragon: Dragon): void {
    const move = this.input.getMoveVector();
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRig.yaw);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat);
    const moveDir = new THREE.Vector3().addScaledVector(right, move.x).addScaledVector(forward, -move.y);

    if (moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
      const yaw = Math.atan2(-moveDir.x, -moveDir.z);
      dragon.applyExternalMovement(moveDir.multiplyScalar(MOUNTED_MOVE_SPEED), yaw);
      // "Grows with continued investment" (design doc §5) - riding a tamed
      // dragon slowly builds its loyalty. No-ops for crystalborn records
      // (see PlayerStable.adjustLoyalty), which don't have this axis.
      playerStable.adjustLoyalty(dragon.id, dt * LOYALTY_GAIN_PER_SECOND_RIDDEN);
    } else {
      dragon.applyExternalMovement(new THREE.Vector3(0, 0, 0), dragon.facingYaw);
    }
  }

  private updateHud(): void {
    let prompt: string | null = null;
    let bond: number | null = null;
    let resonance: number | null = null;

    if (this.crystalController.isActive) {
      resonance = this.crystalController.progress * 100;
      prompt = 'Hold steady... do not let go.';
    } else if (this.tamingController.isActive) {
      bond = this.tamingController.currentDragon?.bondMeter.value ?? 0;
      switch (this.tamingController.currentMinigame?.phase) {
        case 'reading':
          prompt = 'Reading its resonance...';
          break;
        case 'matching':
          prompt = 'Tap Attack on the beat!';
          break;
        case 'holding':
          prompt = 'Hold Mount to steady the bond!';
          break;
      }
    } else if (this.knight.isMounted) {
      prompt = 'Tap Mount to dismount';
    } else {
      const nearWary = this.dragons.find(
        (d) => d.ai.state === 'wary' && !d.isSpooked && d.object3D.position.distanceTo(this.knight.object3D.position) <= INTERACT_RANGE,
      );
      const nearSpooked =
        !nearWary &&
        this.dragons.find(
          (d) => d.ai.state === 'wary' && d.isSpooked && d.object3D.position.distanceTo(this.knight.object3D.position) <= INTERACT_RANGE,
        );
      const nearTamed = this.dragons.find(
        (d) =>
          d.ai.state === 'tamed' &&
          !d.riddenBy &&
          d.object3D.position.distanceTo(this.knight.object3D.position) <= INTERACT_RANGE,
      );
      const nearCrystal = this.crystals.find(
        (c) => !c.opened && c.object3D.position.distanceTo(this.knight.object3D.position) <= CRYSTAL_INTERACT_RANGE,
      );
      if (nearCrystal) {
        prompt = 'Hold Mount to attune...';
      } else if (nearWary) {
        prompt = 'Tap Mount to begin taming';
      } else if (nearSpooked) {
        prompt = "It's too spooked to approach yet.";
      } else if (nearTamed) {
        const settled = this.knight.abilities.has('instant-mount') || Date.now() - nearTamed.tamedAt >= MOUNT_SETTLE_DELAY_MS;
        prompt = settled ? 'Tap Mount to ride' : 'Dragon is still settling...';
      }
    }

    this.hud.update({
      health: this.knight.health,
      maxHealth: this.knight.maxHealth,
      stamina: this.knight.stamina.current,
      maxStamina: this.knight.stamina.max,
      bond,
      resonance,
      prompt,
      riding: this.knight.isMounted ? (this.mountedDragon()?.displayName ?? null) : null,
      minimapEntities: [
        { x: this.knight.object3D.position.x, z: this.knight.object3D.position.z, kind: 'player' },
        ...this.dragons
          .filter((d) => d.alive)
          .map((d) => ({
            x: d.object3D.position.x,
            z: d.object3D.position.z,
            kind: minimapKindFor(d.ai.state),
          })),
      ],
    });
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraRig.setAspect(window.innerWidth / window.innerHeight);
  };

  private buildSaveData(): SaveData {
    return {
      version: 1,
      savedAt: Date.now(),
      player: {
        position: [this.knight.object3D.position.x, this.knight.object3D.position.y, this.knight.object3D.position.z],
        yaw: this.knight.facingYaw,
        health: this.knight.health,
        maxHealth: this.knight.maxHealth,
        stamina: this.knight.stamina.current,
        maxStamina: this.knight.stamina.max,
        level: 1,
        xp: 0,
      },
      stable: playerStable.toSaveData(),
      openedCrystalIds: Array.from(this.openedCrystalIds),
      progression: progressionManager.toSaveData(),
      settings: this.settings,
    };
  }

  async save(): Promise<void> {
    await this.saveManager.save(this.buildSaveData());
    eventBus.emit('save:saved', {});
  }

  /** PauseMenu's "Restart Adventure" - erases the save and reloads fresh,
   * a way to reset without opening devtools (useful for testers, not just
   * a real "new game" flow yet - there's only one save slot). */
  private async restartAdventure(): Promise<void> {
    await this.saveManager.clear();
    window.location.reload();
  }

  /** Read-only snapshot for the dev console / smoke tests (see main.ts, DEV only). */
  get debugState() {
    return {
      knight: this.knight,
      dragons: this.dragons,
      crystals: this.crystals,
      tamingActive: this.tamingController.isActive,
      crystalActive: this.crystalController.isActive,
    };
  }
}

function minimapKindFor(state: DragonAIState): MinimapEntity['kind'] {
  if (state === 'tamed') return 'dragon-tamed';
  if (state === 'feral') return 'dragon-feral';
  return 'dragon-wary';
}
