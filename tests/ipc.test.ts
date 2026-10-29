import { describe, expect, it } from 'vitest';
import { parseRequest } from '../src/shared/ipc';

describe('ipc payloads', () => {
  it('accepts a valid drop', () => {
    expect(
      parseRequest('overlay:drop', { wheelId: 'convert', wedgeId: 'png', paths: ['C:\\a.png'] })
        .paths,
    ).toHaveLength(1);
  });
  it('rejects empty, oversized and malformed payloads', () => {
    expect(() =>
      parseRequest('overlay:drop', { wheelId: 'convert', wedgeId: 'png', paths: [] }),
    ).toThrow();
    expect(() =>
      parseRequest('overlay:drop', { wheelId: 'nope', wedgeId: 'png', paths: ['a'] }),
    ).toThrow();
    expect(() => parseRequest('overlay:drop', 'x')).toThrow();
    expect(() =>
      parseRequest('overlay:open', {
        wheelId: 'tools',
        items: Array(8).fill({ id: 'a', label: 'a', enabled: true }),
        theme: 't',
        anchor: { x: 0, y: 0 },
      }),
    ).toThrow();
  });
});
