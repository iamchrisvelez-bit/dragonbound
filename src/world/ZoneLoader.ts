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

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5850, roughness: 0.9 });
    for (const prop of zone.props) {
      const size = 1.2 * prop.scale;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.6, 0), rockMat);
      rock.position.set(prop.position[0], size * 0.4, prop.position[2]);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.name = 'collidable-prop';
      scene.add(rock);

      const rockBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(prop.position[0], size * 0.4, prop.position[2]),
      );
      world.createCollider(RAPIER.ColliderDesc.ball(size * 0.55), rockBody);
    }
  }
}

export const zoneLoader = new ZoneLoader();
