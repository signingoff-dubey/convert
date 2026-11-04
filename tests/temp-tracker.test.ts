import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TempTracker } from '../src/main/services/temp-tracker';

const root = mkdtempSync(join(tmpdir(), 'convert-temp-'));
afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file.
  }
});

describe('leftover scratch folders', () => {
  it('removes recorded scratch folders after a crash, and nothing else', async () => {
    const record = join(root, 'record.json');
    const mine = join(root, '~convert-1a2b3c4d');
    const notMine = join(root, 'Holiday photos');
    const lookalike = join(root, '~convert-notahexid');
    for (const d of [mine, notMine, lookalike]) mkdirSync(join(d, 'out'), { recursive: true });
    writeFileSync(join(mine, 'out', 'half.tmp'), 'x');
    const before = new TempTracker(record);
    for (const d of [mine, notMine, lookalike]) before.add(d); // a record can never be trusted blindly
    // The app dies here. A new run reads the record.
    const after = new TempTracker(record);
    expect(await after.sweep()).toBe(1);
    expect(existsSync(mine)).toBe(false);
    expect(existsSync(notMine)).toBe(true);
    expect(existsSync(lookalike)).toBe(true);
    expect(await new TempTracker(record).sweep()).toBe(0); // the record was cleared
  });

  it('forgets a folder that finished cleanly, and survives a missing or broken record', async () => {
    const record = join(root, 'two.json');
    const t = new TempTracker(record);
    const dir = join(root, '~convert-deadbeef');
    mkdirSync(dir);
    t.add(dir);
    t.remove(dir);
    expect(await new TempTracker(record).sweep()).toBe(0);
    expect(existsSync(dir)).toBe(true);
    writeFileSync(join(root, 'bad.json'), '{not json');
    expect(await new TempTracker(join(root, 'bad.json')).sweep()).toBe(0);
    expect(await new TempTracker(join(root, 'absent.json')).sweep()).toBe(0);
  });
});
