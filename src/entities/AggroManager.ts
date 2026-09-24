import type * as THREE from 'three';
import type { Dragon } from './Dragon';

const DEFAULT_PACK_ALERT_RADIUS = 7;

/**
 * Tracks which feral dragons are currently aware of the player. A dragon
 * self-aggros once the player enters its own detection range (with
 * hysteresis: it only drops aggro once the player leaves a larger
 * de-aggro range, so it doesn't flicker at the boundary). Once a dragon is
 * aggro'd, any other feral dragon within `packAlertRadius` of it is pulled
 * into aggro too, even if the player hasn't entered that dragon's own
 * range - simple pack behavior: wake one wyrmling near its packmates and
 * they all come.
 */
export class AggroManager {
  private aggroed = new Set<string>();

  isAggro(dragonId: string): boolean {
    return this.aggroed.has(dragonId);
  }

  update(dragons: readonly Dragon[], playerPosition: THREE.Vector3, packAlertRadius: number = DEFAULT_PACK_ALERT_RADIUS): void {
    for (const dragon of dragons) {
      if (!dragon.alive || dragon.ai.state !== 'feral') {
        this.aggroed.delete(dragon.id);
        continue;
      }
      const dist = dragon.object3D.position.distanceTo(playerPosition);
      if (dist <= dragon.aggroRange) this.aggroed.add(dragon.id);
      else if (dist > dragon.deaggroRange) this.aggroed.delete(dragon.id);
    }

    const aggroPositions = dragons
      .filter((d) => d.alive && d.ai.state === 'feral' && this.aggroed.has(d.id))
      .map((d) => d.object3D.position);
    if (aggroPositions.length === 0) return;

    for (const dragon of dragons) {
      if (!dragon.alive || dragon.ai.state !== 'feral' || this.aggroed.has(dragon.id)) continue;
      for (const pos of aggroPositions) {
        if (dragon.object3D.position.distanceTo(pos) <= packAlertRadius) {
          this.aggroed.add(dragon.id);
          break;
        }
      }
    }
  }
}
