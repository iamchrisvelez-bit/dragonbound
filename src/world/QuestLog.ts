import { eventBus } from '../core/EventBus';

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'not-started' | 'active' | 'complete';
}

export const defaultQuests: Quest[] = [
  {
    id: 'tame-first-dragon',
    title: 'First Bond',
    description: 'Weaken a wild dragon, then tame it before it recovers.',
    status: 'active',
  },
];

/** Minimal quest log: a status map with an event on every change. No branching/objectives graph yet. */
export class QuestLog {
  private quests = new Map<string, Quest>();

  constructor(initial: Quest[] = []) {
    for (const q of initial) this.quests.set(q.id, { ...q });
  }

  add(quest: Quest): void {
    this.quests.set(quest.id, { ...quest });
  }

  updateStatus(id: string, status: Quest['status']): void {
    const quest = this.quests.get(id);
    if (!quest) return;
    quest.status = status;
    eventBus.emit('quest:updated', { questId: id, status });
  }

  get(id: string): Quest | undefined {
    return this.quests.get(id);
  }

  list(): Quest[] {
    return Array.from(this.quests.values());
  }
}
