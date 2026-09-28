import * as THREE from 'three';
import { clamp, lerpAngle } from './mathUtils';

const PIVOT_HEIGHT = 1.4;
/** Pulled back and pitched down into a 3/4 action-RPG framing (was a tight
 * 6-unit over-the-shoulder shot at an 19.5deg default pitch) - shows more of
 * the surrounding fight instead of mostly sky/close-up back-of-head. */
const DEFAULT_DISTANCE = 9.5;
const MIN_DISTANCE = 1.6;
const MAX_DISTANCE = 12;
/**
 * Vertical FOV, widened for portrait aspects. This is a mobile-portrait
 * game first (see README) - a phone screen's aspect is roughly 0.42-0.5
 * (width/height), and a plain fixed 60° vertical FOV built/tuned on a
 * landscape desktop viewport leaves a noticeably narrow horizontal field
 * of view once the same vertical FOV is stretched over a tall, narrow
 * canvas. Fully preserving landscape's horizontal FOV in portrait would
 * mean a 90-100°+ vertical FOV, which reads as fisheye distortion on a
 * phone rather than "wider view" - so this only blends partway there.
 */
const LANDSCAPE_FOV = 60;
const PORTRAIT_FOV = 72;
/** Aspect (width/height) at which PORTRAIT_FOV is fully reached; typical phones (~0.42-0.5) sit at or past this. */
const PORTRAIT_FOV_ASPECT = 0.5;

function fovForAspect(aspect: number): number {
  if (aspect >= 1) return LANDSCAPE_FOV;
  const t = clamp((1 - aspect) / (1 - PORTRAIT_FOV_ASPECT), 0, 1);
  return LANDSCAPE_FOV + (PORTRAIT_FOV - LANDSCAPE_FOV) * t;
}
/** Pulled back and a bit higher while riding a dragon - it's a bigger subject and the point is to see more of the ride. */
const MOUNTED_PIVOT_HEIGHT = 2.3;
const MOUNTED_DISTANCE = 13;
const MIN_PITCH = 0.12;
const MAX_PITCH = 1.15;
const LOOK_SENSITIVITY_X = 0.0045;
const LOOK_SENSITIVITY_Y = 0.0035;

/**
 * Third-person spring-arm follow camera. Free-look while unlocked (driven
 * by InputManager's look delta - touch drag, mouse drag, or gamepad right
 * stick); snaps to face whatever `lockOnTarget` is set when locked on. A
 * raycast from the pivot toward the desired camera position pulls the
 * camera closer whenever scenery would otherwise clip through it.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.62;
  distance = DEFAULT_DISTANCE;
  lockOnTarget: THREE.Object3D | null = null;
  /** Set by GameManager on mount/dismount - swaps in a pulled-back, higher framing. */
  mounted = false;

  private raycaster = new THREE.Raycaster();
  private currentCamPos: THREE.Vector3 | null = null;
  /** 0-1 trauma-style shake intensity; decays each frame, squared for the
   * actual offset so small knocks barely register and big hits punch. */
  private shakeTrauma = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 250);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect);
    this.camera.updateProjectionMatrix();
  }

  /** Adds trauma (0-1, clamped); call on a landed hit or taking damage - see GameManager's combat/damage listeners. */
  addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1);
  }

  toggleLockOn(candidates: THREE.Object3D[]): void {
    if (this.lockOnTarget) {
      this.lockOnTarget = null;
      return;
    }
    this.lockOnTarget = pickNearest(this.camera.position, candidates);
  }

  update(dt: number, targetPosition: THREE.Vector3, lookDelta: { x: number; y: number }, collidables: THREE.Object3D[]): void {
    const pivotHeight = this.mounted ? MOUNTED_PIVOT_HEIGHT : PIVOT_HEIGHT;
    const pivot = targetPosition.clone().add(new THREE.Vector3(0, pivotHeight, 0));

    if (this.lockOnTarget && !this.lockOnTarget.parent) {
      // target was removed from the scene (e.g. despawned) - drop the lock
      this.lockOnTarget = null;
    }

    if (this.lockOnTarget) {
      const toTarget = this.lockOnTarget.position.clone().sub(pivot);
      const desiredYaw = Math.atan2(toTarget.x, toTarget.z) + Math.PI;
      this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 5));
      this.pitch = clamp(this.pitch + (0.3 - this.pitch) * Math.min(1, dt * 5), MIN_PITCH, MAX_PITCH);
    } else {
      this.yaw -= lookDelta.x * LOOK_SENSITIVITY_X;
      this.pitch = clamp(this.pitch - lookDelta.y * LOOK_SENSITIVITY_Y, MIN_PITCH, MAX_PITCH);
    }

    const offsetDir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    const baseDistance = this.mounted ? MOUNTED_DISTANCE : this.distance;
    let travelDistance = baseDistance;
    if (collidables.length > 0) {
      this.raycaster.set(pivot, offsetDir);
      this.raycaster.far = baseDistance;
      const hits = this.raycaster.intersectObjects(collidables, false);
      if (hits.length > 0) {
        travelDistance = clamp(hits[0].distance - 0.35, MIN_DISTANCE, baseDistance);
      }
    }

    const desiredCamPos = pivot.clone().addScaledVector(offsetDir, travelDistance);

    if (!this.currentCamPos) this.currentCamPos = desiredCamPos.clone();
    this.currentCamPos.lerp(desiredCamPos, clamp(dt * 12, 0, 1));

    this.camera.position.copy(this.currentCamPos);

    if (this.shakeTrauma > 0.001) {
      // Squared falloff (trauma^2) so small knocks barely register while a
      // big hit still punches - a linear shake felt too noisy at low values.
      const strength = this.shakeTrauma * this.shakeTrauma;
      const t = performance.now() * 0.02;
      this.camera.position.x += (pseudoNoise(t, 11.1) - 0.5) * strength * 0.5;
      this.camera.position.y += (pseudoNoise(t, 47.7) - 0.5) * strength * 0.35;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.2);
    }

    this.camera.lookAt(pivot);
  }
}

/** Cheap deterministic pseudo-random in [0,1) from two numbers - avoids
 * pulling in a noise library just for a camera-shake wobble. */
function pseudoNoise(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function pickNearest(from: THREE.Vector3, candidates: THREE.Object3D[]): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = from.distanceTo(c.position);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
