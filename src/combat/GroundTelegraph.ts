import * as THREE from 'three';

const SEGMENTS = 40;
const RING_INNER_RATIO = 0.82; // ring, not a filled disc - a filled disc reads more like a shadow/decoration than a warning

let sharedRingGeometry: THREE.RingGeometry | null = null;
function unitRingGeometry(): THREE.RingGeometry {
  if (!sharedRingGeometry) sharedRingGeometry = new THREE.RingGeometry(RING_INNER_RATIO, 1, SEGMENTS);
  return sharedRingGeometry;
}

/**
 * A flat, glowing ground ring used to preview an incoming dragon attack's
 * danger zone during its windup - the eye-glow telegraph (see Dragon.ts's
 * setTelegraphColor) tells you *that* something's coming and roughly how
 * urgent; this tells you *where* not to be standing, the difference between
 * "read and react" and "hope the eyes were warning enough." Pulses gently
 * so it reads as "live danger" rather than static level geometry.
 *
 * One instance per dragon (see Dragon.telegraph), added to the scene
 * alongside dragon.object3D by GameManager - not parented to the dragon's
 * own object3D, since its position needs to independently track the
 * player (for lunge/breath) rather than always following the dragon.
 */
export class GroundTelegraph {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private baseOpacity = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(unitRingGeometry(), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1; // draw after opaque terrain/props so it doesn't z-fight the ground
  }

  show(center: THREE.Vector3, radius: number, color: number): void {
    this.mesh.visible = true;
    this.mesh.scale.set(radius, radius, 1);
    this.mesh.position.set(center.x, center.y + 0.04, center.z);
    this.material.color.setHex(color);
    this.baseOpacity = 0.55;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /** Call every frame while shown, with 0-1 windup progress, for the pulse + a fade-in on first appearing. */
  update(elapsedSeconds: number, windupProgress: number): void {
    if (!this.mesh.visible) return;
    const pulse = 0.75 + 0.25 * Math.sin(elapsedSeconds * 10);
    const fadeIn = Math.min(1, windupProgress * 4); // quick fade-in rather than popping at full opacity
    this.material.opacity = this.baseOpacity * pulse * fadeIn;
  }
}
