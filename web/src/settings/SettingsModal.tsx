import { h } from 'preact';
import { ControllerSettings, DEFAULT_SETTINGS } from '../protocol/types';

interface SettingsModalProps {
  settings: ControllerSettings;
  onUpdate: (newSettings: ControllerSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onUpdate, onClose }: SettingsModalProps) {
  const update = <K extends keyof ControllerSettings>(key: K, val: ControllerSettings[K]) => {
    const updated = { ...settings, [key]: val };
    onUpdate(updated);
  };

  const handleReset = () => {
    onUpdate({ ...DEFAULT_SETTINGS });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Controller Settings</h2>
          <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Stick Deadzone</div>
            <div className="setting-desc">Ignore micro-movements near center ({Math.round(settings.stickDeadzone * 100)}%)</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="range"
              min="0"
              max="0.25"
              step="0.01"
              value={settings.stickDeadzone}
              onInput={(e) => update('stickDeadzone', parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Stick Sensitivity</div>
            <div className="setting-desc">Analog output multiplier ({settings.stickSensitivity.toFixed(2)}x)</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={settings.stickSensitivity}
              onInput={(e) => update('stickSensitivity', parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Invert Left Y-Axis</div>
            <div className="setting-desc">Flip vertical direction on Left Stick</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="checkbox"
              checked={settings.invertYLeft}
              onChange={(e) => update('invertYLeft', (e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Invert Right Y-Axis</div>
            <div className="setting-desc">Flip vertical direction on Right Stick (Camera)</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="checkbox"
              checked={settings.invertYRight}
              onChange={(e) => update('invertYRight', (e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Southpaw Layout</div>
            <div className="setting-desc">Swap Left & Right analog stick positions</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="checkbox"
              checked={settings.southpaw}
              onChange={(e) => update('southpaw', (e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Trigger Mode</div>
            <div className="setting-desc">Analog touch-drag vs Instant Hair-trigger</div>
          </div>
          <div className="setting-ctrl">
            <select
              value={settings.triggerMode}
              onChange={(e) => update('triggerMode', (e.target as HTMLSelectElement).value as any)}
              style={{
                background: 'var(--bg-control)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-control)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px'
              }}
            >
              <option value="analog">Analog Drag</option>
              <option value="hair">Instant Hair Trigger</option>
            </select>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Button Opacity</div>
            <div className="setting-desc">Contrast level ({Math.round(settings.buttonOpacity * 100)}%)</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.05"
              value={settings.buttonOpacity}
              onInput={(e) => update('buttonOpacity', parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Haptic Vibration</div>
            <div className="setting-desc">Touch tactile feedback on Android</div>
          </div>
          <div className="setting-ctrl">
            <input
              type="checkbox"
              checked={settings.hapticsEnabled}
              onChange={(e) => update('hapticsEnabled', (e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
          <button className="btn btn-secondary" onClick={handleReset}>
            Reset Defaults
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
