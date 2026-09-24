/**
 * Gear as data: a small catalog of base items, each with stat ranges per
 * slot, plus a rarity system that scales and adds bonus rolls. Adding a
 * new item or rarity tier means editing the tables below.
 */
export type GearSlot = 'weapon' | 'helm' | 'chest' | 'gloves' | 'boots' | 'trinket';
export type GearRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type GearStat = 'attackDamage' | 'maxHealth' | 'maxStamina' | 'armor' | 'bondGainRate';

export interface StatRange {
  min: number;
  max: number;
}

export interface GearBase {
  id: string;
  name: string;
  slot: GearSlot;
  description: string;
  statRanges: Partial<Record<GearStat, StatRange>>;
}

export const RARITY_MULTIPLIER: Record<GearRarity, number> = {
  common: 1.0,
  uncommon: 1.15,
  rare: 1.35,
  epic: 1.6,
  legendary: 2.0,
};

/** Extra bonus-stat rolls granted at higher rarities. */
export const RARITY_EXTRA_ROLLS: Record<GearRarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 1,
  epic: 1,
  legendary: 2,
};

export const gearBases: GearBase[] = [
  {
    id: 'knight-sword',
    name: "Knight's Sword",
    slot: 'weapon',
    description: 'A dependable arming sword.',
    statRanges: { attackDamage: { min: 3, max: 6 } },
  },
  {
    id: 'squire-plate',
    name: 'Squire Plate',
    slot: 'chest',
    description: 'Basic steel plate armor.',
    statRanges: { armor: { min: 4, max: 8 }, maxHealth: { min: 5, max: 12 } },
  },
  {
    id: 'riders-boots',
    name: "Rider's Boots",
    slot: 'boots',
    description: 'Boots built for dragon-mounted travel.',
    statRanges: { maxStamina: { min: 3, max: 8 } },
  },
  {
    id: 'tamers-gloves',
    name: "Tamer's Gloves",
    slot: 'gloves',
    description: 'Worn leather gloves favored by dragon tamers.',
    statRanges: { bondGainRate: { min: 0.02, max: 0.06 } },
  },
  {
    id: 'wyrmscale-helm',
    name: 'Wyrmscale Helm',
    slot: 'helm',
    description: 'Helm plated with shed dragon scale.',
    statRanges: { armor: { min: 2, max: 5 }, maxHealth: { min: 3, max: 8 } },
  },
];

export interface RolledGearItem {
  instanceId: string;
  baseId: string;
  name: string;
  slot: GearSlot;
  rarity: GearRarity;
  rolledStats: Partial<Record<GearStat, number>>;
}

let nextInstanceId = 1;

export function rollGear(baseId: string, rarity: GearRarity, rng: () => number = Math.random): RolledGearItem {
  const base = gearBases.find((b) => b.id === baseId);
  if (!base) throw new Error(`Unknown gear base id: ${baseId}`);

  const multiplier = RARITY_MULTIPLIER[rarity];
  const rolledStats: Partial<Record<GearStat, number>> = {};
  const statKeys = Object.keys(base.statRanges) as GearStat[];

  for (const stat of statKeys) {
    const range = base.statRanges[stat]!;
    rolledStats[stat] = roundStat(lerp(range.min, range.max, rng()) * multiplier);
  }

  const extraRolls = RARITY_EXTRA_ROLLS[rarity];
  for (let i = 0; i < extraRolls && statKeys.length > 0; i++) {
    const stat = statKeys[Math.floor(rng() * statKeys.length)];
    const range = base.statRanges[stat]!;
    rolledStats[stat] = roundStat((rolledStats[stat] ?? 0) + lerp(range.min, range.max, rng()) * 0.5);
  }

  return {
    instanceId: `${baseId}-${nextInstanceId++}`,
    baseId: base.id,
    name: rarity === 'common' ? base.name : `${capitalize(rarity)} ${base.name}`,
    slot: base.slot,
    rarity,
    rolledStats,
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function roundStat(v: number): number {
  return Math.round(v * 100) / 100;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
