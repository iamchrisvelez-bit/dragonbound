import * as THREE from 'three';

export interface CrystalDefinition {
  id: string;
  position: [number, number, number];
  /** What the crystal holds - display name and archetype for the dragon it releases. */
  dragonName: string;
  archetype: string;
}

type CrystalOutro = 'none' | 'evaporating' | 'fracturing';

const BASE_COLOR = 0x8f6fd8;
const RESONANCE_COLOR = 0xf2e9d8;
const FRACTURE_COLOR = 0xc95c3a;
const OUTRO_DURATION = 1.1;

/**
 * A hand-placed, sealed crystal (System A - docs/design/crystal-and-taming-systems.md
 * §3). Purely presentational + a little local animation state; the actual
 * hold-and-attune interaction, timing and evaporate/fracture decision live
 * in CrystalController, which drives this object via setResonance()/resolve().
 *
 * No new art asset: a low-poly gem built from THREE primitives, matching
 * how Dragon's own placeholder works before a real model exists - there's
 * no CC0 crystal asset to source here, and a procedural gem reads fine for
 * a small, glowing, floating object.
 */
export class Crystal {
  readonly id: string;
  readonly dragonName: string;
  readonly archetype: string;
  readonly object3D: THREE.Object3D;
  opened = false;

  private gem: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private light: THREE.PointLight;
  private age = 0;
  private resonance = 0;
  private outro: CrystalOutro = 'none';
  private outroTimer = 0;

  constructor(def: CrystalDefinition) {
    this.id = def.id;
    this.dragonName = def.dragonName;
    this.archetype = def.archetype;

    this.object3D = new THREE.Object3D();
    this.object3D.position.set(def.position[0], def.position[1], def.position[2]);

    this.material = new THREE.MeshStandardMaterial({
      color: BASE_COLOR,
      emissive: BASE_COLOR,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.15,
      transparent: true,
      opacity: 0.92,
    });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.material);
    this.gem.castShadow = true;
    this.object3D.add(this.gem);

    this.light = new THREE.PointLight(BASE_COLOR, 1.2, 6);
    this.light.position.y = 0.2;
    this.object3D.add(this.light);
  }

  /** Called every frame CrystalController has this crystal actively held, 0 (just started) to 1 (about to evaporate). */
  setResonance(t: number): void {
    this.resonance = Math.max(0, Math.min(1, t));
  }

  /** Kicks off the evaporate-or-fracture outro animation. Caller (GameManager)
   * removes object3D from the scene once `outroFinished` is true. */
  resolve(fractured: boolean): void {
    this.opened = true;
    this.outro = fractured ? 'fracturing' : 'evaporating';
    this.outroTimer = 0;
  }

  get outroFinished(): boolean {
    return this.outro !== 'none' && this.outroTimer >= OUTRO_DURATION;
  }

  update(dt: number): void {
    this.age += dt;
    this.object3D.rotation.y += dt * 0.6;
    this.gem.position.y = 0.15 + Math.sin(this.age * 1.4) * 0.08;

    if (this.outro !== 'none') {
      this.outroTimer += dt;
      const t = Math.min(1, this.outroTimer / OUTRO_DURATION);
      if (this.outro === 'evaporating') {
        // Evaporates: brightens and grows instead of shattering - "it does not shatter" (§3).
        this.material.emissiveIntensity = 0.5 + t * 3;
        this.material.opacity = 0.92 * (1 - t);
        this.gem.scale.setScalar(1 + t * 0.6);
        this.light.intensity = 1.2 * (1 - t) + t * 4;
      } else {
        // Fractures: dims to a harsh, flickering red rather than the calm resonance color.
        this.material.color.setHex(FRACTURE_COLOR);
        this.material.emissive.setHex(FRACTURE_COLOR);
        this.material.emissiveIntensity = 0.6 + Math.sin(this.outroTimer * 40) * 0.4;
        this.material.opacity = 0.92 * (1 - t);
        this.gem.scale.setScalar(1 - t * 0.3);
        this.light.intensity = Math.max(0, 1.2 * (1 - t));
      }
      return;
    }

    const pulse = 0.4 + Math.sin(this.age * 2.2) * 0.1;
    this.material.emissiveIntensity = pulse + this.resonance * 2.2;
    this.light.intensity = 1.2 + this.resonance * 3;
    const color = this.resonance > 0.01 ? lerpColor(BASE_COLOR, RESONANCE_COLOR, this.resonance) : BASE_COLOR;
    this.material.color.setHex(color);
    this.material.emissive.setHex(color);
    this.light.color.setHex(color);
  }
}

function lerpColor(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
