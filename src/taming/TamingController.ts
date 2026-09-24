import { InputManager } from '../core/InputManager';
import { eventBus } from '../core/EventBus';
import { Knight } from '../entities/Knight';
import { Dragon } from '../entities/Dragon';
import { TamingMinigame } from './TamingMinigame';
import { playerStable } from './PlayerStable';

const INTERACT_RANGE = 4;

/**
 * Orchestrates the taming flow: once a dragon goes 'wary' (see Dragon's HP
 * threshold check), the player walks up and presses the mount-toggle
 * button to start the tap-sequence minigame, then taps the attack button
 * on each prompt. Success flags the dragon tamed and adds it to the
 * player's stable; failure drops the dragon back to 'wary' so it can be
 * retried.
 */
export class TamingController {
  private activeDragon: Dragon | null = null;
  private minigame: TamingMinigame | null = null;

  update(dt: number, input: InputManager, knight: Knight, dragons: readonly Dragon[]): void {
    if (!this.activeDragon) {
      if (!input.wasActionPressed('mountToggle')) return;
      const candidate = dragons.find(
        (d) => d.ai.state === 'wary' && d.object3D.position.distanceTo(knight.object3D.position) <= INTERACT_RANGE,
      );
      if (!candidate) return;

      this.activeDragon = candidate;
      candidate.ai.transition('bonding');
      candidate.bondMeter.reset();
      this.minigame = new TamingMinigame();
      eventBus.emit('taming:started', { dragonId: candidate.id });
      return;
    }

    const dragon = this.activeDragon;
    const minigame = this.minigame!;
    minigame.update(dt);

    if (input.wasActionPressed('attack')) {
      const hit = minigame.registerTap();
      if (hit) dragon.bondMeter.increase((100 / minigame.prompts.length) * knight.bondGainMultiplier);
    }
    eventBus.emit('taming:progress', { dragonId: dragon.id, bond: dragon.bondMeter.value });

    if (!minigame.isFinished) return;

    if (minigame.succeeded) {
      dragon.ai.transition('tamed');
      dragon.bondMeter.value = 100;
      playerStable.add({
        id: dragon.id,
        name: dragon.displayName,
        archetype: dragon.archetype,
        level: 1,
        xp: 0,
        tamedAt: Date.now(),
      });
      eventBus.emit('taming:success', { dragonId: dragon.id });
    } else {
      dragon.ai.transition('wary');
      eventBus.emit('taming:failed', { dragonId: dragon.id });
    }

    this.activeDragon = null;
    this.minigame = null;
  }

  get isActive(): boolean {
    return this.activeDragon !== null;
  }

  get currentMinigame(): TamingMinigame | null {
    return this.minigame;
  }

  get currentDragon(): Dragon | null {
    return this.activeDragon;
  }
}
