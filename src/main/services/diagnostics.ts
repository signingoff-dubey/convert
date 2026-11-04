import { readFileSync } from 'node:fs';
import { homedir, release } from 'node:os';
import path from 'node:path';
import type { Settings } from '../settings/schema';
import type { EngineStatus } from '../engines/status';
import { logDir } from './log';

/** The user's folders and name are replaced, so a report can be shared without showing where things are. */
export function scrub(text: string, home = homedir()): string {
  const variants = new Set([home, home.replace(/\\/g, '/')]);
  let out = text;
  for (const h of variants) if (h.length > 3) out = out.split(h).join('~');
  return out.replace(/([A-Za-z]:\\Users\\)[^\\\s]+/g, '$1<user>');
}

export interface DiagnosticsInput {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  packaged: boolean;
  engines: EngineStatus[];
  settings: Settings;
  updateState: string;
  logTail?: string;
}

/** A plain-text report for a bug report: versions, what works, which options are on, and the last log lines. */
export function buildDiagnostics(d: DiagnosticsInput): string {
  const s = d.settings;
  const lines = [
    `Convert ${d.version} (${d.packaged ? 'installed' : 'development'})`,
    `Windows ${release()} · ${process.arch} · Electron ${d.electron} · Chromium ${d.chrome} · Node ${d.node}`,
    '',
    'Engines',
    ...d.engines.map(
      (e) =>
        `  ${e.ready ? 'ok     ' : e.optional ? 'absent ' : 'MISSING'} ${e.label}${e.version ? ` ${e.version}` : ''}`,
    ),
    '',
    'Options',
    `  start with Windows: ${s.general.startWithWindows} · background: ${s.general.runInBackground} · send to: ${s.general.sendTo}`,
    `  auto update: ${s.general.autoUpdate} (${d.updateState}) · drag from browsers: ${s.general.dragFromBrowsers} · share browser: ${s.general.shareBrowser}`,
    `  only Explorer and desktop: ${s.general.limitToExplorerAndDesktop} · paused: ${s.general.paused}`,
    `  watch folders: ${s.watch.rules.length} · output: ${s.output.location}${s.output.useConvertedSubfolder ? ' + subfolder' : ''}`,
    `  triggers: ${(['convert', 'tools', 'actions', 'share'] as const).map((w) => `${w}=${s.triggers[w].modifiers.join('+')}+${s.triggers[w].code}`).join(' ')}`,
  ];
  if (d.logTail) lines.push('', 'Last log lines', ...d.logTail.split('\n').map((l) => `  ${l}`));
  return scrub(lines.join('\n'));
}

/** The last lines of the log, or nothing when there is no log yet. */
export function readLogTail(count = 60): string {
  const dir = logDir();
  if (!dir) return '';
  try {
    const all = readFileSync(path.join(dir, 'convert.log'), 'utf8').trimEnd().split('\n');
    return all.slice(-count).join('\n');
  } catch {
    return '';
  }
}
