export interface GatingSettings {
  limitToExplorerAndDesktop: boolean;
  allowedWindowClasses: readonly string[];
}

/** Whether a mouse-down on a window of this root class may start a drag session (docs/02 section 4.2). */
export function isSourceAllowed(rootClass: string | null, general: GatingSettings): boolean {
  if (!general.limitToExplorerAndDesktop) return true;
  if (rootClass === null) return false;
  return general.allowedWindowClasses.includes(rootClass);
}
