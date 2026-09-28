import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CrystalDefinition } from './Crystal';

export interface DragonSpawnDefinition {
  position: [number, number, number];
  displayName: string;
  archetype: string;
}

export interface ZoneDefinition {
  id: string;
  name: string;
  groundSize: number;
  playerSpawn: [number, number, number];
  dragonSpawns: DragonSpawnDefinition[];
  /** Hand-placed starter crystals (System A) - see docs/design/crystal-and-taming-systems.md §3's "finite and hand-placed" distribution rule. */
  crystalSpawns: CrystalDefinition[];
  /** Simple static rock props, mostly useful for exercising camera collision avoidance. */
  props: { position: [number, number, number]; scale: number }[];
}

export const startingZone: ZoneDefinition = {
  id: 'ember-vale',
  name: 'Ember Vale',
  groundSize: 60,
  playerSpawn: [0, 1, 8],
  dragonSpawns: [
    { position: [0, 1, -6], displayName: 'Feral Wyrmling', archetype: 'ember-wyrm' },
    // A close pair, far enough from the solo wyrmling above that aggroing
    // one doesn't also pull it in - demonstrates AggroManager's pack-alert
    // radius pulling packmates into a fight without needing to design a
    // whole multi-zone encounter. A distinct archetype (see Dragon.ts's
    // DRAGON_MODEL_CONFIGS) - a real, second, verified-CC0 rigged asset
    // (see CREDITS.md), not just a recolor of the solo wyrmling.
    { position: [11, 1, -10], displayName: 'Feral Drake', archetype: 'quaternius-drake' },
    { position: [13.5, 1, -11.5], displayName: 'Feral Drake', archetype: 'quaternius-drake' },
  ],
  crystalSpawns: [
    // Close to spawn, in plain sight - the onboarding crystal (§3: "present
    // three, let the player open one"; with a single archetype available
    // this slice ships two rather than three, per the design doc's own
    // implementation-notes scope-down).
    { id: 'crystal-embercradle', position: [-3, 1, 3], dragonName: 'Embercradle Kin', archetype: 'ember-wyrm' },
    // Farther out, past the pack - a visible long-term goal the player
    // already knows the location of, per the same onboarding note. Kept at
    // least INTERACT_RANGE + CRYSTAL_INTERACT_RANGE (7 units) from every
    // dragon spawn so a weakened, wary pack wyrmling can never overlap a
    // held mountToggle press with this crystal's own attune range.
    { id: 'crystal-farwatch', position: [21, 1, -21], dragonName: 'Farwatch Kin', archetype: 'ember-wyrm' },
  ],
  props: [
    { position: [-5, 0, 1], scale: 1.4 },
    { position: [6, 0, -2], scale: 1 },
    { position: [3, 0, 5], scale: 0.8 },
  ],
};

/** Builds ground + static props for a zone into an existing scene/world. */
export class ZoneLoader {
  load(zone: ZoneDefinition, scene: THREE.Scene, world: RAPIER.World): void {
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2c3b2e, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(zone.groundSize, zone.groundSize), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);

    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(zone.groundSize / 2, 0.1, zone.groundSize / 2).setTranslation(0, -0.1, 0),
      groundBody,
    );

    for (const prop of zone.props) {
      const size = 1.2 * prop.scale;
      // Each rock gets its own material instance with a slight per-rock
      // color/roughness variance and a randomized rotation - three
      // identical dodecahedrons all facing the same default orientation
      // reads as obviously instanced geometry rather than hand-placed
      // rocks, especially at a standstill where the player has time to
      // actually look at them.
      const tint = 0.85 + Math.random() * 0.3;
      const rockMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x5a5850).multiplyScalar(tint),
        roughness: 0.8 + Math.random() * 0.15,
      });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.6, 0), rockMat);
      rock.position.set(prop.position[0], size * 0.4, prop.position[2]);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.name = 'collidable-prop';
      scene.add(rock);

      const rockBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(prop.position[0], size * 0.4, prop.position[2]),
      );
      world.createCollider(RAPIER.ColliderDesc.ball(size * 0.55), rockBody);
    }

    scatterFoliage(scene, zone.groundSize);
  }
}

const FOLIAGE_COUNT = 140;

/** Purely decorative, non-colliding grass tufts scattered across the
 * ground - the flat single-color plane previously had zero texture
 * variation up close, which reads as an unfinished placeholder ground
 * rather than a place. One InstancedMesh keeps this to a single draw call
 * regardless of count. */
function scatterFoliage(scene: THREE.Scene, groundSize: number): void {
  const geometry = new THREE.ConeGeometry(0.12, 0.4, 5);
  const material = new THREE.MeshStandardMaterial({ color: 0x3d5a3f, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, FOLIAGE_COUNT);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'ground-foliage';

  const dummy = new THREE.Object3D();
  const half = groundSize / 2 - 2;
  for (let i = 0; i < FOLIAGE_COUNT; i++) {
    // Keep a clear ring near spawn free of foliage so it never visually
    // crowds the intro dialogue's framing or the first few steps.
    let x = 0;
    let z = 0;
    do {
      x = (Math.random() * 2 - 1) * half;
      z = (Math.random() * 2 - 1) * half;
    } while (Math.hypot(x, z - 6) < 4);

    dummy.position.set(x, 0.18, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    const scale = 0.7 + Math.random() * 0.8;
    dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.5), scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

export const zoneLoader = new ZoneLoader();
