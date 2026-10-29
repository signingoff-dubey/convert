// All user-facing text lives here (English only in v1).

export const STRINGS = {
  hints: {
    mixedCategories: 'Select one type',
    folder: 'Folders can only use Actions',
    unknownType: "Convert can't handle this file type",
    noTools: 'No tools for this file type',
    notOnDisk: "This item isn't a file on disk.",
    needsOne: 'Select a single file',
    needsMany: 'Select two or more files',
  },
  combo: {
    noModifier: 'Add a modifier key (Shift, Ctrl or Alt).',
    tooManyModifiers: 'Use at most two modifier keys.',
    winKey: 'The Windows key is reserved by Windows.',
    badMainKey: 'Use a letter, a digit or an F-key as the main key.',
    modifierMainKey: 'The main key cannot be a modifier.',
    reserved: 'This combo is reserved by Windows or is a very common app shortcut.',
    duplicate: 'Another Convert wheel already uses this combo.',
    functionKey: 'Many apps use F-keys heavily.',
    usesAlt: 'Alt can open menus or switch the keyboard layout (Alt+Shift).',
    taken: (combo: string) =>
      `Another app has registered ${combo} system-wide. It may also react while you use Convert. Pick a different combo or continue anyway.`,
    cannotCheck: "Can't check this key against registered system hotkeys.",
    probeNote: 'Checked against registered system hotkeys. Some apps can’t be detected.',
  },
  errors: {
    pathTooLong: 'The output path is too long for Windows.',
  },
} as const;
