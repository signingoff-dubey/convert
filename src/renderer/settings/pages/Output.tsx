import { useState } from 'react';
import {
  Button,
  Dialog,
  PathField,
  SegmentedControl,
  Section,
  SettingRow,
  Slider,
  Switch,
} from '../../components/ui';
import { invoke } from '../../shared/api';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

export function Output() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  const [confirmRecycle, setConfirmRecycle] = useState(false);
  if (!s) return null;
  const o = s.output;
  return (
    <>
      <Section title="Where results go">
        <SettingRow label="Location" description="Results are saved here. Your original is kept.">
          <SegmentedControl
            label="Location"
            value={o.location}
            options={[
              { value: 'nextToSource', label: 'Next to source' },
              { value: 'custom', label: 'Custom folder' },
            ]}
            onChange={(v) => void save({ output: { location: v } })}
          />
        </SettingRow>
        {o.location === 'custom' && (
          <SettingRow label="Custom folder">
            <PathField
              value={o.customFolder}
              placeholder="Choose a folder"
              onPick={() =>
                void invoke('dialog:pick-folder').then((p) => {
                  if (p) void save({ output: { customFolder: p } });
                })
              }
              onClear={() => void save({ output: { customFolder: null } })}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Put results in a “Converted” subfolder"
          description="Created beside the source file."
        >
          <Switch
            label="Converted subfolder"
            checked={o.useConvertedSubfolder}
            onChange={(v) => void save({ output: { useConvertedSubfolder: v } })}
          />
        </SettingRow>
        <SettingRow
          label="If a name is taken"
          description="Convert never overwrites. It adds (1), (2) and so on."
        >
          <span className="text-sm text-muted">Number it</span>
        </SettingRow>
        <SettingRow
          label="Send the original to the Recycle Bin after a successful job"
          description="Off by default. Move is the only other thing that ever removes a source."
        >
          <Switch
            label="Recycle original"
            checked={o.recycleOriginal}
            onChange={(v) =>
              v ? setConfirmRecycle(true) : void save({ output: { recycleOriginal: false } })
            }
          />
        </SettingRow>
      </Section>
      <Section title="Quality">
        <SettingRow label="Image quality" description="Used for JPG, WebP, AVIF and TIFF.">
          <Slider
            label="Image quality"
            value={o.imageQuality}
            min={40}
            max={100}
            onChange={(v) => void save({ output: { imageQuality: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Compress target"
          description="Aim for this percentage of the original size."
        >
          <Slider
            label="Compress target"
            value={o.compressTargetPercent}
            min={10}
            max={90}
            format={(v) => `${v}%`}
            onChange={(v) => void save({ output: { compressTargetPercent: v } })}
          />
        </SettingRow>
        <SettingRow label="Resize preset" description="Used when a tool resizes without asking.">
          <SegmentedControl
            label="Resize preset"
            value={o.resizePreset}
            options={[
              { value: '50%', label: '50%' },
              { value: '75%', label: '75%' },
              { value: '1080p', label: '1080p' },
              { value: '720p', label: '720p' },
            ]}
            onChange={(v) => void save({ output: { resizePreset: v } })}
          />
        </SettingRow>
      </Section>
      <Section title="Feedback">
        <SettingRow label="Toast position">
          <SegmentedControl
            label="Toast position"
            value={o.toastPosition}
            options={[
              { value: 'bottomRight', label: 'Bottom right' },
              { value: 'bottomLeft', label: 'Bottom left' },
              { value: 'topRight', label: 'Top right' },
            ]}
            onChange={(v) => void save({ output: { toastPosition: v } })}
          />
        </SettingRow>
        <SettingRow label="Toast duration">
          <Slider
            label="Toast duration"
            value={o.toastSeconds}
            min={2}
            max={15}
            format={(v) => `${v}s`}
            onChange={(v) => void save({ output: { toastSeconds: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Progress ring at the pointer"
          description="A small ring with the percentage follows your pointer while a job that takes more than a moment runs."
        >
          <Switch
            label="Progress ring at the pointer"
            checked={o.cursorLoader}
            onChange={(v) => void save({ output: { cursorLoader: v } })}
          />
        </SettingRow>
        <SettingRow label="Terminal" description="Used by the Terminal file action.">
          <SegmentedControl
            label="Terminal"
            value={o.preferredShell}
            options={[
              { value: 'wt', label: 'Windows Terminal' },
              { value: 'powershell', label: 'PowerShell' },
              { value: 'cmd', label: 'Command Prompt' },
            ]}
            onChange={(v) => void save({ output: { preferredShell: v } })}
          />
        </SettingRow>
      </Section>
      {confirmRecycle && (
        <Dialog
          title="Send originals to the Recycle Bin?"
          onClose={() => setConfirmRecycle(false)}
          actions={
            <>
              <Button onClick={() => setConfirmRecycle(false)}>Keep originals</Button>
              <Button
                variant="primary"
                onClick={() => {
                  void save({ output: { recycleOriginal: true } });
                  setConfirmRecycle(false);
                }}
              >
                Turn on
              </Button>
            </>
          }
        >
          After every successful conversion, the source file goes to the Recycle Bin, where you can
          restore it. Convert never deletes anything permanently.
        </Dialog>
      )}
    </>
  );
}
