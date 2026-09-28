/**
 * Persists player progress to IndexedDB. Kept deliberately dumb: it knows
 * nothing about Entity/DragonAI/SkillTree classes, only plain serializable
 * data shapes, so gameplay systems can evolve without this file changing.
 */

export interface SavedPlayerState {
  position: [number, number, number];
  yaw: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
}

/**
 * How a dragon joined the stable - drives the stat-ceiling asymmetry between
 * the two acquisition systems (see docs/design/crystal-and-taming-systems.md
 * §5): crystalborn dragons have a fixed ceiling set at the moment the
 * crystal opened; tamed dragons have a `loyalty` value that can rise or
 * fall instead. See `originStatMultiplier` in `progression/DragonLeveling.ts`.
 */
export type DragonOrigin = 'tamed' | 'crystalborn-whole' | 'crystalborn-fractured';

export interface SavedStabledDragon {
  id: string;
  name: string;
  archetype: string;
  level: number;
  xp: number;
  tamedAt: number;
  origin: DragonOrigin;
  /** 0-100. Only meaningful for `origin: 'tamed'` - crystalborn dragons don't have this axis. */
  loyalty: number;
}

export interface SavedGearItem {
  instanceId: string;
  baseId: string;
  name: string;
  slot: string;
  rarity: string;
  rolledStats: Record<string, number>;
}

export interface SavedProgression {
  unlockedSkillNodeIds: string[];
  skillPoints: number;
  /** slot -> equipped item's instanceId (or null if empty) */
  equippedGear: Record<string, string | null>;
  inventoryGear: SavedGearItem[];
}

export interface SaveData {
  version: number;
  savedAt: number;
  player: SavedPlayerState;
  stable: SavedStabledDragon[];
  progression: SavedProgression;
  /** Crystal ids already resolved (evaporated or fractured) - crystals are
   * "finite and hand-placed" (design doc §3), so an opened one must stay
   * gone across reloads instead of respawning as a free reroll. */
  openedCrystalIds: string[];
}

const DB_NAME = 'dragonbound';
const DB_VERSION = 1;
const STORE_NAME = 'save';
const SAVE_KEY = 'slot1';
const CURRENT_SAVE_VERSION = 1;

export function createDefaultSave(): SaveData {
  return {
    version: CURRENT_SAVE_VERSION,
    savedAt: Date.now(),
    player: {
      position: [0, 1, 8],
      yaw: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      level: 1,
      xp: 0,
    },
    stable: [],
    openedCrystalIds: [],
    progression: {
      unlockedSkillNodeIds: [],
      skillPoints: 1,
      equippedGear: {},
      inventoryGear: [],
    },
  };
}

export class SaveManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async save(data: SaveData): Promise<void> {
    const db = await this.openDb();
    const toWrite: SaveData = { ...data, version: CURRENT_SAVE_VERSION, savedAt: Date.now() };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(toWrite, SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Returns null if there's no save yet (fresh install) or it can't be read. */
  async load(): Promise<SaveData | null> {
    try {
      const db = await this.openDb();
      const result = await new Promise<SaveData | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(SAVE_KEY);
        req.onsuccess = () => resolve(req.result as SaveData | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!result) return null;
      return migrateSave(result);
    } catch (err) {
      console.warn('[SaveManager] load failed, starting fresh:', err);
      return null;
    }
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

function migrateSave(data: SaveData): SaveData {
  // Placeholder for future save-version migrations. Today there's only
  // version 1, so this just guards against a corrupt/partial record.
  if (!data.player || !data.progression || !Array.isArray(data.stable)) {
    return createDefaultSave();
  }
  // origin/loyalty/openedCrystalIds were added after v1 shipped; backfill
  // saves from before that (in-place-editable session, so `version` didn't bump).
  data.stable = data.stable.map((d) => ({
    ...d,
    origin: d.origin ?? 'tamed',
    loyalty: d.loyalty ?? 55,
  }));
  if (!Array.isArray(data.openedCrystalIds)) data.openedCrystalIds = [];
  return data;
}
