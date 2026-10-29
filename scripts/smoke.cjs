// UI smoke test: starts the built app in a throwaway profile and checks the windows, the IPC allow-list
// and three real jobs started from tool windows. Needs the `playwright` package (npm i -D playwright).
//   Windows or macOS:  npm run build && node scripts/smoke.cjs
//   Linux:             npm run build && xvfb-run -a node scripts/smoke.cjs
const { _electron: electron } = require('playwright');
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
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

  // ---- multi-file tools
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage([300, 200]).drawText(`page ${i + 1}`, { x: 20, y: 100 });
  const pdf = join(dir, 'doc.pdf');
  writeFileSync(pdf, await doc.save());
  const has = (part) => readdirSync(dir).find((f) => f.includes(part));

  app = await launch(dir, ['--hidden', `--dev-tool=delete-pages:${pdf}`]);
  let win = windowOf(app, 'toolwin.html');
  await win.getByRole('button', { name: 'Page 4, kept' }).waitFor({ timeout: 15000 });
  await win.getByRole('button', { name: 'Page 2, kept' }).click();
  check(
    'delete pages counts what is kept',
    (await win.getByText('Keeping 3 of 4 pages').count()) === 1,
  );
  if (process.env.SMOKE_SHOTS)
    await win.screenshot({ path: join(process.env.SMOKE_SHOTS, 'delete-pages.png') });
  await win.getByRole('button', { name: 'Save new PDF' }).click();
  await wait(2500);
  const edited = has('doc-edited.pdf');
  check(
    'delete pages writes a PDF with the kept pages',
    !!edited &&
      (
        await PDFDocument.load(require('node:fs').readFileSync(join(dir, edited)))
      ).getPageCount() === 3,
  );
  await app.close();

  app = await launch(dir, ['--hidden', `--dev-tool=password:${pdf}`]);
  win = windowOf(app, 'toolwin.html');
  await win.getByLabel('New password').fill('open sesame');
  await win.getByLabel('Type it again').fill('open sesame');
  await win.getByRole('button', { name: 'Add password' }).click();
  await wait(2500);
  check('password writes a protected PDF', !!has('doc-protected.pdf'));
  await app.close();

  app = await launch(dir, [
    '--hidden',
    `--dev-tool=upscale:${join(dir, 'a.png')}|${join(dir, 'b.png')}`,
  ]);
  win = windowOf(app, 'toolwin.html');
  await win.getByRole('button', { name: 'Upscale 2 images' }).click();
  await wait(3000);
  check('upscale writes a result for each image', !!has('a-2x.png') && !!has('b-2x.png'));
  await app.close();

  app = await launch(dir, ['--hidden', `--dev-tool=remove-bg:${join(dir, 'a.png')}`]);
  win = windowOf(app, 'toolwin.html');
  await wait(1500);
  if (process.env.SMOKE_SHOTS)
    await win.screenshot({ path: join(process.env.SMOKE_SHOTS, 'remove-bg.png') });
  await win.getByRole('button', { name: 'Remove background' }).click();
  await wait(3000);
  check('remove background writes a PNG', !!has('a-nobg.png'));
  await app.close();

  writeFileSync(join(dir, 'x1.md'), '# One');
  writeFileSync(join(dir, 'x2.md'), '# Two');
  app = await launch(dir, [
    '--hidden',
    `--dev-tool=merge:${join(dir, 'x1.md')}|${join(dir, 'x2.md')}`,
  ]);
  win = windowOf(app, 'toolwin.html');
  await win.getByRole('button', { name: 'Merge', exact: true }).click();
  await wait(2500);
  check('merge joins Markdown files', !!has('x1-merged.md'));
  await app.close();

  // ---- conversions that run in the packaged app's own engines (PDF reader window, OCR, printing)
  const textSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300"><rect width="1400" height="300" fill="#fff"/><text x="40" y="170" font-family="sans-serif" font-weight="bold" font-size="90" fill="#000">HELLO WORLD</text></svg>';
  writeFileSync(join(dir, 'scan.png'), await sharp(Buffer.from(textSvg)).png().toBuffer());
  const job = async (spec, ms = 4000) => {
    const a = await launch(dir, ['--hidden', `--dev-job=${spec}`]);
    await wait(ms);
    await a.close();
  };
  await job(`convert:png:${pdf}`);
  check(
    'pdf converts to page pictures in the app',
    readdirSync(dir).filter((f) => /^doc.*\.png$/.test(f)).length === 4,
  );
  await job(`convert:txt:${pdf}`);
  check(
    'pdf converts to text in the app',
    /page 3/.test(readFileSync(join(dir, 'doc.txt'), 'utf8')),
  );
  await job(`convert:txt:${join(dir, 'scan.png')}`, 9000);
  check(
    'a picture is read into text by OCR in the app',
    existsSync(join(dir, 'scan.txt')) && /HELLO/i.test(readFileSync(join(dir, 'scan.txt'), 'utf8')),
  );
  writeFileSync(join(dir, 'notes.md'), '# Notes\n\nSome *Markdown* text.\n');
  await job(`convert:pdf:${join(dir, 'notes.md')}`);
  const printed = existsSync(join(dir, 'notes.pdf'))
    ? readFileSync(join(dir, 'notes.pdf'))
    : Buffer.alloc(0);
  check(
    'Markdown prints to a PDF in the app',
    printed.subarray(0, 4).toString() === '%PDF' && printed.length > 1000,
  );

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
