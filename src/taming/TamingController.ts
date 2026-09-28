import { InputManager } from '../core/InputManager';
import { eventBus } from '../core/EventBus';
import { Knight } from '../entities/Knight';
import { Dragon } from '../entities/Dragon';
import { ResonanceMinigame } from './ResonanceMinigame';
import { playerStable } from './PlayerStable';

export const INTERACT_RANGE = 4;
const WIDE_TAP_WINDOW_MULTIPLIER = 1.6;

const BASE_BEAT_COUNT = 5;
const BASE_WINDOW_DURATION = 0.38;
const BASE_HOLD_DURATION = 2.2;
/** Each failed attempt (Dragon.wariness) shaves the tap window and adds a beat - see docs/design/crystal-and-taming-systems.md §4. */
const WARINESS_WINDOW_PENALTY = 0.035;
const MIN_WINDOW_DURATION = 0.16;
const WARINESS_HOLD_PENALTY = 0.4;

/** A tamed dragon's starting loyalty (see DragonLeveling.originStatMultiplier) - mid-range, so it can visibly grow or fall from here. */
const STARTING_LOYALTY = 55;

/**
 * Orchestrates the wild-taming flow (System B): once a dragon goes 'wary'
 * (see Dragon's HP threshold check) and isn't currently spooked from a
 * previous failed attempt, the player walks up and presses the mount-toggle
 * button to begin a ResonanceMinigame (read -> match -> hold). Success flags
 * the dragon tamed and adds it to the player's stable; failure flees the
 * dragon (Dragon.flee()) and grows its wariness for next time.
 */
export class TamingController {
  private activeDragon: Dragon | null = null;
  private minigame: ResonanceMinigame | null = null;

  update(dt: number, input: InputManager, knight: Knight, dragons: readonly Dragon[]): void {
    if (!this.activeDragon) {
      if (!input.wasActionPressed('mountToggle')) return;
      const candidate = dragons.find(
        (d) =>
          d.ai.state === 'wary' &&
          !d.isSpooked &&
          d.object3D.position.distanceTo(knight.object3D.position) <= INTERACT_RANGE,
      );
      if (!candidate) return;
      if (!input.consumeAction('mountToggle')) return;

      this.activeDragon = candidate;
      candidate.ai.transition('bonding');
      candidate.bondMeter.reset();
      const windowMultiplier = knight.abilities.has('wide-tap-windows') ? WIDE_TAP_WINDOW_MULTIPLIER : 1;
      const beatCount = BASE_BEAT_COUNT + candidate.wariness;
      const windowDuration = Math.max(MIN_WINDOW_DURATION, BASE_WINDOW_DURATION - candidate.wariness * WARINESS_WINDOW_PENALTY) * windowMultiplier;
      const holdDuration = BASE_HOLD_DURATION + candidate.wariness * WARINESS_HOLD_PENALTY;
      this.minigame = new ResonanceMinigame(beatCount, 0.6, windowDuration, holdDuration);
      eventBus.emit('taming:started', { dragonId: candidate.id });
      return;
    }

    const dragon = this.activeDragon;
    const minigame = this.minigame!;

    if (minigame.phase === 'matching' && input.wasActionPressed('attack')) {
      const hit = minigame.registerTap();
      if (hit) dragon.bondMeter.increase((60 / minigame.beats.length) * knight.bondGainMultiplier);
    }

    minigame.update(dt, input.isActionHeld('mountToggle'));

    if (minigame.consumeDestabilizeEvent()) dragon.playBondFlare();
    if (minigame.phase === 'holding') dragon.bondMeter.value = 60 + minigame.holdProgress * 0.4;

    eventBus.emit('taming:progress', { dragonId: dragon.id, bond: dragon.bondMeter.value });

    if (!minigame.isFinished) return;

    if (minigame.succeeded) {
      dragon.ai.transition('tamed');
      dragon.bondMeter.value = 100;
      dragon.tamedAt = Date.now();
      playerStable.add({
        id: dragon.id,
        name: dragon.displayName,
        archetype: dragon.archetype,
        level: 1,
        xp: 0,
        tamedAt: Date.now(),
        origin: 'tamed',
        loyalty: STARTING_LOYALTY,
      });
      eventBus.emit('taming:success', { dragonId: dragon.id });
    } else {
      dragon.ai.transition('wary');
      dragon.flee(knight.object3D.position);
      eventBus.emit('taming:failed', { dragonId: dragon.id });
    }

    this.activeDragon = null;
    this.minigame = null;
  }

  get isActive(): boolean {
    return this.activeDragon !== null;
  }

  get currentMinigame(): ResonanceMinigame | null {
    return this.minigame;
  }

  get currentDragon(): Dragon | null {
    return this.activeDragon;
  }
}
