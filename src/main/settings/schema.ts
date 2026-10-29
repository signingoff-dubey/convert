import { z } from 'zod';

export const Combo = z.object({
  modifiers: z
    .array(z.enum(['shift', 'ctrl', 'alt']))
    .min(1)
    .max(2),
  code: z.string().regex(/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/),
});

export const Settings = z.object({
  version: z.literal(1),
  general: z.object({
    startWithWindows: z.boolean().default(true),
    limitToExplorerAndDesktop: z.boolean().default(true),
    paused: z.boolean().default(false),
    allowedWindowClasses: z.array(z.string()).default(['CabinetWClass', 'Progman', 'WorkerW']),
  }),
  triggers: z.object({
    convert: Combo.default({ modifiers: ['shift'], code: 'KeyC' }),
    tools: Combo.default({ modifiers: ['shift'], code: 'KeyT' }),
    actions: Combo.default({ modifiers: ['shift'], code: 'KeyA' }),
  }),
  appearance: z.object({
    theme: z.enum(['system', 'graphite', 'paper', 'midnight']).default('system'),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#7C5CFF'),
    wheelStyle: z.enum(['glass', 'solid', 'outline']).default('glass'),
    wheelSize: z.enum(['s', 'm', 'l']).default('m'),
    wheelOpacity: z.number().min(0.5).max(1).default(0.92),
    animations: z.enum(['full', 'reduced', 'off']).default('full'),
  }),
  wheels: z.object({
    order: z.record(z.string(), z.array(z.string())).default({}),
    disabled: z.record(z.string(), z.array(z.string())).default({}),
  }),
  output: z.object({
    location: z.enum(['nextToSource', 'custom']).default('nextToSource'),
    customFolder: z.string().nullable().default(null),
    useConvertedSubfolder: z.boolean().default(false),
    recycleOriginal: z.boolean().default(false),
    toastPosition: z.enum(['bottomRight', 'bottomLeft', 'topRight']).default('bottomRight'),
    toastSeconds: z.number().min(2).max(15).default(6),
    imageQuality: z.number().min(40).max(100).default(85),
    resizePreset: z.enum(['50%', '75%', '1080p', '720p']).default('50%'),
    compressTargetPercent: z.number().min(10).max(90).default(50),
    preferredShell: z.enum(['wt', 'powershell', 'cmd']).default('wt'),
  }),
  engines: z.object({ officeEnginePath: z.string().nullable().default(null) }),
  advanced: z.object({ logLevel: z.enum(['error', 'info', 'debug']).default('info') }),
});

export type Combo = z.infer<typeof Combo>;
export type Settings = z.infer<typeof Settings>;

export function defaultSettings(): Settings {
  return Settings.parse({
    version: 1,
    general: {},
    triggers: {},
    appearance: {},
    wheels: {},
    output: {},
    engines: {},
    advanced: {},
  });
}
