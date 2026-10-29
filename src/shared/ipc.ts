import { z } from 'zod';

// Every IPC channel is declared here, once, with zod schemas for request and response.
// No ad-hoc ipcRenderer.send strings anywhere else (docs/02 section 7).

export const WheelId = z.enum(['convert', 'tools', 'actions']);

const ComboInput = z.object({
  modifiers: z.array(z.enum(['shift', 'ctrl', 'alt', 'meta'])).max(4),
  code: z.string().max(32),
});

export const CHANNELS = {
  'overlay:open': {
    request: z.object({
      wheelId: WheelId,
      items: z.array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean() })).max(7),
      theme: z.string(),
      anchor: z.object({ x: z.number(), y: z.number() }),
    }),
    response: z.void(),
  },
  'overlay:drop': {
    request: z.object({
      wheelId: WheelId,
      wedgeId: z.string().min(1).max(64),
      paths: z.array(z.string().min(1).max(32767)).min(1).max(5000),
    }),
    response: z.void(),
  },
  'overlay:cancel': { request: z.object({}), response: z.void() },
  'combo:validate': {
    request: z.object({ combo: ComboInput, wheelId: WheelId }),
    response: z.object({
      status: z.enum(['ok', 'warning', 'blocked']),
      messages: z.array(z.string()),
    }),
  },
} as const;

export type ChannelName = keyof typeof CHANNELS;
export type Request<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['request']>;
export type Response<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['response']>;

/** Parses an untrusted payload; throws a ZodError that main logs and rejects. */
export function parseRequest<C extends ChannelName>(channel: C, payload: unknown): Request<C> {
  return CHANNELS[channel].request.parse(payload) as Request<C>;
}
