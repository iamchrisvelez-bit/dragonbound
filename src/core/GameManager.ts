import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from './InputManager';
import { CameraRig } from './CameraRig';
import { SaveManager, createDefaultSave, type SaveData } from './SaveManager';
import { eventBus } from './EventBus';
import { Knight } from '../entities/Knight';
import { Dragon } from '../entities/Dragon';
import { combatSystem } from '../combat/CombatSystem';
import { TamingController } from '../taming/TamingController';
import { playerStable } from '../taming/PlayerStable';
import { progressionManager } from '../progression/ProgressionManager';
import { rollGear } from '../progression/Gear';
import { zoneLoader, startingZone } from '../world/ZoneLoader';
import { QuestLog, defaultQuests } from '../world/QuestLog';
import { TouchControls } from '../ui/TouchControls';
import { HUD } from '../ui/HUD';
import { InventoryScreen } from '../ui/InventoryScreen';
import type { MinimapEntity } from '../ui/HUD';
import type { DragonAIState } from '../taming/DragonAI';

const AUTOSAVE_INTERVAL_SECONDS = 20;
const MAX_DT = 0.05; // clamp huge frame gaps (tab backgrounded, etc.)
const RESPAWN_DELAY_SECONDS = 2.5;

export class GameManager {
  private scene = new THREE.Scene();
  private renderer!: THREE.WebGLRenderer;
  private cameraRig!: CameraRig;
  private world!: RAPIER.World;
  private clock = new THREE.Clock();

  private input = new InputManager();
  private saveManager = new SaveManager();
  private tamingController = new TamingController();
  private questLog = new QuestLog(defaultQuests);

  private knight!: Knight;
  private dragons: Dragon[] = [];
  private collidables: THREE.Object3D[] = [];

  private touchControls!: TouchControls;
  private hud!: HUD;
  private inventoryScreen!: InventoryScreen;

  private autosaveTimer = 0;
  private respawnTimer = 0;

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
    }

    this.input.attach(this.renderer.domElement);
    this.touchControls = new TouchControls(this.input);
    this.hud = new HUD();
    this.inventoryScreen = new InventoryScreen();
    this.buildMenuButton();

    this.wireEvents();
    eventBus.emit('save:loaded', {});

    window.addEventListener('resize', this.onResize);

    this.renderer.setAnimationLoop(this.tick);
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
    // live in the thumb cluster. Inventory is menu chrome, not combat
    // input, so it gets its own small corner button (and the 'I' key).
    const btn = document.createElement('button');
    btn.textContent = 'Menu';
    btn.style.cssText = `
      position: fixed;
      top: max(14px, env(safe-area-inset-top, 0px));
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
    btn.addEventListener('click', () => this.inventoryScreen.toggle());
    document.body.appendChild(btn);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI') this.inventoryScreen.toggle();
    });
  }

  private wireEvents(): void {
    eventBus.on('dragon:died', ({ dragonId }) => {
      const dragon = this.dragons.find((d) => d.id === dragonId);
      if (!dragon) return;
      this.scene.remove(dragon.object3D);
      if (dragon.rigidBody) this.world.removeRigidBody(dragon.rigidBody);
      combatSystem.unregisterHurtbox(dragon.id);
      this.dragons = this.dragons.filter((d) => d.id !== dragonId);
    });

    eventBus.on('player:died', () => {
      this.respawnTimer = RESPAWN_DELAY_SECONDS;
    });

    eventBus.on('taming:success', ({ dragonId }) => {
      this.questLog.updateStatus('tame-first-dragon', 'complete');
      progressionManager.grantSkillPoints(1);
      progressionManager.addGear(rollGear('tamers-gloves', 'uncommon'));
      void this.save();
      console.info(`[Dragonbound] Tamed dragon ${dragonId}! +1 skill point, Tamer's Gloves added.`);
    });
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), MAX_DT);

    this.input.update(dt);

    if (!this.knight.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.knight.revive(new THREE.Vector3(...startingZone.playerSpawn));
      }
    } else {
      this.knight.handleInput(dt, this.input, this.cameraRig.yaw);
    }

    for (const dragon of this.dragons) dragon.updateAI(dt, this.knight.object3D.position);
    this.tamingController.update(dt, this.input, this.knight, this.dragons);

    this.world.step();

    this.knight.syncObjectFromBody();
    for (const dragon of this.dragons) dragon.syncObjectFromBody();

    combatSystem.update(dt);

    if (this.input.wasActionPressed('lockOnToggle')) {
      const targets = this.dragons.filter((d) => d.alive).map((d) => d.object3D);
      this.cameraRig.toggleLockOn(targets);
    }
    const lookDelta = this.input.consumeLookDelta();
    this.cameraRig.update(dt, this.knight.object3D.position, lookDelta, this.collidables);

    this.renderer.render(this.scene, this.cameraRig.camera);
    this.updateHud();

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL_SECONDS) {
      this.autosaveTimer = 0;
      void this.save();
    }
  };

  private updateHud(): void {
    let prompt: string | null = null;
    let bond: number | null = null;

    if (this.tamingController.isActive) {
      prompt = 'Tap Attack on the beat to bond!';
      bond = this.tamingController.currentDragon?.bondMeter.value ?? 0;
    } else {
      const nearWary = this.dragons.find(
        (d) => d.ai.state === 'wary' && d.object3D.position.distanceTo(this.knight.object3D.position) <= 4,
      );
      if (nearWary) prompt = 'Tap Mount to begin taming';
    }

    this.hud.update({
      health: this.knight.health,
      maxHealth: this.knight.maxHealth,
      stamina: this.knight.stamina.current,
      maxStamina: this.knight.stamina.max,
      bond,
      prompt,
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
      progression: progressionManager.toSaveData(),
    };
  }

  async save(): Promise<void> {
    await this.saveManager.save(this.buildSaveData());
    eventBus.emit('save:saved', {});
  }

  /** Read-only snapshot for the dev console / smoke tests (see main.ts, DEV only). */
  get debugState() {
    return {
      knight: this.knight,
      dragons: this.dragons,
      tamingActive: this.tamingController.isActive,
    };
  }
}

function minimapKindFor(state: DragonAIState): MinimapEntity['kind'] {
  if (state === 'tamed') return 'dragon-tamed';
  if (state === 'feral') return 'dragon-feral';
  return 'dragon-wary';
}
