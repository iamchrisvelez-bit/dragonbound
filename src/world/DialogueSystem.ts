import { eventBus } from '../core/EventBus';

export interface DialogueLine {
  speaker: string;
  text: string;
}

/** Sequential dialogue queue; advance() pops the next line and emits it for the UI to render. */
export class DialogueSystem {
  private queue: DialogueLine[] = [];
  private current: DialogueLine | null = null;

  start(lines: DialogueLine[]): void {
    this.queue = [...lines];
    this.advance();
  }

  advance(): void {
    this.current = this.queue.shift() ?? null;
    if (this.current) eventBus.emit('dialogue:line', this.current);
  }

  get activeLine(): DialogueLine | null {
    return this.current;
  }

  get isActive(): boolean {
    return this.current !== null;
  }
}
