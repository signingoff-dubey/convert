import { Callout, SegmentedControl, Section, SettingRow, Switch } from '../../components/ui';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

export function General() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  if (!s) return null;
  return (
    <>
      <Section title="Startup">
        <SettingRow
          label="Start with Windows"
          description="Convert runs quietly in the tray after you sign in."
        >
          <Switch
            label="Start with Windows"
            checked={s.general.startWithWindows}
            onChange={(v) => void save({ general: { startWithWindows: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Keep running in the background"
          description="Closing this window leaves Convert in the tray, so the shortcuts and the wheel keep working. Turn off to quit when the window closes."
        >
          <Switch
            label="Keep running in the background"
            checked={s.general.runInBackground}
            onChange={(v) => void save({ general: { runInBackground: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Add to the right-click Send to menu"
          description="Adds “Convert to PDF”, PNG, JPG, WebP, MP3, MP4 and text under Send to in Explorer's right-click menu (Show more options on Windows 11). Works on a whole selection."
        >
          <Switch
            label="Add to the Send to menu"
            checked={s.general.sendTo}
            onChange={(v) => void save({ general: { sendTo: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Update automatically"
          description="Checks GitHub for a newer version when you are online, downloads it quietly, and installs it when Convert is not busy. No prompts. Turn off to update by hand."
        >
          <Switch
            label="Update automatically"
            checked={s.general.autoUpdate}
            onChange={(v) => void save({ general: { autoUpdate: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Drag pictures from web browsers"
          description="Drag a picture, or a video or PDF link, out of Chrome, Edge, Firefox or Brave onto the wheel. Convert saves it in your Downloads folder first, then converts, compresses or shares it like any other file."
        >
          <Switch
            label="Drag pictures from web browsers"
            checked={s.general.dragFromBrowsers}
            onChange={(v) => void save({ general: { dragFromBrowsers: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Browser for sharing"
          description="Share opens the app when it is installed. Otherwise it brings forward a browser window that already has the site open, or opens the site in this browser. Pick the one you are signed in to."
        >
          <SegmentedControl
            label="Browser for sharing"
            value={s.general.shareBrowser}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'chrome', label: 'Chrome' },
              { value: 'edge', label: 'Edge' },
              { value: 'firefox', label: 'Firefox' },
              { value: 'brave', label: 'Brave' },
            ]}
            onChange={(v) => void save({ general: { shareBrowser: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Show tray icon"
          description="Always on in v1, so Convert is never hidden with no way to reach it."
        >
          <Switch label="Show tray icon" checked disabled onChange={() => undefined} />
        </SettingRow>
      </Section>
      <Section title="Where the wheel appears">
        <SettingRow
          label="Limit to Explorer and Desktop"
          description="The wheel only opens when you drag from File Explorer or the Desktop. Turn off to allow other apps (drops with no file path are ignored)."
        >
          <Switch
            label="Limit to Explorer and Desktop"
            checked={s.general.limitToExplorerAndDesktop}
            onChange={(v) => void save({ general: { limitToExplorerAndDesktop: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Pause Convert"
          description="Removes the global hooks completely while paused."
        >
          <Switch
            label="Pause Convert"
            checked={s.general.paused}
            onChange={(v) => void save({ general: { paused: v } })}
          />
        </SettingRow>
      </Section>
      <Section title="Language">
        <SettingRow label="Language" description="English only in this version.">
          <select
            disabled
            className="rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm opacity-60"
            aria-label="Language"
          >
            <option>English</option>
          </select>
        </SettingRow>
      </Section>
      <Callout>
        Nothing is ever uploaded. Convert has no network code, no telemetry and no update checks.
      </Callout>
    </>
  );
}
