/**
 * Typed pub/sub bus used to decouple systems (combat, taming, progression,
 * UI) from each other. Systems emit events instead of holding direct
 * references to one another; anything can listen without the emitter
 * knowing who's listening.
 */

// Central map of every event this game emits. Add new events here and the
// payload type is enforced at every call site.
export interface GameEvents {
  'player:damaged': { amount: number; currentHealth: number; maxHealth: number };
  'player:died': Record<string, never>;
  'player:stamina-changed': { current: number; max: number };
  'player:mounted': { dragonId: string };
  'player:dismounted': { dragonId: string };

  'combat:attack-started': { attackerId: string; comboIndex: number };
  'combat:hit': { attackerId: string; targetId: string; damage: number };

  'dragon:damaged': { dragonId: string; amount: number; currentHealth: number; maxHealth: number };
  'dragon:tamable': { dragonId: string };
  'dragon:state-changed': { dragonId: string; from: string; to: string };
  'dragon:died': { dragonId: string };

  'taming:started': { dragonId: string };
  'taming:progress': { dragonId: string; bond: number };
  'taming:success': { dragonId: string };
  'taming:failed': { dragonId: string };

  'progression:skill-unlocked': { branchId: string; nodeId: string };
  'progression:gear-equipped': { slot: string; itemId: string };
  'progression:dragon-leveled': { dragonId: string; level: number };

  'save:loaded': Record<string, never>;
  'save:saved': Record<string, never>;

  'quest:updated': { questId: string; status: string };
  'dialogue:line': { speaker: string; text: string };
}

export type EventName = keyof GameEvents;
type Listener<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private listeners = new Map<EventName, Set<Listener<any>>>();

  on<K extends EventName>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  once<K extends EventName>(event: K, listener: Listener<K>): void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
  }

  off<K extends EventName>(event: K, listener: Listener<K>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends EventName>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // copy to array so a listener unsubscribing mid-emit can't skip others
    for (const listener of Array.from(set)) listener(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Shared app-wide bus. Systems may also construct private EventBus
 * instances for narrower scopes, but most gameplay code should import this. */
export const eventBus = new EventBus();
