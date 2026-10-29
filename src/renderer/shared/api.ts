import type { ChannelName, EventName, Request, Response } from '../../shared/ipc';

/** The preload's allow-listed bridge. Types come from the single channel table in shared/ipc.ts. */
interface Bridge {
  platform: string;
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  on(event: string, callback: (payload: unknown) => void): () => void;
  pathForFile(file: File): string;
}

declare global {
  interface Window {
    convert: Bridge;
  }
}

export function invoke<C extends ChannelName>(
  channel: C,
  ...args: undefined extends Request<C> ? [payload?: Request<C>] : [payload: Request<C>]
): Promise<Response<C>> {
  return window.convert.invoke(channel, args[0]) as Promise<Response<C>>;
}

export function on<T = unknown>(event: EventName, callback: (payload: T) => void): () => void {
  return window.convert.on(event, callback as (payload: unknown) => void);
}

export const pathForFile = (file: File): string => window.convert.pathForFile(file);

/** URL the preview protocol serves for a file this window was opened with. */
export const previewSrc = (filePath: string): string =>
  `convert-file://local/${encodeURIComponent(filePath)}`;
