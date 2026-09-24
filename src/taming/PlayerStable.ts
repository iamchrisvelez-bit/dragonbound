import type { SavedStabledDragon } from '../core/SaveManager';
import { applyXp } from '../progression/DragonLeveling';
import { eventBus } from '../core/EventBus';

/**
 * Holds every dragon the player has tamed. Deliberately just an in-memory
 * list of plain data + accessors - GameManager is responsible for loading
 * it from SaveManager on boot and writing it back on save.
 */
export class PlayerStable {
  private dragons: SavedStabledDragon[] = [];

  load(initial: SavedStabledDragon[]): void {
    this.dragons = [...initial];
  }

  add(dragon: SavedStabledDragon): void {
    if (this.dragons.some((d) => d.id === dragon.id)) return;
    this.dragons.push(dragon);
  }

  list(): readonly SavedStabledDragon[] {
    return this.dragons;
  }

  addXp(dragonId: string, amount: number): void {
    const dragon = this.dragons.find((d) => d.id === dragonId);
    if (!dragon) return;
    const result = applyXp(dragon, amount);
    dragon.level = result.level;
    dragon.xp = result.xp;
    if (result.leveledUp) eventBus.emit('progression:dragon-leveled', { dragonId, level: result.level });
  }

  toSaveData(): SavedStabledDragon[] {
    return this.dragons.map((d) => ({ ...d }));
  }
}

export const playerStable = new PlayerStable();
