import { z } from 'zod';

// Every IPC channel is declared here, once, with zod schemas (docs/02 section 7).
// No ad-hoc ipcRenderer.send strings anywhere else. Main validates every payload it receives.

export const WheelId = z.enum(['convert', 'tools', 'actions']);
export type WheelId = z.infer<typeof WheelId>;

export const ComboInput = z.object({
  modifiers: z.array(z.enum(['shift', 'ctrl', 'alt', 'meta'])).max(4),
  code: z.string().max(32),
});

const Path = z.string().min(1).max(32767);

export const ToolWindowName = z.enum([
  'trim',
  'split',
  'merge',
  'compress',
  'redact',
  'metadata',
  'edit',
  'crop',
  'add-bg',
  'annotate',
  'collage',
  'frames',
  'delete-pages',
  'upscale',
  'remove-bg',
  'password',
]);
export type ToolWindowName = z.infer<typeof ToolWindowName>;
const Verdict = z.object({
  status: z.enum(['ok', 'warning', 'blocked']),
  messages: z.array(z.string()),
  probe: z.enum(['free', 'taken', 'unknown']).optional(),
});

/** Request and response channels (renderer to main, via invoke). */
export const CHANNELS = {
  'settings:get': { request: z.undefined(), response: z.unknown() },
  'settings:set': {
    request: z.object({ patch: z.record(z.string(), z.unknown()) }),
    response: z.unknown(),
  },
  'settings:reset': { request: z.undefined(), response: z.unknown() },
  'settings:export': { request: z.undefined(), response: z.object({ ok: z.boolean() }) },
  'settings:import': {
    request: z.undefined(),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
  },
  'combo:validate': {
    request: z.object({ combo: ComboInput, wheelId: WheelId }),
    response: Verdict,
  },
  'combo:recheck': {
    request: z.undefined(),
    response: z.record(z.string(), Verdict),
  },
  'combo:test:toggle': { request: z.object({ on: z.boolean() }), response: z.void() },
  'overlay:drop': {
    request: z.object({
      wheelId: WheelId,
      wedgeId: z.string().min(1).max(64),
      paths: z.array(Path).min(1).max(5000),
    }),
    response: z.void(),
  },
  'overlay:cancel': {
    request: z.object({ reason: z.enum(['not-on-disk']).optional() }).optional(),
    response: z.void(),
  },
  'job:cancel': { request: z.object({ jobId: z.string().max(64) }), response: z.void() },
  'job:undo': { request: z.object({ jobId: z.string().max(64) }), response: z.void() },
  'job:reveal': { request: z.object({ jobId: z.string().max(64) }), response: z.void() },
  'toast:dismiss': { request: z.object({ id: z.string().max(64) }), response: z.void() },
  'dialog:pick-image': { request: z.undefined(), response: z.string().nullable() },
  'meta:read': {
    request: z.object({ path: Path }),
    response: z.record(z.string(), z.union([z.string(), z.number()])),
  },
  'detect:text': {
    request: z.object({ path: Path }),
    response: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
  },
  'detect:face-model': {
    request: z.undefined(),
    response: z.object({
      manifest: z.unknown(),
      weights: z.custom<Uint8Array>((v) => v instanceof Uint8Array),
    }),
  },
  'annotate:save': {
    request: z.object({
      sourcePath: Path,
      data: z.instanceof(Uint8Array).refine((d) => d.byteLength > 8 && d.byteLength < 250_000_000),
    }),
    response: z.void(),
  },
  'toolwin:run': {
    request: z.object({
      tool: ToolWindowName,
      paths: z.array(Path).min(1).max(500),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    }),
    response: z.void(),
  },
  'toolwin:probe': {
    request: z.object({ path: Path }),
    response: z.object({
      durationSec: z.number().nullable(),
      pages: z.number().nullable(),
      /** For PDFs and ZIPs: whether a password is needed to open them. Null when it cannot be told. */
      encrypted: z.boolean().nullable(),
    }),
  },
  'pdf:thumbs': {
    request: z.object({
      path: Path,
      from: z.number().int().min(1),
      count: z.number().int().min(1).max(40),
      width: z.number().int().min(80).max(400),
    }),
    response: z.object({
      pages: z.number(),
      thumbs: z.array(z.custom<Uint8Array>((v) => v instanceof Uint8Array)),
    }),
  },
  'toolwin:close': { request: z.undefined(), response: z.void() },
  'pdfrender:res': {
    request: z.object({
      id: z.number().int(),
      ok: z.boolean(),
      error: z.string().max(500).optional(),
      value: z.unknown().optional(),
    }),
    response: z.void(),
  },
  'float:list': {
    request: z.undefined(),
    response: z.array(z.object({ path: Path, name: z.string() })),
  },
  'float:remove': { request: z.object({ path: Path }), response: z.void() },
  'float:clear': { request: z.undefined(), response: z.void() },
  'float:drag': { request: z.object({ path: Path }), response: z.void() },
  'float:close': { request: z.undefined(), response: z.void() },
  'float:dock': {
    request: z.object({ edge: z.enum(['free', 'left', 'right', 'top', 'bottom']) }),
    response: z.void(),
  },
  'float:state': {
    request: z.undefined(),
    response: z.object({ edge: z.enum(['free', 'left', 'right', 'top', 'bottom']) }),
  },
  'dialog:pick-folder': { request: z.undefined(), response: z.string().nullable() },
  'shell:open-logs': { request: z.undefined(), response: z.void() },
  'engines:status': {
    request: z.undefined(),
    response: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        ready: z.boolean(),
        version: z.string().nullable(),
        optional: z.boolean(),
        detail: z.string().optional(),
      }),
    ),
  },
  'engines:detect-office': { request: z.undefined(), response: z.string().nullable() },
  'app:meta': {
    request: z.undefined(),
    response: z.object({
      version: z.string(),
      platform: z.string(),
      prefersDark: z.boolean(),
      firstRun: z.boolean(),
    }),
  },
  'app:licenses': { request: z.undefined(), response: z.string() },
  'app:onboarding': { request: z.object({ on: z.boolean() }), response: z.void() },
  'app:reset-first-run': { request: z.undefined(), response: z.void() },
  'app:first-run-done': { request: z.undefined(), response: z.void() },
  'app:sample-file': { request: z.undefined(), response: z.string() },
  'app:sample-drag': { request: z.undefined(), response: z.void() },
} as const;

