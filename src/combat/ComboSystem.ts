/**
 * Data-driven light/heavy combo chain. Each attack input advances the
 * chain; letting the window lapse (or finishing the chain) resets it.
 * Tuning the fight feel is a matter of editing this array, not logic.
 */
export interface AttackDefinition {
  name: string;
  damage: number;
  staminaCost: number;
  hitboxRadius: number;
  hitboxForwardOffset: number;
  /** Seconds the hitbox stays live and can register a hit. */
  activeDuration: number;
  /** Seconds before the knight can act again after this swing. */
  recoveryDuration: number;
}

export const LIGHT_COMBO: AttackDefinition[] = [
  {
    name: 'slash-1',
    damage: 8,
    staminaCost: 12,
    hitboxRadius: 0.9,
    hitboxForwardOffset: 1.1,
    activeDuration: 0.18,
    recoveryDuration: 0.22,
  },
  {
    name: 'slash-2',
    damage: 10,
    staminaCost: 14,
    hitboxRadius: 0.95,
    hitboxForwardOffset: 1.15,
    activeDuration: 0.18,
    recoveryDuration: 0.24,
  },
  {
    name: 'slash-3-heavy',
    damage: 18,
    staminaCost: 22,
    hitboxRadius: 1.1,
    hitboxForwardOffset: 1.3,
    activeDuration: 0.22,
    recoveryDuration: 0.4,
  },
];

export class ComboSystem {
  private index = 0;
  private lastInputTime = -Infinity;
  private readonly comboWindowSeconds = 0.9;

  /** Call when an attack input is accepted; returns the attack to execute. */
  next(nowSeconds: number): AttackDefinition {
    if (nowSeconds - this.lastInputTime > this.comboWindowSeconds) this.index = 0;
    const def = LIGHT_COMBO[this.index % LIGHT_COMBO.length];
    this.index = (this.index + 1) % LIGHT_COMBO.length;
    this.lastInputTime = nowSeconds;
    return def;
  }

  reset(): void {
    this.index = 0;
    this.lastInputTime = -Infinity;
  }

  get comboIndex(): number {
    return this.index;
  }
}
