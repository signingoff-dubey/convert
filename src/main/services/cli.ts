/** What Convert was asked to do from the command line or from Explorer's Send to menu. */
export interface CliRequest {
  /** A convert format such as "pdf", and the files to convert. */
  convert?: { target: string; files: string[] };
}

/**
 * Reads `--convert <format> <file> [<file> ...]` (or `--convert=<format>`). Everything after the format that is
 * not a flag is a file, which is how Explorer's Send to passes a selection. Anything else is ignored.
 */
export function parseCli(argv: readonly string[]): CliRequest {
  const at = argv.findIndex((a) => a === '--convert' || a.startsWith('--convert='));
  if (at < 0) return {};
  let target: string | undefined;
  let rest: readonly string[];
  const first = argv[at] as string;
  if (first.includes('=')) {
    target = first.slice('--convert='.length);
    rest = argv.slice(at + 1);
  } else {
    target = argv[at + 1];
    rest = argv.slice(at + 2);
  }
  if (!target || !/^[a-z0-9-]{1,32}$/i.test(target)) return {};
  const files = rest.filter((a) => !a.startsWith('--'));
  return files.length > 0 ? { convert: { target: target.toLowerCase(), files } } : {};
}
