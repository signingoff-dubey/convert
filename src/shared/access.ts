/** Which channels and events each window may use. Kept free of heavy imports: the preload bundles it. */
export type PageName = 'overlay' | 'settings' | 'toast' | 'toolwin' | 'float';

/** Which channels and events each window may use. Enforced in the preload and again in main. */
export const WINDOW_ACCESS: Record<PageName, { invoke: readonly string[]; on: readonly string[] }> =
  {
    overlay: {
      invoke: ['overlay:drop', 'overlay:cancel', 'settings:get', 'app:meta'],
      on: [
        'overlay:open',
        'overlay:switch',
        'overlay:close',
        'overlay:message',
        'settings:changed',
      ],
    },
    settings: {
      invoke: [
        'settings:get',
        'settings:set',
        'settings:reset',
        'settings:export',
        'settings:import',
        'combo:validate',
        'combo:recheck',
        'combo:test:toggle',
        'dialog:pick-folder',
        'shell:open-logs',
        'engines:status',
        'engines:detect-office',
        'app:meta',
        'app:licenses',
        'app:onboarding',
        'app:reset-first-run',
        'app:first-run-done',
        'app:sample-file',
      ],
      on: ['settings:changed', 'combo:test:event'],
    },
    toast: {
      invoke: [
        'job:cancel',
        'job:undo',
        'job:reveal',
        'toast:dismiss',
        'shell:open-logs',
        'settings:get',
      ],
      on: ['toast:update', 'settings:changed'],
    },
    toolwin: {
      invoke: [
        'toolwin:run',
        'toolwin:probe',
        'toolwin:close',
        'settings:get',
        'dialog:pick-image',
        'meta:read',
        'detect:text',
        'detect:face-model',
        'annotate:save',
      ],
      on: ['toolwin:init', 'settings:changed'],
    },
    float: {
      invoke: [
        'float:list',
        'float:remove',
        'float:clear',
        'float:drag',
        'float:close',
        'settings:get',
      ],
      on: ['float:changed', 'settings:changed'],
    },
  };
