import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { sevenZipPath } from './binaries';
import { execFileSafe } from './exec';

const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'rar']);
const TARGETS = new Set(['extract-here', 'zip', 'tar', 'gz']);

export const archiveEngine: Engine = {
  id: 'archive',
  canHandle: (op, input) =>
    // Zip takes anything: files, folders, mixed selections.
    (op.kind === 'tool' && op.id === 'zip') ||
    (op.kind === 'convert' && ARCHIVE_EXTS.has(extensionOf(input)) && TARGETS.has(op.id)),
  async run(op, input, ctx) {
    const exe = sevenZipPath();
    if (!exe) throw new JobError('E_ENGINE_MISSING', '7-Zip');
    if (op.id === 'zip' && op.kind === 'tool') {
      const inputs = ctx.allInputs.length > 0 ? ctx.allInputs : [input];
      const sameDir = inputs.every((p) => dirname(p) === dirname(inputs[0] as string));
      // Relative names keep the archive free of absolute paths; a leading "./" stops a name starting with @
      // from being read as a list file, and "--" stops one starting with a dash from being read as a switch.
      const names = sameDir ? inputs.map((p) => `./${basename(p)}`) : inputs;
      const res = await execFileSafe(
        exe,
        ['a', '-tzip', '-mx=5', '-y', ctx.tempPath, '--', ...names],
        {
          signal: ctx.signal,
          cwd: sameDir ? dirname(inputs[0] as string) : undefined,
        },
      );
      if (res.code !== 0) {
        throw new JobError(
          /Permission|denied|being used/i.test(res.stderr) ? 'E_PERMISSION' : 'E_UNKNOWN',
          res.stderr.slice(-300),
        );
      }
      return;
    }
    const sevenZip = async (args: string[], cwd?: string): Promise<void> => {
      const res = await execFileSafe(exe, args, { signal: ctx.signal, cwd });
      if (res.code !== 0) {
        throw new JobError(
          /password|encrypted/i.test(res.stderr) ? 'E_PERMISSION' : 'E_CORRUPT_INPUT',
          res.stderr.slice(-300),
        );
      }
    };
    if (op.id === 'extract-here') {
      // -spe avoids doubling a top-level folder; 7-Zip also rejects entries that escape the target.
      await sevenZip(['x', '-y', '-spe', `-o${ctx.outDir}`, input]);
      // A .gz or .tar.gz extracts to a single .tar first; unpack that as well.
      const entries = await readdir(ctx.outDir);
      const only = entries.length === 1 ? entries[0] : undefined;
      if (only && extensionOf(only) === 'tar' && (await stat(join(ctx.outDir, only))).isFile()) {
        await sevenZip(['x', '-y', '-spe', `-o${ctx.outDir}`, join(ctx.outDir, only)]);
        await rm(join(ctx.outDir, only), { force: true });
      }
      return;
    }
    // Re-pack: extract to a scratch folder, then add its contents with the new format.
    const scratch = join(ctx.tempDir, '.extract');
    await mkdir(scratch, { recursive: true });
    try {
      await sevenZip(['x', '-y', '-spe', `-o${scratch}`, input]);
      // A .tar.gz extracts to a single .tar first; unwrap it so the repack sees the real files.
      const entries = await readdir(scratch);
      const only = entries.length === 1 ? entries[0] : undefined;
      if (only && extensionOf(only) === 'tar' && (await stat(join(scratch, only))).isFile()) {
        await sevenZip(['x', '-y', '-spe', `-o${scratch}`, join(scratch, only)]);
        await rm(join(scratch, only), { force: true });
      }
      const type = op.id === 'zip' ? '-tzip' : op.id === 'tar' ? '-ttar' : '-tgzip';
      if (op.id === 'gz') {
        // gzip holds one stream: tar the files, then gzip the tar.
        const tar = join(ctx.tempDir, 'bundle.tar');
        await sevenZip(['a', '-ttar', tar, '.'], scratch);
        await sevenZip(['a', '-tgzip', ctx.tempPath, tar]);
        await rm(tar, { force: true });
      } else {
        await sevenZip(['a', type, ctx.tempPath, '.'], scratch);
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
};
