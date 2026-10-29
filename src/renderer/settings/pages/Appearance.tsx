import { SegmentedControl, Section, SettingRow, Slider, SwatchRow } from '../../components/ui';
import { WheelPreview } from '../../components/WheelPreview';
import { useSettings } from '../../shared/store';
import { usePatch } from '../SavedContext';

export function Appearance() {
  const s = useSettings((x) => x.settings);
  const save = usePatch();
  if (!s) return null;
  const a = s.appearance;
  const prefs = { order: s.wheels.order, disabled: s.wheels.disabled };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        <Section title="Theme">
          <SettingRow label="Theme">
            <SegmentedControl
              label="Theme"
              value={a.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'graphite', label: 'Graphite' },
                { value: 'paper', label: 'Paper' },
                { value: 'midnight', label: 'Midnight' },
              ]}
              onChange={(v) => void save({ appearance: { theme: v } })}
            />
          </SettingRow>
          <SettingRow label="Accent colour">
            <SwatchRow
              value={a.accent}
              onChange={(hex) => void save({ appearance: { accent: hex } })}
            />
          </SettingRow>
        </Section>
        <Section title="Wheel">
          <SettingRow label="Style" description="Solid is the fastest on older graphics cards.">
            <SegmentedControl
              label="Wheel style"
              value={a.wheelStyle}
              options={[
                { value: 'glass', label: 'Glass' },
                { value: 'solid', label: 'Solid' },
                { value: 'outline', label: 'Outline' },
              ]}
              onChange={(v) => void save({ appearance: { wheelStyle: v } })}
            />
          </SettingRow>
          <SettingRow label="Size">
            <SegmentedControl
              label="Wheel size"
              value={a.wheelSize}
              options={[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Medium' },
                { value: 'l', label: 'Large' },
              ]}
              onChange={(v) => void save({ appearance: { wheelSize: v } })}
            />
          </SettingRow>
          <SettingRow label="Opacity">
            <Slider
              label="Wheel opacity"
              value={a.wheelOpacity}
              min={0.5}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => void save({ appearance: { wheelOpacity: v } })}
            />
          </SettingRow>
          <SettingRow
            label="Animations"
            description="Reduced and Off also follow the Windows setting."
          >
            <SegmentedControl
              label="Animations"
              value={a.animations}
              options={[
                { value: 'full', label: 'Full' },
                { value: 'reduced', label: 'Reduced' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => void save({ appearance: { animations: v } })}
            />
          </SettingRow>
        </Section>
      </div>
      <div className="sticky top-0 self-start rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 text-center text-xs uppercase tracking-wide text-muted">
          Live preview
        </div>
        <WheelPreview
          wheel="convert"
          category="image"
          style={a.wheelStyle}
          opacity={a.wheelOpacity}
          prefs={prefs}
          size={260}
        />
        <p className="mt-2 text-center text-xs text-muted">Hover the wheel to try it.</p>
      </div>
    </div>
  );
}
