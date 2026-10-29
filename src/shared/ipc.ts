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
  'combo:test:toggle': { request: z.object({ on: z.boolean() }), response: z.undefined() },
  'overlay:drop': {
    request: z.object({
      wheelId: WheelId,
      wedgeId: z.string().min(1).max(64),
      paths: z.array(Path).min(1).max(5000),
    }),
    response: z.undefined(),
  },
  'overlay:cancel': { request: z.undefined(), response: z.undefined() },
  'job:cancel': { request: z.object({ jobId: z.string().max(64) }), response: z.undefined() },
  'job:undo': { request: z.object({ jobId: z.string().max(64) }), response: z.undefined() },
  'job:reveal': { request: z.object({ jobId: z.string().max(64) }), response: z.undefined() },
  'toolwin:run': {
    request: z.object({
      tool: z.enum(['trim', 'split', 'merge']),
      paths: z.array(Path).min(1).max(500),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    }),
    response: z.undefined(),
  },
  'toolwin:probe': {
    request: z.object({ path: Path }),
    response: z.object({ durationSec: z.number().nullable(), pages: z.number().nullable() }),
  },
  'toolwin:close': { request: z.undefined(), response: z.undefined() },
  'float:list': {
    request: z.undefined(),
    response: z.array(z.object({ path: Path, name: z.string() })),
  },
  'float:remove': { request: z.object({ path: Path }), response: z.undefined() },
  'float:clear': { request: z.undefined(), response: z.undefined() },
  'float:drag': { request: z.object({ path: Path }), response: z.undefined() },
  'float:close': { request: z.undefined(), response: z.undefined() },
  'dialog:pick-folder': { request: z.undefined(), response: z.string().nullable() },
  'shell:open-logs': { request: z.undefined(), response: z.undefined() },
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
    response: z.object({ version: z.string(), platform: z.string(), prefersDark: z.boolean() }),
  },
  'app:licenses': { request: z.undefined(), response: z.string() },
  'app:reset-first-run': { request: z.undefined(), response: z.undefined() },
  'app:first-run-done': { request: z.undefined(), response: z.undefined() },
  'app:sample-file': { request: z.undefined(), response: z.string() },
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
    tool: z.enum(['trim', 'split', 'merge']),
    paths: z.array(Path),
  }),
  'float:changed': z.array(z.object({ path: Path, name: z.string() })),
} as const;

export type ChannelName = keyof typeof CHANNELS;
export type EventName = keyof typeof EVENTS;
export type Request<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['request']>;
export type Response<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['response']>;
export type Verdict = z.infer<typeof Verdict>;

/** Parses an untrusted payload; throws a ZodError that main logs and rejects. */
export function parseRequest<C extends ChannelName>(channel: C, payload: unknown): Request<C> {
  return CHANNELS[channel].request.parse(payload) as Request<C>;
}
