export interface GatingSettings {
  limitToExplorerAndDesktop: boolean;
  allowedWindowClasses: readonly string[];
  /** Also allow drags that start in a web browser (a picture on a web page). */
  dragFromBrowsers?: boolean;
}

/** Chrome, Edge, Brave and other Chromium browsers, and Firefox. */
export const BROWSER_CLASSES = ['Chrome_WidgetWin_1', 'MozillaWindowClass'] as const;

/** Whether a mouse-down on a window of this root class may start a drag session (docs/02 section 4.2). */
export function isSourceAllowed(rootClass: string | null, general: GatingSettings): boolean {
  if (!general.limitToExplorerAndDesktop) return true;
  if (rootClass === null) return false;
  if (general.dragFromBrowsers && (BROWSER_CLASSES as readonly string[]).includes(rootClass))
    return true;
  return general.allowedWindowClasses.includes(rootClass);
}
