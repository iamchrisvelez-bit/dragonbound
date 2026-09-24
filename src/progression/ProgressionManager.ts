import { eventBus } from '../core/EventBus';
import type { SavedProgression, SavedGearItem } from '../core/SaveManager';
import { canUnlockNode, findSkillNode } from './SkillTree';
import { type RolledGearItem, type GearSlot } from './Gear';

/**
 * Runtime owner of the player's unlocked skill nodes, skill points, and
 * gear inventory/loadout. GameManager loads this from SaveManager on boot
 * and reads toSaveData() back out when saving.
 */
export class ProgressionManager {
  private unlockedNodeIds = new Set<string>();
  skillPoints = 0;
  private inventory: RolledGearItem[] = [];
  private equipped = new Map<GearSlot, string>();

  loadFromSave(saved: SavedProgression): void {
    this.unlockedNodeIds = new Set(saved.unlockedSkillNodeIds);
    this.skillPoints = saved.skillPoints;
    this.inventory = saved.inventoryGear.map((g) => ({
      instanceId: g.instanceId,
      baseId: g.baseId,
      name: g.name,
      slot: g.slot as GearSlot,
      rarity: g.rarity as RolledGearItem['rarity'],
      rolledStats: g.rolledStats as RolledGearItem['rolledStats'],
    }));
    this.equipped = new Map(
      Object.entries(saved.equippedGear)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([slot, instanceId]) => [slot as GearSlot, instanceId]),
    );
  }

  toSaveData(): SavedProgression {
    const equippedGear: Record<string, string | null> = {};
    for (const [slot, instanceId] of this.equipped) equippedGear[slot] = instanceId;
    const inventoryGear: SavedGearItem[] = this.inventory.map((g) => ({
      instanceId: g.instanceId,
      baseId: g.baseId,
      name: g.name,
      slot: g.slot,
      rarity: g.rarity,
      rolledStats: g.rolledStats as Record<string, number>,
    }));
    return {
      unlockedSkillNodeIds: Array.from(this.unlockedNodeIds),
      skillPoints: this.skillPoints,
      equippedGear,
      inventoryGear,
    };
  }

  get unlockedIds(): readonly string[] {
    return Array.from(this.unlockedNodeIds);
  }

  canUnlock(nodeId: string): boolean {
    const node = findSkillNode(nodeId);
    if (!node) return false;
    return this.skillPoints >= node.cost && canUnlockNode(nodeId, this.unlockedIds);
  }

  unlockNode(nodeId: string): boolean {
    const node = findSkillNode(nodeId);
    if (!node || !this.canUnlock(nodeId)) return false;
    this.skillPoints -= node.cost;
    this.unlockedNodeIds.add(nodeId);
    eventBus.emit('progression:skill-unlocked', { branchId: branchIdFor(nodeId), nodeId });
    return true;
  }

  grantSkillPoints(amount: number): void {
    this.skillPoints += amount;
  }

  addGear(item: RolledGearItem): void {
    this.inventory.push(item);
  }

  get gearInventory(): readonly RolledGearItem[] {
    return this.inventory;
  }

  getEquipped(slot: GearSlot): RolledGearItem | undefined {
    const instanceId = this.equipped.get(slot);
    return instanceId ? this.inventory.find((g) => g.instanceId === instanceId) : undefined;
  }

  equip(instanceId: string): boolean {
    const item = this.inventory.find((g) => g.instanceId === instanceId);
    if (!item) return false;
    this.equipped.set(item.slot, instanceId);
    eventBus.emit('progression:gear-equipped', { slot: item.slot, itemId: instanceId });
    return true;
  }
}

function branchIdFor(nodeId: string): string {
  return nodeId.split('-')[0] ?? 'unknown';
}

export const progressionManager = new ProgressionManager();