/** Events pushed from main to renderers. */
export const EVENTS = {
  'settings:changed': z.unknown(),
  'overlay:open': z.object({
    wheelId: WheelId,
    anchor: z.object({ x: z.number(), y: z.number() }),
  }),
  'overlay:switch': z.object({ wheelId: WheelId }),
  'overlay:close': z.undefined(),
  'overlay:message': z.object({ text: z.string() }),
  'combo:test:event': z.object({ combo: z.string(), wheelId: WheelId.nullable() }),
  'toast:update': z.array(z.unknown()),
  'toolwin:init': z.object({
    tool: ToolWindowName,
    paths: z.array(Path),
  }),
  'pdfrender:req': z.object({
    id: z.number().int(),
    op: z.enum(['open', 'size', 'image', 'text', 'images', 'cleanup', 'close']),
    doc: z.number().int().optional(),
    n: z.number().int().optional(),
    scale: z.number().optional(),
    format: z.enum(['png', 'jpg']).optional(),
    data: z.custom<Uint8Array>((v) => v instanceof Uint8Array).optional(),
  }),
  'loader:update': z.object({
    percent: z.number().min(0).max(100),
    indeterminate: z.boolean(),
    count: z.number(),
  }),
  'float:changed': z.array(z.object({ path: Path, name: z.string() })),
} as const;

export type ChannelName = keyof typeof CHANNELS;

export { WINDOW_ACCESS, type PageName } from './access';
export type EventName = keyof typeof EVENTS;
export type Request<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['request']>;
export type Response<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['response']>;
export type Verdict = z.infer<typeof Verdict>;

/** Parses an untrusted payload; throws a ZodError that main logs and rejects. */
export function parseRequest<C extends ChannelName>(channel: C, payload: unknown): Request<C> {
  return CHANNELS[channel].request.parse(payload) as Request<C>;
}
