import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { JobError } from '../jobs/types';
import { execFileSafe } from './exec';

/**
 * HEIC output goes through the Windows imaging API, because sharp's prebuilt libvips and the bundled
 * ffmpeg cannot write HEVC-based HEIF. It needs Microsoft's free "HEIF Image Extensions" package.
 * Paths travel in environment variables, never inside the script text.
 * [Guessing] on real hardware: this script follows the documented WinRT pattern but has not run on
 * Windows yet. The startup probe encodes a test image and hides the HEIC wedge if it does not work.
 */
export const HEIC_SCRIPT =
  String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` +
  '`' +
  String.raw`1'
})[0]
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
$inFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:CONVERT_IN)) ([Windows.Storage.StorageFile])
$inStream = Await ($inFile.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($inStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$outDir = Split-Path -Parent $env:CONVERT_OUT
$outName = Split-Path -Leaf $env:CONVERT_OUT
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($outDir)) ([Windows.Storage.StorageFolder])
$outFile = Await ($folder.CreateFileAsync($outName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
$outStream = Await ($outFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
$encoder = Await ([Windows.Graphics.Imaging.BitmapEncoder]::CreateAsync([Windows.Graphics.Imaging.BitmapEncoder]::HeifEncoderId, $outStream)) ([Windows.Graphics.Imaging.BitmapEncoder])
$encoder.SetSoftwareBitmap($bitmap)
$flush = [System.WindowsRuntimeSystemExtensions]::AsTask($encoder.FlushAsync())
$flush.Wait(-1) | Out-Null
$outStream.Dispose()
$inStream.Dispose()
`;

/** Encodes a PNG file as HEIC. Throws E_ENGINE_MISSING when the HEIF extension is not installed. */
export async function encodeHeic(
  pngPath: string,
  outPath: string,
  signal?: AbortSignal,
): Promise<void> {
  if (process.platform !== 'win32')
    throw new JobError('E_ENGINE_MISSING', 'HEIC output needs Windows');
  const res = await execFileSafe(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
    { signal, stdin: HEIC_SCRIPT, env: { CONVERT_IN: pngPath, CONVERT_OUT: outPath } },
  );
  const written = await stat(outPath)
    .then((s) => s.size)
    .catch(() => 0);
  if (res.code !== 0 || written === 0) {
    throw new JobError(
      'E_ENGINE_MISSING',
      'HEIC encoder (install "HEIF Image Extensions" from the Microsoft Store)',
    );
  }
}

let probed: Promise<boolean> | null = null;

/** Tries a real 8x8 encode once per run. Cached; never throws. */
export function heicEncoderAvailable(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  probed ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convert-heic-'));
    try {
      const png = join(dir, 'probe.png');
      await writeFile(
        png,
        await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
          .png()
          .toBuffer(),
      );
      await encodeHeic(png, join(dir, 'probe.heic'));
      return true;
    } catch {
      return false;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  })();
  return probed;
}
