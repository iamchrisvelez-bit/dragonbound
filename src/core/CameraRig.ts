import * as THREE from 'three';
import { clamp, lerpAngle } from './mathUtils';

const PIVOT_HEIGHT = 1.4;
const DEFAULT_DISTANCE = 6;
const MIN_DISTANCE = 1.6;
const MAX_DISTANCE = 7.5;
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
  pitch = 0.34;
  distance = DEFAULT_DISTANCE;
  lockOnTarget: THREE.Object3D | null = null;

  private raycaster = new THREE.Raycaster();
  private currentCamPos: THREE.Vector3 | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 250);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  toggleLockOn(candidates: THREE.Object3D[]): void {
    if (this.lockOnTarget) {
      this.lockOnTarget = null;
      return;
    }
    this.lockOnTarget = pickNearest(this.camera.position, candidates);
  }

  update(dt: number, targetPosition: THREE.Vector3, lookDelta: { x: number; y: number }, collidables: THREE.Object3D[]): void {
    const pivot = targetPosition.clone().add(new THREE.Vector3(0, PIVOT_HEIGHT, 0));

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

    let travelDistance = this.distance;
    if (collidables.length > 0) {
      this.raycaster.set(pivot, offsetDir);
      this.raycaster.far = this.distance;
      const hits = this.raycaster.intersectObjects(collidables, false);
      if (hits.length > 0) {
        travelDistance = clamp(hits[0].distance - 0.35, MIN_DISTANCE, this.distance);
      }
    }

    const desiredCamPos = pivot.clone().addScaledVector(offsetDir, travelDistance);

    if (!this.currentCamPos) this.currentCamPos = desiredCamPos.clone();
    this.currentCamPos.lerp(desiredCamPos, clamp(dt * 12, 0, 1));

    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(pivot);
  }
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
