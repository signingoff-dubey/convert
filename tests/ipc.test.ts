import { describe, expect, it } from 'vitest';
import { parseRequest } from '../src/shared/ipc';

describe('ipc payloads', () => {
  it('accepts a valid drop', () => {
    const r = parseRequest('overlay:drop', {
      wheelId: 'convert',
      wedgeId: 'png',
      paths: ['C:\\a.png'],
    });
    expect(r.paths).toHaveLength(1);
  });
  it('rejects empty, oversized and malformed payloads', () => {
    expect(() =>
      parseRequest('overlay:drop', { wheelId: 'convert', wedgeId: 'png', paths: [] }),
    ).toThrow();
    expect(() =>
      parseRequest('overlay:drop', { wheelId: 'nope', wedgeId: 'png', paths: ['a'] }),
    ).toThrow();
    expect(() => parseRequest('overlay:drop', 'x')).toThrow();
    expect(() => parseRequest('toolwin:run', { tool: 'rm', paths: ['a'], params: {} })).toThrow();
    expect(() => parseRequest('job:undo', { jobId: 'x'.repeat(100) })).toThrow();
  });
  it('takes no payload for argument-free channels', () => {
    expect(parseRequest('settings:get', undefined)).toBeUndefined();
    expect(() => parseRequest('settings:get', { a: 1 })).toThrow();
  });
});
