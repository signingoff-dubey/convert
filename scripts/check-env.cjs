// Looks at what is already installed and built, prints a table, and exits with a code that says what is missing.
// setup.bat uses the code to install only what is needed. Run: node scripts/check-env.cjs [--quiet]
//   exit code bits: 1 packages missing, 2 downloads missing (ffmpeg or Electron), 4 build missing or out of date,
//                   8 Node.js too old, 16 a native module does not load
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXIT = { PACKAGES: 1, DOWNLOADS: 2, BUILD: 4, TOOLS: 8, NATIVE: 16 };

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

function newestMtime(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

/**
 * Inspects `root` and returns { items, code }. Pure apart from reading files, so it can be tested with a fake folder.
 * items: { id, label, status: 'ok' | 'missing' | 'outdated' | 'pending' | 'info', detail }
 */
function inspect(root, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const items = [];
  let code = 0;
  const add = (id, label, status, detail = '', flag = 0) => {
    items.push({ id, label, status, detail });
    if (status === 'missing' || status === 'outdated') code |= flag;
  };

  const major = Number.parseInt(nodeVersion, 10);
  add(
    'node',
    'Node.js 20 or newer',
    major >= 20 ? 'ok' : 'missing',
    `found ${nodeVersion}`,
    EXIT.TOOLS,
  );
  add(
    'npm',
    'npm',
    opts.npmVersion ? 'ok' : 'missing',
    opts.npmVersion ? `found ${opts.npmVersion}` : 'not found',
    EXIT.TOOLS,
  );

  let pkg = { dependencies: {}, devDependencies: {} };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    // Reported below as missing packages.
  }
  const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const nm = path.join(root, 'node_modules');
  const missing = wanted.filter((n) => !exists(path.join(nm, n, 'package.json')));
  const packagesOk = wanted.length > 0 && missing.length === 0;
  add(
    'packages',
    `Packages (${wanted.length})`,
    packagesOk ? 'ok' : 'missing',
    packagesOk
      ? 'all installed'
      : exists(nm)
        ? `${missing.length} missing, for example ${missing.slice(0, 3).join(', ')}`
        : 'not installed yet',
    EXIT.PACKAGES,
  );

  const exe = platform === 'win32' ? '.exe' : '';
  const downloads = [
    [
      'electron',
      'Electron app shell',
      path.join(nm, 'electron', 'dist', platform === 'win32' ? 'electron.exe' : 'electron'),
    ],
    ['ffmpeg', 'ffmpeg (audio and video)', path.join(nm, 'ffmpeg-static', `ffmpeg${exe}`)],
  ];
  for (const [id, label, file] of downloads) {
    if (!packagesOk) add(id, label, 'pending', 'checked after packages');
    else
      add(
        id,
        label,
        exists(file) ? 'ok' : 'missing',
        exists(file) ? 'downloaded' : 'not downloaded',
        EXIT.DOWNLOADS,
      );
  }
  const sevenDir = { win32: 'win', darwin: 'mac', linux: 'linux' }[platform] ?? 'linux';
  const seven = path.join(nm, '7zip-bin', sevenDir, arch === 'ia32' ? 'ia32' : arch, `7za${exe}`);
  if (!packagesOk) add('7zip', '7-Zip (archives)', 'pending', 'checked after packages');
  else
    add(
      '7zip',
      '7-Zip (archives)',
      exists(seven) ? 'ok' : 'missing',
      exists(seven) ? 'bundled' : 'not in the package',
      EXIT.PACKAGES,
    );

  if (!packagesOk || opts.tryLoad === false) {
    add(
      'native',
      'Input hook and Windows bridge',
      'pending',
      packagesOk ? 'not tested' : 'checked after packages',
    );
  } else if (platform !== 'win32') {
    // The global hook and the Win32 bridge only exist on Windows; loading them elsewhere proves nothing.
    add('native', 'Input hook and Windows bridge', 'pending', 'only used on Windows');
  } else {
    // Loaded in a child process, so a crash inside a native module cannot take this check down with it.
    let problem = '';
    for (const name of ['uiohook-napi', 'koffi']) {
      const probe = spawnSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(path.join(nm, name))})`],
        { encoding: 'utf8', timeout: 20000 },
      );
      if (probe.status !== 0) {
        problem = `${name}: ${String(probe.stderr || probe.error || 'failed to load')
          .split('\n')
          .find(Boolean)}`;
        break;
      }
    }
    add(
      'native',
      'Input hook and Windows bridge',
      problem ? 'missing' : 'ok',
      problem || 'both load',
      EXIT.NATIVE,
    );
  }

  const built = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/settings.html'].map(
    (f) => path.join(root, f),
  );
  if (!built.every(exists)) {
    add('build', 'Built app', 'missing', 'not built yet', EXIT.BUILD);
  } else {
    const oldestBuild = Math.min(...built.map((f) => fs.statSync(f).mtimeMs));
    const newestSource = Math.max(
      newestMtime(path.join(root, 'src')),
      exists(path.join(root, 'package.json'))
        ? fs.statSync(path.join(root, 'package.json')).mtimeMs
        : 0,
    );
    if (newestSource > oldestBuild + 1000)
      add('build', 'Built app', 'outdated', 'the source changed after the last build', EXIT.BUILD);
    else add('build', 'Built app', 'ok', 'up to date');
  }

  const office = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
    .filter(Boolean)
    .map((r) => path.join(r, 'LibreOffice', 'program', 'soffice.exe'))
    .find(exists);
  add(
    'office',
    'LibreOffice (optional)',
    'info',
    office ? 'found' : 'not found: PDF export from documents, slides and spreadsheets stays hidden',
  );

  return { items, code };
}

const MARK = {
  ok: '[ ok ]',
  missing: '[ -- ]',
  outdated: '[old ]',
  pending: '[ .. ]',
  info: '[ i  ]',
};

function render(items) {
  return items.map((i) => `  ${MARK[i.status]} ${i.label.padEnd(34)} ${i.detail}`).join('\n');
}

function main() {
  const quiet = process.argv.includes('--quiet');
  const npm = spawnSync('npm', ['-v'], { shell: true, encoding: 'utf8' });
  const npmVersion = npm.status === 0 ? npm.stdout.trim() : null;
  const { items, code } = inspect(path.join(__dirname, '..'), { npmVersion });
  if (!quiet) {
    console.log(render(items));
    console.log('');
  }
  process.exit(code);
}

if (require.main === module) main();

module.exports = { inspect, render, EXIT };
