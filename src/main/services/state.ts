import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type DockEdge = 'free' | 'left' | 'right' | 'top' | 'bottom';

export interface HistoryEntry {
  id: string;
  /** Name of the file or folder that was created. */
  name: string;
  output: string;
  input: string;
  /** What was done, such as "png" or "merge". */
  op: string;
  at: number;
  /** How many files or folders the job created. */
  count: number;
}

interface StateFile {
  history: HistoryEntry[];
  firstRunDone: boolean;
  recentFolders: string[];
  floatDock: DockEdge;
}

const MAX_RECENT = 8;
const MAX_HISTORY = 100;

function isEntry(v: unknown): v is HistoryEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.output === 'string' &&
    typeof e.input === 'string' &&
    typeof e.op === 'string' &&
    typeof e.at === 'number' &&
    typeof e.count === 'number'
  );
}

/** Small non-settings state: first-run flag and recent Copy/Move folders. */
export class AppState {
  private data: StateFile = {
    history: [],
    firstRunDone: false,
    recentFolders: [],
    floatDock: 'right',
  };
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = join(dir, 'state.json');
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof raw === 'object' && raw !== null) {
        const r = raw as Partial<StateFile>;
        this.data = {
          history: Array.isArray(r.history) ? r.history.filter(isEntry).slice(0, MAX_HISTORY) : [],
          firstRunDone: r.firstRunDone === true,
          recentFolders: Array.isArray(r.recentFolders)
            ? r.recentFolders.filter((f): f is string => typeof f === 'string').slice(0, MAX_RECENT)
            : [],
          floatDock:
            (['free', 'left', 'right', 'top', 'bottom'] as const).find((e) => e === r.floatDock) ??
            'right',
        };
      }
    } catch {
      // Missing or unreadable: first run.
    }
  }

  get history(): HistoryEntry[] {
    return [...this.data.history];
  }

  addHistory(entry: HistoryEntry): void {
    this.data.history = [entry, ...this.data.history.filter((h) => h.id !== entry.id)].slice(
      0,
      MAX_HISTORY,
    );
    this.save();
  }

  clearHistory(): void {
    this.data.history = [];
    this.save();
  }

  get firstRunDone(): boolean {
    return this.data.firstRunDone;
  }

  setFirstRunDone(done: boolean): void {
    this.data.firstRunDone = done;
    this.save();
  }

  get floatDock(): DockEdge {
    return this.data.floatDock;
  }

  setFloatDock(edge: DockEdge): void {
    this.data.floatDock = edge;
    this.save();
  }

  recentFolders = {
    get: (): string[] => [...this.data.recentFolders],
    add: (folder: string): void => {
      this.data.recentFolders = [
        folder,
        ...this.data.recentFolders.filter((f) => f !== folder),
      ].slice(0, MAX_RECENT);
      this.save();
    },
  };

  private save(): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    } catch {
      // Losing recent folders is harmless.
    }
  }
}
