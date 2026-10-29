import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface StateFile {
  firstRunDone: boolean;
  recentFolders: string[];
}

const MAX_RECENT = 8;

/** Small non-settings state: first-run flag and recent Copy/Move folders. */
export class AppState {
  private data: StateFile = { firstRunDone: false, recentFolders: [] };
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = join(dir, 'state.json');
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof raw === 'object' && raw !== null) {
        const r = raw as Partial<StateFile>;
        this.data = {
          firstRunDone: r.firstRunDone === true,
          recentFolders: Array.isArray(r.recentFolders)
            ? r.recentFolders.filter((f): f is string => typeof f === 'string').slice(0, MAX_RECENT)
            : [],
        };
      }
    } catch {
      // Missing or unreadable: first run.
    }
  }

  get firstRunDone(): boolean {
    return this.data.firstRunDone;
  }

  setFirstRunDone(done: boolean): void {
    this.data.firstRunDone = done;
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
