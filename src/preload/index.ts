import type { PageName } from '../shared/access';
import { expose } from './bridge';

const PAGES: readonly PageName[] = ['overlay', 'settings', 'toast', 'toolwin', 'float'];
const arg = process.argv.find((a) => a.startsWith('--convert-page='))?.split('=')[1];
const page = PAGES.find((p) => p === arg);

// A window launched without a known page name gets no bridge at all.
if (page) expose(page);
