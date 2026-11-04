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

async function launch(dir, extraArgs, seed) {
  const profile = mkdtempSync(join(tmpdir(), 'convert-profile-'));
  if (seed) seed(profile);
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
    'Recent',
    'Watch folders',
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
    if (process.env.SMOKE_SHOTS && ['Recent', 'Watch folders', 'General'].includes(page))
      await settings.screenshot({
        path: join(process.env.SMOKE_SHOTS, `page-${page.replace(/ /g, '-')}.png`),
      });
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
  writeFileSync(
    join(dir, 'fonts.html'),
    '<html><head><title>f</title></head><body><h1 style="font-family:\'Totally Missing Font\'">Hello Привет</h1></body></html>',
  );
  await job(`convert:pdf:${join(dir, 'fonts.html')}`);
  const fontPdf = existsSync(join(dir, 'fonts.pdf'))
    ? readFileSync(join(dir, 'fonts.pdf'), 'latin1')
    : '';
  check(
    'a font that is not installed becomes Inter in the PDF',
    /FontName \/\w+\+Inter/.test(fontPdf) && !/Missing/.test(fontPdf),
  );
  // A PDF whose page is a picture of text, and another whose page has text plus a picture holding more text.
  const picPdf = await PDFDocument.create();
  const shot = await sharp(Buffer.from(textSvg)).png().toBuffer();
  const mixed = picPdf.addPage([600, 400]);
  mixed.drawText('Native heading', { x: 30, y: 360, size: 18 });
  mixed.drawImage(await picPdf.embedPng(shot), { x: 20, y: 120, width: 560, height: 120 });
  picPdf
    .addPage([600, 400])
    .drawImage(await picPdf.embedPng(shot), { x: 20, y: 120, width: 560, height: 120 });
  writeFileSync(join(dir, 'pictures.pdf'), await picPdf.save());
  await job(`convert:txt:${join(dir, 'pictures.pdf')}`, 14000);
  const picText = existsSync(join(dir, 'pictures.txt'))
    ? readFileSync(join(dir, 'pictures.txt'), 'utf8')
    : '';
  check(
    'text inside pictures in a PDF is read, on text pages and scanned pages',
    /Native heading/.test(picText) && (picText.match(/HELLO/gi) ?? []).length === 2,
    JSON.stringify(picText.slice(0, 120)),
  );
  // Explorer's Send to menu runs `Convert.exe --convert <format> <files>`.
  writeFileSync(join(dir, 'sendto.png'), await sharp(Buffer.from(svg)).png().toBuffer());
  app = await launch(dir, ['--hidden', '--convert', 'webp', join(dir, 'sendto.png')]);
  await wait(4000);
  check('--convert converts the files it is given', existsSync(join(dir, 'sendto.webp')));
  await app.close();
  // The updater says plainly that it is idle in a development run.
  app = await launch(dir, [], (profile) => {
    const data = join(profile, '.config', 'Convert');
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'state.json'), JSON.stringify({ firstRunDone: true, history: [] }));
  });
  win = windowOf(app, 'settings.html');
  await win.getByRole('button', { name: 'Engines', exact: true }).click();
  await win.getByRole('button', { name: 'Run self-test' }).click();
  await win.getByText(/\d of 8 passed/).waitFor({ timeout: 90000 });
  const passed = await win.getByText(/\d of 8 passed/).innerText();
  if (process.env.SMOKE_SHOTS)
    await win.screenshot({ path: join(process.env.SMOKE_SHOTS, 'selftest.png') });
  // Every engine must work in the real app; only the Windows-only input hooks may fail on Linux.
  check('the self-test passes in the real app', /^(7|8) of 8 passed/.test(passed), passed);
  await win.getByRole('button', { name: 'About', exact: true }).click();
  await wait(800);
  check(
    'About shows the update status',
    (await win.getByText('Updates are only checked in the installed app.').count()) === 1,
  );
  await app.close();

  // The update progress bar and the "ready" button, with a pretend update (development builds only).
  for (const demo of ['downloading', 'ready']) {
    process.env.CONVERT_UPDATE_DEMO = demo;
    app = await launch(dir, [], (profile) => {
      const data = join(profile, '.config', 'Convert');
      mkdirSync(data, { recursive: true });
      writeFileSync(join(data, 'state.json'), JSON.stringify({ firstRunDone: true, history: [] }));
    });
    delete process.env.CONVERT_UPDATE_DEMO;
    win = windowOf(app, 'settings.html');
    await win.getByRole('button', { name: /^About/ }).click();
    await wait(800);
    if (demo === 'downloading') {
      const bar = win.getByRole('progressbar', { name: 'Update download' });
      check('the update shows a progress bar', (await bar.getAttribute('aria-valuenow')) === '42');
    } else {
      check(
        'a ready update offers Restart and update in the sidebar and on About',
        (await win.getByRole('button', { name: /Restart and update/ }).count()) === 2,
      );
    }
    if (process.env.SMOKE_SHOTS)
      await win.screenshot({ path: join(process.env.SMOKE_SHOTS, `update-${demo}.png`) });
    await app.close();
  }

  // Recent conversions: a history entry with a picture result shows a thumbnail and can be opened.
  app = await launch(dir, [], (profile) => {
    const data = join(profile, '.config', 'Convert');
    mkdirSync(data, { recursive: true });
    writeFileSync(
      join(data, 'state.json'),
      JSON.stringify({
        firstRunDone: true,
        recentFolders: [],
        floatDock: 'right',
        history: [
          {
            id: 'h1',
            name: 'a.png',
            output: join(dir, 'a.png'),
            input: join(dir, 'a.png'),
            op: 'png',
            at: Date.now() - 120000,
            count: 1,
          },
          {
            id: 'h2',
            name: 'gone.pdf',
            output: join(dir, 'gone.pdf'),
            input: join(dir, 'x.docx'),
            op: 'pdf',
            at: Date.now() - 86400000,
            count: 1,
          },
        ],
      }),
    );
  });
  win = windowOf(app, 'settings.html');
  await win.getByRole('button', { name: 'Recent', exact: true }).click();
  await wait(1200);
  check(
    'recent conversions lists the results with their age',
    (await win.getByText('2 min ago').count()) === 1 &&
      (await win.getByText('moved or deleted').count()) === 1,
  );
  check('a picture result shows a thumbnail', (await win.locator('main li img').count()) === 1);
  if (process.env.SMOKE_SHOTS)
    await win.screenshot({ path: join(process.env.SMOKE_SHOTS, 'recent-filled.png') });
  await app.close();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
