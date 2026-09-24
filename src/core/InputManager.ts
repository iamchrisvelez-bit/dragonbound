/**
 * Single source of truth for player input. Touch (virtual joystick +
 * on-screen buttons) is the primary path; keyboard and gamepad are wired up
 * as secondary dev-testing paths so the game can be iterated on from a
 * desktop browser without touching a phone.
 *
 * Gameplay code never reads DOM/keyboard/gamepad state directly - it only
 * talks to this class, so any input source can drive it identically.
 */

export type ActionName =
  | 'attack'
  | 'dodge'
  | 'block'
  | 'abilityWheel'
  | 'mountToggle'
  | 'lockOnToggle';

export interface Vec2 {
  x: number;
  y: number;
}

const ALL_ACTIONS: ActionName[] = [
  'attack',
  'dodge',
  'block',
  'abilityWheel',
  'mountToggle',
  'lockOnToggle',
];

const KEYBOARD_MOVE_BINDINGS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const KEYBOARD_ACTION_BINDINGS: Record<string, ActionName> = {
  Space: 'attack',
  KeyJ: 'attack',
  ShiftLeft: 'dodge',
  ShiftRight: 'dodge',
  KeyK: 'dodge',
  ControlLeft: 'block',
  KeyL: 'block',
  KeyQ: 'abilityWheel',
  KeyF: 'mountToggle',
  KeyC: 'lockOnToggle',
};

// Standard "Standard Gamepad" mapping indices.
const GAMEPAD_BUTTON_ACTIONS: Record<number, ActionName> = {
  0: 'attack', // A / Cross
  1: 'dodge', // B / Circle
  6: 'block', // LT / L2 (held)
  3: 'abilityWheel', // Y / Triangle
  5: 'mountToggle', // RB / R1
  10: 'lockOnToggle', // Left stick click
};

export class InputManager {
  private keyboardMove: Vec2 = { x: 0, y: 0 };
  private touchMove: Vec2 = { x: 0, y: 0 };
  private gamepadMove: Vec2 = { x: 0, y: 0 };
  private touchActive = false;

  private lookAccum: Vec2 = { x: 0, y: 0 };

  private heldActions = new Set<ActionName>();
  private queuedPresses = new Set<ActionName>();
  private justPressed = new Set<ActionName>();

  private prevGamepadButtons = new Map<number, boolean>();

  private dragPointerId: number | null = null;
  private lastDrag: Vec2 = { x: 0, y: 0 };

  private domElement: HTMLElement | null = null;

  attach(domElement: HTMLElement): void {
    this.domElement = domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.domElement?.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  /** Call once per frame, before gameplay systems read input. */
  update(_dt: number): void {
    this.pollGamepad();
    this.justPressed = this.queuedPresses;
    this.queuedPresses = new Set();
  }

  // ---- Touch UI entry points (called by TouchControls) ------------------

  setTouchMove(x: number, y: number): void {
    this.touchActive = true;
    this.touchMove = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  clearTouchMove(): void {
    this.touchActive = false;
    this.touchMove = { x: 0, y: 0 };
  }

  pressAction(action: ActionName): void {
    this.queuedPresses.add(action);
    this.heldActions.add(action);
  }

  releaseAction(action: ActionName): void {
    this.heldActions.delete(action);
  }

  addLookDelta(dx: number, dy: number): void {
    this.lookAccum.x += dx;
    this.lookAccum.y += dy;
  }

  // ---- Gameplay-facing read API -----------------------------------------

  /** Normalized [-1,1] movement vector, merged from whichever source is active. */
  getMoveVector(): Vec2 {
    if (this.touchActive) return this.touchMove;
    if (this.gamepadMove.x !== 0 || this.gamepadMove.y !== 0) return this.gamepadMove;
    return this.keyboardMove;
  }

  /** Accumulated camera-look delta since the last read; consumes the buffer. */
  consumeLookDelta(): Vec2 {
    const d = this.lookAccum;
    this.lookAccum = { x: 0, y: 0 };
    return d;
  }

  isActionHeld(action: ActionName): boolean {
    return this.heldActions.has(action);
  }

  wasActionPressed(action: ActionName): boolean {
    return this.justPressed.has(action);
  }

  // ---- Keyboard -----------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    if (KEYBOARD_MOVE_BINDINGS[e.code]) {
      this.heldKeys.add(e.code);
      this.recomputeKeyboardMoveFromHeldKeys();
    }
    const action = KEYBOARD_ACTION_BINDINGS[e.code];
    if (action && !e.repeat) {
      this.queuedPresses.add(action);
      this.heldActions.add(action);
    }
  };

  private heldKeys = new Set<string>();

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
    if (KEYBOARD_MOVE_BINDINGS[e.code]) this.recomputeKeyboardMoveFromHeldKeys();
    const action = KEYBOARD_ACTION_BINDINGS[e.code];
    if (action) this.heldActions.delete(action);
  };

  private recomputeKeyboardMoveFromHeldKeys(): void {
    let x = 0;
    let y = 0;
    for (const code of this.heldKeys) {
      const m = KEYBOARD_MOVE_BINDINGS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    this.keyboardMove = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  // ---- Mouse-drag look (desktop secondary path for camera orbit) --------

  private onPointerDown = (e: PointerEvent): void => {
    // Only used as the desktop dev-testing camera-drag path; on touch
    // devices TouchControls owns pointer handling for its own hit-zones and
    // calls addLookDelta directly, so this stays a light, generic fallback.
    if (e.pointerType !== 'mouse') return;
    this.dragPointerId = e.pointerId;
    this.lastDrag = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragPointerId !== e.pointerId) return;
    const dx = e.clientX - this.lastDrag.x;
    const dy = e.clientY - this.lastDrag.y;
    this.lastDrag = { x: e.clientX, y: e.clientY };
    this.addLookDelta(dx, dy);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.dragPointerId === e.pointerId) this.dragPointerId = null;
  };

  // ---- Gamepad ------------------------------------------------------------

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.();
    const pad = pads?.[0];
    if (!pad) {
      this.gamepadMove = { x: 0, y: 0 };
      return;
    }

    const deadzone = 0.15;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    this.gamepadMove = {
      x: Math.abs(ax) > deadzone ? ax : 0,
      y: Math.abs(ay) > deadzone ? ay : 0,
    };

    const lookX = pad.axes[2] ?? 0;
    const lookY = pad.axes[3] ?? 0;
    if (Math.abs(lookX) > deadzone || Math.abs(lookY) > deadzone) {
      this.addLookDelta(lookX * 8, lookY * 8);
    }

    for (const [indexStr, action] of Object.entries(GAMEPAD_BUTTON_ACTIONS)) {
      const index = Number(indexStr);
      const button = pad.buttons[index];
      const pressed = !!button?.pressed;
      const wasPressed = this.prevGamepadButtons.get(index) ?? false;
      if (pressed && !wasPressed) this.queuedPresses.add(action);
      if (pressed) this.heldActions.add(action);
      else if (wasPressed) this.heldActions.delete(action);
      this.prevGamepadButtons.set(index, pressed);
    }
  }

  static get allActions(): ActionName[] {
    return ALL_ACTIONS;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
