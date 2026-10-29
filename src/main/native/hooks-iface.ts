export interface MouseHookEvent {
  x: number;
  y: number;
  /** 1 is the left button. */
  button: number;
}

export interface KeyHookEvent {
  keycode: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** Global input source. The uiohook implementation is the only one that imports the native module. */
export interface HookSource {
  onMouseDown(cb: (e: MouseHookEvent) => void): void;
  onMouseUp(cb: (e: MouseHookEvent) => void): void;
  onMouseMove(cb: (e: MouseHookEvent) => void): void;
  onKeyDown(cb: (e: KeyHookEvent) => void): void;
  start(): void;
  /** Removes the hooks entirely (Pause). */
  stop(): void;
}
