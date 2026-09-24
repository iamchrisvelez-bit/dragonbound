/**
 * Dragon behavior state machine. Combat AI (attack patterns, movement) is
 * layered on top of this in Dragon.ts by switching on `state`; this class
 * only owns the taming-relevant states and their transitions so the rest
 * of the game can reason about "is this dragon tameable right now" in one
 * place.
 *
 *   feral --(HP <= tame threshold)--> wary
 *   wary  --(player starts minigame)--> bonding
 *   bonding --(minigame success)--> tamed
 *   bonding --(minigame failure)--> wary
 */
export type DragonAIState = 'feral' | 'wary' | 'bonding' | 'tamed';

type TransitionListener = (from: DragonAIState, to: DragonAIState) => void;

export class DragonAI {
  state: DragonAIState = 'feral';
  private listeners = new Set<TransitionListener>();

  onTransition(cb: TransitionListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  transition(to: DragonAIState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    for (const cb of this.listeners) cb(from, to);
  }

  /** Called every frame by Dragon with its current health ratio (0-1). */
  evaluateHealth(healthRatio: number, tameThresholdRatio: number): void {
    if (this.state === 'feral' && healthRatio <= tameThresholdRatio) {
      this.transition('wary');
    }
  }

  get isFeral(): boolean {
    return this.state === 'feral';
  }

  get isTameable(): boolean {
    return this.state === 'wary' || this.state === 'bonding';
  }

  get isTamed(): boolean {
    return this.state === 'tamed';
  }
}
