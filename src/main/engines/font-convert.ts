import { readFile, writeFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { nodeRequire } from './req';

const INPUTS = new Set(['ttf', 'otf', 'woff', 'woff2']);
const OUTPUTS = new Set(['ttf', 'woff', 'woff2']);

interface FontLib {
  Font: {
    create(
      data: Buffer | ArrayBuffer,
      options: { type: string; hinting?: boolean },
    ): { write(o: { type: string; toBuffer?: boolean }): Buffer };
  };
  woff2: { init(): Promise<unknown> };
}

/** TTF, OTF, WOFF and WOFF2 into TTF, WOFF or WOFF2. Glyph outlines are kept; hinting is kept for TrueType. */
export const fontEngine: Engine = {
  id: 'font',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    INPUTS.has(extensionOf(input)) &&
    OUTPUTS.has(op.id) &&
    extensionOf(input) !== op.id,
  async run(op, input, ctx) {
    const lib = nodeRequire('fonteditor-core') as FontLib;
    const from = extensionOf(input);
    if (from === 'woff2' || op.id === 'woff2') await lib.woff2.init();
    const bytes = await readFile(input);
    try {
      const font = lib.Font.create(bytes, { type: from, hinting: true });
      await writeFile(ctx.tempPath, font.write({ type: op.id, toBuffer: true }));
    } catch (error) {
      throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'font');
    }
  },
};
