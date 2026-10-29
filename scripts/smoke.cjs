// UI smoke test: starts the built app in a throwaway profile and checks the windows, the IPC allow-list
// and three real jobs started from tool windows. Needs the `playwright` package (npm i -D playwright).
//   Windows or macOS:  npm run build && node scripts/smoke.cjs
//   Linux:             npm run build && xvfb-run -a node scripts/smoke.cjs
const { _electron: electron } = require('playwright');
const { mkdtempSync, mkdirSync, readdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require('sharp');

const root = join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

async function launch(dir, extraArgs) {
  const profile = mkdtempSync(join(tmpdir(), 'convert-profile-'));
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['--no-sandbox', '--disable-gpu', join(root, 'out/main/index.js'), ...extraArgs],
    env: {
      ...process.env,
      HOME: profile,
      APPDATA: profile,
      XDG_CONFIG_HOME: join(profile, '.config'),
    },
    cwd: root,
  });
  await app.firstWindow();
  await wait(2500);
  return app;
}
const windowOf = (app, part) => app.windows().find((w) => w.url().includes(part));

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'convert-smoke-'));
  mkdirSync(dir, { recursive: true });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#2a9d8f"/><text x="40" y="220" font-size="64" fill="#fff">HELLO TEXT</text></svg>';
  for (const n of ['a.png', 'b.png'])
    writeFileSync(join(dir, n), await sharp(Buffer.from(svg)).png().toBuffer());

  let app = await launch(dir, ['--hidden']);
  const settings = windowOf(app, 'settings.html');
  check('settings window opens on first run', !!settings);
  check(
    'onboarding is shown',
    (await settings.getByRole('button', { name: 'Skip' }).count()) === 1,
  );
  const blocked = await settings.evaluate(() =>
    window.convert.invoke('toolwin:run', {}).then(
      () => 'allowed',
      (e) => e.message,
    ),
  );
  check('forbidden channel is blocked', /blocked/.test(blocked), blocked);
  await settings.getByRole('button', { name: 'Skip' }).click();
  for (const page of [
    'General',
    'Triggers',
    'Appearance',
    'Wheels',
    'Features',
    'Output',
    'Engines',
    'Advanced',
    'About',
  ]) {
    await settings.getByRole('button', { name: page, exact: true }).click();
    await wait(300);
    check(`page ${page} renders`, (await settings.locator('main h1').innerText()) === page);
  }
  await app.close();

  app = await launch(dir, ['--hidden', `--dev-tool=crop:${join(dir, 'a.png')}`]);
  await windowOf(app, 'toolwin.html').getByRole('button', { name: 'Crop', exact: true }).click();
  await wait(2500);
  check(
    'crop writes a result',
    readdirSync(dir).some((f) => f.includes('-cropped')),
  );
  await app.close();

  app = await launch(dir, ['--hidden', `--dev-tool=redact:${join(dir, 'b.png')}`]);
  const redact = windowOf(app, 'toolwin.html');
  await redact.getByRole('button', { name: 'Detect text' }).click();
  await wait(6000);
  check(
    'redact finds text offline',
    /Found \d+ word/.test(
      await redact
        .getByRole('status')
        .innerText()
        .catch(() => ''),
    ),
  );
  await redact.getByRole('button', { name: 'Redact', exact: true }).click();
  await wait(3000);
  check(
    'redact writes a result',
    readdirSync(dir).some((f) => f.includes('-redacted')),
  );
  await app.close();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
